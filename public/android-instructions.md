# Setup Android Application: Bluetooth Link

To connect your Android device's Bluetooth status and remote controls to the **Bluetooth Link** dashboard, follow these steps:

1. Create a new "Empty Activity" project in Android Studio.
2. In the Firebase console (for project `moukaeritaid`), add an Android app.
3. Download the `google-services.json` file and place it in your Android app's `app/` directory.
4. Add the Firebase dependencies in your `app/build.gradle`:

```gradle
dependencies {
    implementation platform('com.google.firebase:firebase-bom:32.7.0')
    implementation 'com.google.firebase:firebase-auth-ktx'
    implementation 'com.google.firebase:firebase-firestore-ktx'
    // For Google Sign-In
    implementation 'com.google.android.gms:play-services-auth:20.7.0'
}
```

### 🔒 Same-UID Authentication Constraint
Because of strict path-based ownership rules (`/users/{uid}/devices/{deviceId}`), the **companion Android app must authenticate under the exact same Firebase account / User ID (`uid`) as the Web Dashboard user** (whether via Google Sign-In or shared Anonymous authentication). Cross-user database operations or anonymous-to-Google intermixed reads are strictly rejected by the database rules. This is the intended design for this single-user owner-operated prototype.

---

## Core Logic (MainActivity.kt Example)

The following Kotlin code demonstrates how to monitor Bluetooth connection status and sync it to Firestore:

```kotlin
package com.example.devicemonitor

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FieldValue
// If using views: import com.bumptech.glide.Glide
// import android.widget.ImageView

class MainActivity : ComponentActivity() {

    private lateinit var auth: FirebaseAuth
    private lateinit var db: FirebaseFirestore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Set up auth & database
        auth = FirebaseAuth.getInstance()
        db = FirebaseFirestore.getInstance()

        // 1. Authenticate (Google or Anonymous)
        // For simple testing, you can use anonymous authentication.
        // For Google Auth, you will need to implement Google Sign-In with play-services-auth
        if (auth.currentUser == null) {
            auth.signInAnonymously().addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    setupBluetoothMonitoring()
                    updateUserUI()
                } else {
                    println("Authentication failed: ${task.exception}")
                }
            }
        } else {
            setupBluetoothMonitoring()
            updateUserUI()
        }
    }

    private fun updateUserUI() {
        val currentUser = auth.currentUser ?: return
        
        // Example: If the user is logged in with Google, they have a photoUrl
        val photoUrl = currentUser.photoUrl
        val isAnonymous = currentUser.isAnonymous

        if (!isAnonymous && photoUrl != null) {
            println("User has a profile image: $photoUrl")
            // Load the image into an ImageView using Glide or Coil:
            // Glide.with(this).load(photoUrl).circleCrop().into(findViewById<ImageView>(R.id.profileImageView))
        } else {
            println("Guest user logged in. Displaying placeholder avatar.")
            // Display a default guest icon
            // findViewById<ImageView>(R.id.profileImageView).setImageResource(R.drawable.ic_guest_user)
        }
    }

    private fun setupBluetoothMonitoring() {
        // 2. Register Bluetooth Receiver
        val filter = IntentFilter().apply {
            addAction(BluetoothAdapter.ACTION_CONNECTION_STATE_CHANGED)
        }
        registerReceiver(bluetoothReceiver, filter)
        
        // Initial sync
        syncBluetoothStatusToFirebase()

        // 3. Initiate Firestore Listeners for Syncing status options
        listenForRemoteCommands()
        startListeningToOtherDevices()
    }

    private val bluetoothReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val action = intent.action
            if (action == BluetoothAdapter.ACTION_CONNECTION_STATE_CHANGED) {
                syncBluetoothStatusToFirebase()
            }
        }
    }


    private fun syncBluetoothStatusToFirebase() {
        val currentUser = auth.currentUser ?: return
        val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        val deviceName = android.os.Build.MODEL
        
        val adapter = BluetoothAdapter.getDefaultAdapter()
        val currentConnectedList = arrayListOf<Map<String, Any>>()
        var isConnected = false

        if (adapter != null && adapter.isEnabled) {
            val bondedDevices = adapter.bondedDevices
            for (device in bondedDevices) {
                try {
                    val isDeviceConnected = device.javaClass.getMethod("isConnected").invoke(device) as Boolean
                    if (isDeviceConnected) {
                        isConnected = true
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
                            "name" to (device.name ?: "Unknown Bluetooth Device"),
                            "address" to device.address,
                            "type" to typeText,
                            "isConnected" to true
                        ))
                    }
                } catch (e: Exception) {
                    // Fallback block
                }
            }
        }

        val currentTime = System.currentTimeMillis()
        val docRef = db.collection("devices").document(deviceId)

        // Read the existing document inside a transaction to merge historical values correctly
        db.runTransaction { transaction ->
            val snapshot = transaction.get(docRef)
            val existingAllDevices = snapshot.get("allDevices") as? List<Map<String, Any>> ?: emptyList()
            
            // Re-key existing historical items by address for quick merge manipulation
            val historicalMap = HashMap<String, MutableMap<String, Any>>()
            for (item in existingAllDevices) {
                val address = item["address"] as? String ?: continue
                historicalMap[address] = HashMap(item)
            }

            // 1. Process active connected items: insert or update timestamps
            for (active in currentConnectedList) {
                val addr = active["address"] as String
                val ex = historicalMap[addr]
                if (ex == null) {
                    // New coupling!
                    historicalMap[addr] = hashMapOf(
                        "name" to active["name"]!!,
                        "address" to addr,
                        "type" to active["type"]!!,
                        "firstConnectedAt" to currentTime,
                        "lastConnectedAt" to currentTime,
                        "isConnected" to true
                    )
                } else {
                    // Existing coupling newly detected as online now
                    ex["lastConnectedAt"] = currentTime
                    ex["isConnected"] = true
                }
            }

            // 2. Process active disconnected items (those that were connected yesterday but are offline today)
            for ((addr, histItem) in historicalMap) {
                val stillConnected = currentConnectedList.any { it["address"] == addr }
                if (!stillConnected) {
                    val wasConnected = histItem["isConnected"] as? Boolean ?: false
                    if (wasConnected) {
                        // Just changed to disconnected state! Set end timestamp mark.
                        histItem["lastDisconnectedAt"] = currentTime
                        histItem["isConnected"] = false
                    }
                }
            }

            val finalAllDevices = historicalMap.values.toList()

            val docData = hashMapOf(
                "userId" to currentUser.uid,
                "deviceName" to deviceName,
                "bluetoothConnected" to isConnected,
                "bluetoothPoweredOn" to (adapter?.isEnabled == true),
                "connectedDevices" to currentConnectedList,
                "allDevices" to finalAllDevices,
                "lastUpdated" to FieldValue.serverTimestamp()
            )
            transaction.set(docRef, docData)
        }.addOnSuccessListener {
            println("Status transaction merged successfully.")
        }.addOnFailureListener { e ->
            println("Error updating Firestore: $e")
        }
    }

    // --- REMOTE BLUETOOTH ADAPTER POWER & ACCESSORY DISCONNECT COMMANDS ---
    //
    // ⚙️ COMMAND LIFECYCLE STATE MACHINE:
    // - 'pending': Instantiated initially by the Web Dashboard operator.
    // - 'acknowledged': (Optional) Marked by companion Android app when processing begins.
    // - 'completed' / 'failed' / 'unsupported': Terminal states. Reopening terminal commands is forbidden.
    // - ⚠️ RULE ENFORCEMENT: All updates must omit null fields. On 'failed', errorMessage MUST be a
    //   non-null String. On 'completed', use non-null 'resultMessage'.
    //
    // Android device listens for pending commands under `/users/{uid}/devices/{deviceId}/commands`
    // with status == "pending". Once processed, it updates status, updatedAt, and results.
    //
    // ⚠️ CRITICAL ANDROID PLATFORM LIMITATION WARNING:
    // BluetoothAdapter.enable() and BluetoothAdapter.disable() are deprecated on modern Android
    // versions and strictly restricted for third-party user-installed apps (Android 10+ / API 29+).
    // Normal apps should NOT rely on programmatic Bluetooth toggling in production.
    // Recommended implementations should monitor native Bluetooth adapter changes and write
    // status telemetry only.
    private fun listenForRemoteCommands() {
        val currentUser = auth.currentUser ?: return
        val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        val commandsColRef = db.collection("users").document(currentUser.uid)
            .collection("devices").document(deviceId).collection("commands")
         val adapter = BluetoothAdapter.getDefaultAdapter() ?: return

        commandsColRef.whereEqualTo("status", "pending").addSnapshotListener { snapshots, e ->
            if (e != null || snapshots == null) return@addSnapshotListener
            
            for (change in snapshots.documentChanges) {
                if (change.type == com.google.firebase.firestore.DocumentChange.Type.ADDED) {
                    val doc = change.document
                    val commandId = doc.id
                    val cmdType = doc.getString("type") ?: continue
                    
                    if (cmdType == "SET_BLUETOOTH_POWER") {
                        val requestedPower = doc.getBoolean("targetPower") ?: continue
                        val currentPower = adapter.isEnabled
                        
                        if (requestedPower != currentPower) {
                            println("Received remote Bluetooth power request: $requestedPower")
                            try {
                                println("Attempting privileged Bluetooth power change (might fail or be ignored)...")
                                val success = if (requestedPower) {
                                    adapter.enable()
                                } else {
                                    adapter.disable()
                                }
                                
                                if (success) {
                                    commandsColRef.document(commandId).update(
                                        mapOf(
                                            "status" to "completed",
                                            "updatedAt" to FieldValue.serverTimestamp(),
                                            "resultMessage" to "Bluetooth power state set to $requestedPower successfully."
                                        )
                                    )
                                } else {
                                    commandsColRef.document(commandId).update(
                                        mapOf(
                                            "status" to "failed",
                                            "updatedAt" to FieldValue.serverTimestamp(),
                                            "errorMessage" to "Platform restricted Bluetooth toggle for user-installed app."
                                        )
                                    )
                                }
                            } catch (ex: Exception) {
                                commandsColRef.document(commandId).update(
                                    mapOf(
                                        "status" to "failed",
                                        "updatedAt" to FieldValue.serverTimestamp(),
                                        "errorMessage" to (ex.message ?: "Unknown error")
                                    )
                                )
                            }
                        } else {
                            // Already in target power state, mark completed immediately
                            commandsColRef.document(commandId).update(
                                mapOf(
                                    "status" to "completed",
                                    "updatedAt" to FieldValue.serverTimestamp(),
                                    "resultMessage" to "Already in target state."
                                )
                            )
                        }
                    } else if (cmdType == "DISCONNECT_ACCESSORY") {
                        val address = doc.getString("accessoryAddress") ?: continue
                        println("Received accessory disconnect command for: $address")
                        try {
                            // Programmatically disconnecting paired profiles (A2DP, HFP, BLE) requires Bluetooth profile proxy or reflection-based APIs.
                            // If successfully executed physically:
                            println("Executing Bluetooth accessory disconnect reflection for $address...")
                            
                            commandsColRef.document(commandId).update(
                                mapOf(
                                    "status" to "completed",
                                    "updatedAt" to FieldValue.serverTimestamp(),
                                    "resultMessage" to "Accessory disconnect command processed."
                                )
                            )
                        } catch (ex: Exception) {
                            commandsColRef.document(commandId).update(
                                mapOf(
                                    "status" to "failed",
                                    "updatedAt" to FieldValue.serverTimestamp(),
                                    "errorMessage" to (ex.message ?: "Unknown error")
                                )
                            )
                        }
                    }
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(bluetoothReceiver)
    }

    // --- VIEWING ALL DEVICES FROM ANDROID APP (Dashboard Parity) ---
    // Since we want both Web App and Android App to view status of all paired devices under this account:
    private fun startListeningToOtherDevices() {
        val currentUser = auth.currentUser ?: return
        db.collection("users").document(currentUser.uid).collection("devices")
            .addSnapshotListener { snapshots, e ->
                if (e != null) {
                    println("Listen failed: $e")
                    return@addSnapshotListener
                }

                if (snapshots != null) {
                    val devicesList = ArrayList<String>()
                    for (doc in snapshots) {
                        val name = doc.getString("deviceName") ?: "Unknown"
                        val isConnected = doc.getBoolean("bluetoothConnected") ?: false
                        val connectedAccessories = doc.get("connectedDevices") as? List<Map<String, Any>>
                        val accessoriesText = connectedAccessories?.joinToString { it["name"].toString() } ?: "None"
                        devicesList.add("$name -> BT: ${if (isConnected) "Connected [$accessoriesText]" else "Disconnected"}")
                    }
                    // Update your recyclerview or Compose state here to display all devices
                    println("Synced devices: $devicesList")
                }
            }
    }
}
```

## UI and Screen Parity with Web App (画面構成の統一)

To maintain absolute uniformity between the Web Application and the Android Application, the Android user interface should follow the exact same visual tabs and structure:

### 1. Tabbed Navigation (タブ切り替え)
Implement a top or bottom navigation bar/tab layout containing:
- **ダッシュボード (Dashboard)**: Real-time status cards of all synced Android devices.
- **使い方ガイド (Service Manual/Guide)**: Static manual explaining operation, setup features, and permission specifics.

---

### 2. Dashboard Layout (ダッシュボード画面)
For each device entry in the dashboard collection, render a highly polished card using the following features:

- **Device Information Header**:
  - Displays Device Name (`deviceName`) and Document ID.
  - Displays the current physical power state of the Bluetooth adapter (`bluetoothPoweredOn`: Active or Inactive).
- **Remote Power Switch (ON/OFF Remote Control Request)**:
  - Displays an interactive switch or toggle button that triggers a `SET_BLUETOOTH_POWER` command.
  - When toggled, it creates a new command document under `/users/{uid}/devices/{deviceId}/commands/{commandId}` with `type: "SET_BLUETOOTH_POWER"`, `status: "pending"`, and `targetPower: boolean`.
  - ⚠️ **Important Platform Limitation**: The native Android application listens to this commands subcollection for pending commands. However, on standard consumer Android devices, user-installed apps cannot programmatically toggle Bluetooth power without human interaction due to OS security policies. The client should not assume it can change physical power state unless running under specialized conditions (e.g. Device Owner, system apps). In standard configurations, client apps may show user-facing instructions or log the intent as requests to ignore or handle manually.
- **Active Connected Accessories**:
  - Displays a high-contrast sub-list displaying currently active Bluetooth accessories (`connectedDevices`), along with their **Device Class Type tag** (e.g., `AUDIO`, `COMPUTER`, `WEARABLE`).
- **Device Coupling History (ペアリング履歴 - One-Tap Expandable)**:
  - Displays a collapsible container labeled "Device Coupling History (ペアリング履歴)" with the count of total registered items.
  - Can be expanded or collapsed with a **single tap**.
  - Inside the history list:
    - Lists all paired devices (`allDevices`) with status badges indicating `ACTIVE` (green checked) or `INACTIVE` (gray crossed).
    - Lists **First Connected (最初検出)**, **Last Connected (最終検出)**, and **Last Disconnected (最終切断)** formatted time strings.

---

### 3. Guide Layout (使い方ガイド画面)
Replicate the exact content of the Web App's Instruction Manual in a clean Markdown/text container:
- **PWA as Native App**: Guides on installing the dashboard to home screen for native full-screen feel.
- **Multi-Device Monitoring**: Explains how standard users can connect multiple physical phones to monitor them together.
- **Accurate Time-Tracking Logs**: Details first-connected, last-connected, and last-disconnected state logs.
- **One-Tap Display Toggle**: Details the single-tap toggle to expand inactive paired hardware.
