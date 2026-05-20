package com.example.devicemonitor

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration

class BluetoothMonitorService : Service() {

    private lateinit var auth: FirebaseAuth
    private lateinit var db: FirebaseFirestore
    private var bluetoothAdapter: BluetoothAdapter? = null
    
    // 省電力・メモリ消費削減のためのローカルキャッシュ
    private var lastSentPowerState: Boolean? = null
    private var lastSentConnectedState: Boolean? = null
    private var lastSentDevicesList: List<Map<String, Any>>? = null
    private var lastSyncTimestamp: Long = 0L
    private val FORCE_SYNC_INTERVAL = 30 * 60 * 1000L // 30分に一度は状態に変化がなくとも生存報告として強制同期

    // 遅延一括処理（デバウンス）のためのハンドラーとタスク
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private var syncRunnable: Runnable? = null

    // Firestore 監視リスナーの登録オブジェクト（サービス終了時にクローズしてメモリ漏れを防ぐため）
    private var firestoreListener: ListenerRegistration? = null

    private val CHANNEL_ID = "BluetoothMonitorChannel"
    private val NOTIFICATION_ID = 2026520

    // Bluetoothの物理状態検知、カップルされた接続機器状態の変更キャッチ用レシーバー
    private val bluetoothReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val action = intent.action
            if (action == BluetoothAdapter.ACTION_CONNECTION_STATE_CHANGED ||
                action == BluetoothAdapter.ACTION_STATE_CHANGED ||
                action == BluetoothDevice.ACTION_ACL_CONNECTED ||
                action == BluetoothDevice.ACTION_ACL_DISCONNECTED) {
                
                // 【省電力・遅延一括制御】5秒のデバウンスを設定。イベント連続発生時の電波放射・通信過多を極小化する
                scheduleDelayedSync(5000L)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        auth = FirebaseAuth.getInstance()
        db = FirebaseFirestore.getInstance()
        bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()

        // 1. 常駐サービスのための通知チャンネル作成
        createNotificationChannel()

        // 2. ブロードキャストレシーバーの登録（Bluetooth状態変化の監視）
        val filter = IntentFilter().apply {
            addAction(BluetoothAdapter.ACTION_CONNECTION_STATE_CHANGED)
            addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
            addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
            addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
        }
        registerReceiver(bluetoothReceiver, filter)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // 常駐型表示の通知（フォアグラウンドサービス）を構築
        val notification = buildForegroundNotification()
        
        // フォアグラウンドの開始
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Android 14等では、Connected Device関連のバックグラウンドタスクを指定
            startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // 初期段階の同期
        syncBluetoothStatusToFirebase()

        // Webダッシュボードからのリモート指令（電源ON/OFF、特定機器切断）をリアルタイム購読
        startListeningToRemoteCommands()

        // システムから突然キルされた場合でも、極力自動復旧させるSTART_STICKYを返却します
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        // 遅延キューのキャンセルをして完全にメモリリークを防ぐ
        syncRunnable?.let { handler.removeCallbacks(it) }
        // ブロードキャストレシーバーのアンレジスタ
        unregisterReceiver(bluetoothReceiver)
        // リモートリスナーの解除
        firestoreListener?.remove()
    }

    // --- 省電力のための遅延一括更新（デバウンス処理）の実装 ---
    private fun scheduleDelayedSync(delayMillis: Long) {
        syncRunnable?.let { handler.removeCallbacks(it) }
        syncRunnable = Runnable {
            syncBluetoothStatusToFirebase()
        }
        handler.postDelayed(syncRunnable!!, delayMillis)
    }

    // --- FIREBASE 同期・トランザクション処理 ---
    private fun syncBluetoothStatusToFirebase() {
        val currentUser = auth.currentUser ?: return
        
        // Android ID を一意のドキュメントキーとして使用
        @SuppressLint("HardwareIds")
        val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: return
        val deviceName = Build.MODEL ?: "Android Device"

        val adapter = bluetoothAdapter
        val currentConnectedList = ArrayList<Map<String, Any>>()
        var isConnected = false

        // Bluetooth接続権限チェック (Android 12+)
        val hasBtConnectPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

        if (hasBtConnectPermission && adapter != null && adapter.isEnabled) {
            val bondedDevices = adapter.bondedDevices
            for (device in bondedDevices) {
                try {
                    // リフレクションを用いて物理接続されているかを正確にチェック
                    val isDeviceConnected = device.javaClass.getMethod("isConnected").invoke(device) as Boolean
                    if (isDeviceConnected) {
                        isConnected = true
                        
                        // 主要デバイス種別の分類
                        val majorClass = device.bluetoothClass?.majorDeviceClass
                        val typeText = when (majorClass) {
                            android.bluetooth.BluetoothClass.Device.Major.AUDIO_VIDEO -> "AUDIO"
                            android.bluetooth.BluetoothClass.Device.Major.COMPUTER -> "COMPUTER"
                            android.bluetooth.BluetoothClass.Device.Major.PHONE -> "PHONE"
                            android.bluetooth.BluetoothClass.Device.Major.WEARABLE -> "WEARABLE"
                            android.bluetooth.BluetoothClass.Device.Major.TOY -> "TOY"
                            android.bluetooth.BluetoothClass.Device.Major.HEALTH -> "HEALTH"
                            else -> "OTHER"
                        }

                        currentConnectedList.add(hashMapOf(
                            "name" to (device.name ?: "Unknown Device"),
                            "address" to device.address,
                            "type" to typeText,
                            "isConnected" to true
                        ))
                    }
                } catch (e: Exception) {
                    // 例外時のフォールバック処理
                }
            }
        }

        val isPowerOn = adapter?.isEnabled == true
        val currentTime = System.currentTimeMillis()

        // 【省電力 & 省トラフィック最適化】状態変化が無ければ同期をスキップ
        val isStateUnchanged = (lastSentPowerState == isPowerOn) &&
                (lastSentConnectedState == isConnected) &&
                areDeviceListsIdentical(lastSentDevicesList, currentConnectedList)

        val isWithinSyncInterval = (currentTime - lastSyncTimestamp) < FORCE_SYNC_INTERVAL

        if (isStateUnchanged && isWithinSyncInterval) {
            // 前回の同期から状態変化がなく、10分未満であれば処理をスキップしてCPUやバッテリーへの負荷をほぼゼロ化
            return
        }

        val docRef = db.collection("devices").document(deviceId)

        // トランザクション処理を利用して、履歴 (allDevices) をマージ
        db.runTransaction { transaction ->
            val snapshot = transaction.get(docRef)
            
            // 既存の履歴リストの取得
            val existingAllDevices = snapshot.get("allDevices") as? List<Map<String, Any>> ?: emptyList()
            
            // 迅速な加工・マージのためMACアドレスをキーにしたMapに再構築
            val historicalMap = HashMap<String, MutableMap<String, Any>>()
            for (item in existingAllDevices) {
                val address = item["address"] as? String ?: continue
                historicalMap[address] = HashMap(item)
            }

            // 1. 現在接続されているデバイスのアクティブ更新
            for (active in currentConnectedList) {
                val addr = active["address"] as String
                val ex = historicalMap[addr]
                if (ex == null) {
                    // 今日新しく検知された最初のペアリングデバイス
                    historicalMap[addr] = hashMapOf(
                        "name" to active["name"]!!,
                        "address" to addr,
                        "type" to active["type"]!!,
                        "firstConnectedAt" to currentTime,
                        "lastConnectedAt" to currentTime,
                        "isConnected" to true
                    )
                } else {
                    // 以前接続された履歴が残っており、今再びオンラインのデバイス
                    ex["lastConnectedAt"] = currentTime
                    ex["isConnected"] = true
                }
            }

            // 2. 昨日接続されていて、今オフラインになったデバイスのステータス遷移マージ
            for ((addr, histItem) in historicalMap) {
                val stillConnected = currentConnectedList.any { it["address"] == addr }
                if (!stillConnected) {
                    val wasConnected = histItem["isConnected"] as? Boolean ?: false
                    if (wasConnected) {
                        // 接続中フラグが残っているが切断されているため、最終切断時刻を記録
                        histItem["lastDisconnectedAt"] = currentTime
                        histItem["isConnected"] = false
                    }
                }
            }

            val finalAllDevices = historicalMap.values.toList()

            // Firebaseのドキュメントへ一括書き込み
            val docData = hashMapOf(
                "userId" to currentUser.uid,
                "deviceName" to deviceName,
                "bluetoothConnected" to isConnected,
                "bluetoothPoweredOn" to isPowerOn,
                "connectedDevices" to currentConnectedList,
                "allDevices" to finalAllDevices,
                "lastUpdated" to FieldValue.serverTimestamp()
            )
            
            transaction.set(docRef, docData, com.google.firebase.firestore.SetOptions.merge())
        }.addOnSuccessListener {
            // 同期成功したらローカルキャッシュを更新して再送信を抑制
            lastSentPowerState = isPowerOn
            lastSentConnectedState = isConnected
            lastSentDevicesList = currentConnectedList
            lastSyncTimestamp = currentTime
        }.addOnFailureListener {
            // 同期エラー
        }
    }

    private fun areDeviceListsIdentical(list1: List<Map<String, Any>>?, list2: List<Map<String, Any>>): Boolean {
        if (list1 == null) return false
        if (list1.size != list2.size) return false
        
        val addresses1 = list1.mapNotNull { it["address"] as? String }.sorted()
        val addresses2 = list2.mapNotNull { it["address"] as? String }.sorted()
        return addresses1 == addresses2
    }

    // --- WEB UI からのリモート指示のリッスン&制御実行 ---
    private fun startListeningToRemoteCommands() {
        val currentUser = auth.currentUser ?: return
        @SuppressLint("HardwareIds")
        val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: return
        val docRef = db.collection("devices").document(deviceId)

        firestoreListener = docRef.addSnapshotListener { snapshot, e ->
            if (e != null || snapshot == null || !snapshot.exists()) return@addSnapshotListener

            val hasBtConnectPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
            } else {
                true
            }

            if (!hasBtConnectPermission) return@addSnapshotListener

            // 1. Bluetooth電源オン・オフ同期要求の処理
            val adapter = bluetoothAdapter
            if (adapter != null) {
                val requestedPower = snapshot.getBoolean("requestBluetoothPower")
                if (requestedPower != null) {
                    val currentPower = adapter.isEnabled
                    if (requestedPower != currentPower) {
                        try {
                            if (requestedPower) {
                                adapter.enable()
                            } else {
                                adapter.disable()
                            }
                        } catch (ex: Exception) {
                            // 安全のためキャッチ
                        }
                    }
                }
            }

            // 2. WEB側から受け取った「Bluetooth特定周辺機器の切断要求(disconnectRequests)」の遂行
            val disconnectRequests = snapshot.get("disconnectRequests") as? List<String>
            if (disconnectRequests != null && disconnectRequests.isNotEmpty() && adapter != null && adapter.isEnabled) {
                processRemoteDisconnectRequests(disconnectRequests, docRef)
            }
        }
    }

    private fun processRemoteDisconnectRequests(addresses: List<String>, docRef: com.google.firebase.firestore.DocumentReference) {
        val adapter = bluetoothAdapter ?: return
        val bondedDevices = adapter.bondedDevices
        var processedAny = false

        for (address in addresses) {
            val device = bondedDevices.find { it.address == address }
            if (device != null) {
                try {
                    // ※ ペアリング解除(removeBond)のネイティブAPI記述例
                    val method = device.javaClass.getMethod("removeBond")
                    method.invoke(device)
                    processedAny = true
                } catch (ex: Exception) {
                    // 切断またはペアリング解除エラー
                }
            }
        }

        if (processedAny) {
            // 処理要求が完了したら、Firestoreの指令リスト「disconnectRequests」を完全にクリア・空配列にします
            docRef.update("disconnectRequests", FieldValue.delete())
                .addOnSuccessListener {
                    // アンドロイド通知などに反映して即座に完了をお知らせする
                    syncBluetoothStatusToFirebase()
                }
        }
    }

    // --- FOREGROUND SERVICE NOTIFICATION UTILS ---
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Bluetooth Link 同期サービス"
            val descriptionText = "バックグラウンドで周辺機器の連携状態を即時監視するシステム"
            val importance = NotificationManager.IMPORTANCE_LOW // ピピッとならないサイレントな常駐表示
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(): Notification {
        // 通知タップ時にMainActivityを開くアクションを内包
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Bluetooth Link Sync Active")
            .setContentText("スマートフォンのBluetooth接続状況をダッシュボードに常時送信しています...")
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth) // デフォルトの青いステータス通知アイコンを使用
            .setContentIntent(pendingIntent)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOngoing(true)
            .build()
    }
}
