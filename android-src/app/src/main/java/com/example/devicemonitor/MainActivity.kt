package com.example.devicemonitor

import android.Manifest
import android.annotation.SuppressLint
import android.app.ActivityManager
import android.content.ClipboardManager
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import androidx.core.content.ContextCompat
import com.bumptech.glide.Glide
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider

class MainActivity : AppCompatActivity() {

    private lateinit var auth: FirebaseAuth
    private lateinit var googleSignInClient: GoogleSignInClient

    // XML UI要素の参照
    private lateinit var profileImageView: ImageView
    private lateinit var authUserName: TextView
    private lateinit var authUserStatus: TextView
    private lateinit var btnGoogleLogin: Button
    private lateinit var switchService: SwitchCompat
    private lateinit var serviceStatusText: TextView
    private lateinit var deviceIdText: TextView
    private lateinit var btnCopyDeviceId: ImageView
    private lateinit var permissionBluetoothStatus: TextView
    private lateinit var permissionNotificationStatus: TextView
    private lateinit var btnGrantPermissions: Button

    // パーミッション一括リクエストランチャー
    private val requestPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        updatePermissionStatusUI()
        if (permissions.values.all { it }) {
            Toast.makeText(this, "すべての必要な権限が許可されました", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this, "一部の権限が拒否されました。設定より有効にしてください", Toast.LENGTH_LONG).show()
        }
    }

    // Google Sign-In 連携結果ランチャー
    private val googleSignInLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
            try {
                val account = task.getResult(ApiException::class.java)!!
                val credential = GoogleAuthProvider.getCredential(account.idToken, null)
                auth.signInWithCredential(credential)
                    .addOnCompleteListener(this) { authResult ->
                        if (authResult.isSuccessful) {
                            Toast.makeText(this, "Googleアカウントでの接続に成功しました", Toast.LENGTH_SHORT).show()
                            updateAuthUI()
                            restartMonitorServiceIfRunning()
                        } else {
                            Toast.makeText(this, "認証エラーが発生しました", Toast.LENGTH_SHORT).show()
                        }
                    }
            } catch (e: ApiException) {
                Toast.makeText(this, "Googleサインインに失敗しました (${e.statusCode})", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Webアプリと完全に紐付けるFirebase Authenticationのセットアップ
        auth = FirebaseAuth.getInstance()

        // Google SignIn 設定
        // ※ 実際の運用時には Firebase Console -> Web APIキーが必要になります
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(getString(R.string.default_web_client_id_placeholder)) // strings.xml等で定義します
            .requestEmail()
            .build()
        googleSignInClient = GoogleSignIn.getClient(this, gso)

        // ビュー初期化
        initViews()

        // クリックイベントリスナー登録
        setupListeners()

        // 匿名 or Google 既存セッションログイン処理
        authenticateUser()

        // パーミッション状況反映
        updatePermissionStatusUI()

        // デバイス固有ID(ANDROID_ID)の取得・表示
        showDeviceIdentifier()

        // サービスの実行中状態確認 & UIトグル更新
        updateServiceToggleState()
    }

    private fun initViews() {
        profileImageView = findViewById(R.id.profileImageView)
        authUserName = findViewById(R.id.authUserName)
        authUserStatus = findViewById(R.id.authUserStatus)
        btnGoogleLogin = findViewById(R.id.btnGoogleLogin)
        switchService = findViewById(R.id.switchService)
        serviceStatusText = findViewById(R.id.serviceStatusText)
        deviceIdText = findViewById(R.id.deviceIdText)
        btnCopyDeviceId = findViewById(R.id.btnCopyDeviceId)
        permissionBluetoothStatus = findViewById(R.id.permissionBluetoothStatus)
        permissionNotificationStatus = findViewById(R.id.permissionNotificationStatus)
        btnGrantPermissions = findViewById(R.id.btnGrantPermissions)
    }

    private fun setupListeners() {
        // デバイスIDのコピー
        btnCopyDeviceId.setOnClickListener {
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("Device ID", deviceIdText.text)
            clipboard.setPrimaryClip(clip)
            Toast.makeText(this, "デバイスIDをクリップボードにコピーしました", Toast.LENGTH_SHORT).show()
        }

        // 権限要求
        btnGrantPermissions.setOnClickListener {
            requestRequiredPermissions()
        }

        // Googleログイン
        btnGoogleLogin.setOnClickListener {
            if (auth.currentUser?.isAnonymous == false) {
                // すでにGoogleログイン済みならログアウトして匿名に切り替え
                auth.signOut()
                googleSignInClient.signOut().addOnCompleteListener {
                    authenticateUser()
                }
            } else {
                val intent = googleSignInClient.signInIntent
                googleSignInLauncher.launch(intent)
            }
        }

        // 監視リアルタイムサービス起動・停止トグル
        switchService.setOnCheckedChangeListener { _, isChecked ->
            if (isChecked) {
                // 権限チェック
                if (!hasRequiredPermissions()) {
                    switchService.isChecked = false
                    Toast.makeText(this, "サービスを開始する前に必要な権限をすべて許可してください", Toast.LENGTH_LONG).show()
                    requestRequiredPermissions()
                    return@setOnCheckedChangeListener
                }
                startBluetoothMonitorService()
            } else {
                stopBluetoothMonitorService()
            }
        }
    }

    private fun authenticateUser() {
        val currentUser = auth.currentUser
        if (currentUser == null) {
            // シームレスに利用するため、初回は匿名ログインを自動実行
            auth.signInAnonymously().addOnCompleteListener(this) { task ->
                if (task.isSuccessful) {
                    updateAuthUI()
                } else {
                    Toast.makeText(this, "Firebase接続に失敗しました。接続状態をご確認ください", Toast.LENGTH_LONG).show()
                }
            }
        } else {
            updateAuthUI()
        }
    }

    private fun updateAuthUI() {
        val user = auth.currentUser ?: return
        if (user.isAnonymous) {
            authUserName.text = "ゲストユーザー"
            authUserStatus.text = "Firebase 匿名セッション連携中"
            btnGoogleLogin.text = "Googleログイン"
            profileImageView.setImageResource(android.R.drawable.sym_def_app_icon)
        } else {
            authUserName.text = user.displayName ?: "ログインアカウント"
            authUserStatus.text = user.email ?: "Googleサインイン完了"
            btnGoogleLogin.text = "連携解除"
            
            // アバター画像の読み込み
            if (user.photoUrl != null) {
                Glide.with(this)
                    .load(user.photoUrl)
                    .circleCrop()
                    .into(profileImageView)
            }
        }
    }

    @SuppressLint("HardwareIds")
    private fun showDeviceIdentifier() {
        val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        deviceIdText.text = androidId ?: "不明なAndroidID"
    }

    private fun updatePermissionStatusUI() {
        // Bluetooth
        val hasBluetooth = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val connectOk = ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
            val scanOk = ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
            connectOk && scanOk
        } else {
            true // Android 12未満はマニフェスト定義のみ
        }

        if (hasBluetooth) {
            permissionBluetoothStatus.text = "● Bluetooth接続/スキャン権限: 許可済み"
            permissionBluetoothStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_green_dark))
        } else {
            permissionBluetoothStatus.text = "● Bluetooth接続/スキャン権限: 未付与 (動作しません)"
            permissionBluetoothStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_red_dark))
        }

        // 通知(Android 13+)
        val hasNotifications = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

        if (hasNotifications) {
            permissionNotificationStatus.text = "● 常駐通知権限: 許可済み"
            permissionNotificationStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_green_dark))
        } else {
            permissionNotificationStatus.text = "● 常駐通知権限: 未付与 (通知が表示されません)"
            permissionNotificationStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_red_dark))
        }
    }

    private fun hasRequiredPermissions(): Boolean {
        val bluetoothOk = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val connectOk = ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
            val scanOk = ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
            connectOk && scanOk
        } else {
            true
        }
        val notificationOk = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
        return bluetoothOk && notificationOk
    }

    private fun requestRequiredPermissions() {
        val requestList = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestList.add(Manifest.permission.BLUETOOTH_CONNECT)
            // 今後のスキャン・ディスカバリー機能のために防御的に要求しておく
            requestList.add(Manifest.permission.BLUETOOTH_SCAN)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestList.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        if (requestList.isNotEmpty()) {
            requestPermissionsLauncher.launch(requestList.toTypedArray())
        } else {
            Toast.makeText(this, "システム依存の権限はすべて準備できています", Toast.LENGTH_SHORT).show()
        }
    }

    private fun startBluetoothMonitorService() {
        val serviceIntent = Intent(this, BluetoothMonitorService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }
        updateServiceState(true)
    }

    private fun stopBluetoothMonitorService() {
        val serviceIntent = Intent(this, BluetoothMonitorService::class.java)
        stopService(serviceIntent)
        updateServiceState(false)
    }

    private fun restartMonitorServiceIfRunning() {
        if (isServiceRunning(BluetoothMonitorService::class.java)) {
            stopBluetoothMonitorService()
            // 微小遅延させて再起動
            window.decorView.postDelayed({
                startBluetoothMonitorService()
            }, 500)
        }
    }

    private fun updateServiceToggleState() {
        val running = isServiceRunning(BluetoothMonitorService::class.java)
        switchService.isChecked = running
        updateServiceState(running)
    }

    private fun updateServiceState(isRunning: Boolean) {
        if (isRunning) {
            serviceStatusText.text = "サービス連携中 (リアルタイム同期オン)"
            serviceStatusText.setBackgroundColor(ContextCompat.getColor(this, android.R.color.holo_green_dark))
        } else {
            serviceStatusText.text = "サービス停止中 (同期オフ)"
            serviceStatusText.setBackgroundColor(ContextCompat.getColor(this, android.R.color.holo_red_dark))
        }
    }

    @Suppress("DEPRECATION")
    private fun isServiceRunning(serviceClass: Class<*>): Boolean {
        val manager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        for (service in manager.getRunningServices(Int.MAX_VALUE)) {
            if (serviceClass.name == service.service.className) {
                return true
            }
        }
        return false
    }
}
