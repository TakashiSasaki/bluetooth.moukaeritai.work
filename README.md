# Bluetooth Link: Bluetooth Status Monitor Dashboard

Bluetooth Link is a web dashboard and Progressive Web App (PWA) designed to monitor the real-time Bluetooth adapter power status and connected accessory status of active Android devices.

The system relies on an accompanying Android monitoring application that captures the local Bluetooth connection state changes and syncs them securely to a Cloud Firestore database. The web app then renders real-time status cards, pairing history logs, and lets operators post state change requests.

---

## 🛠️ Tech Stack

- **Frontend Framework**: React 19 (TypeScript) with Vite
- **Styling**: Tailwind CSS
- **Local Animations**: motion/react
- **Real-Time Database & Auth**: Google Firebase (Firestore & Firebase Auth)
- **Offline / PWA Capable**: Custom modern Network-First / Cache-First Service Worker and Manifest schema
- **Icon Set**: lucide-react

---

## 🚀 Local Development

To run the web dashboard locally, execute the following commands in the root directory:

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   The application will be accessible at [http://localhost:3000](http://localhost:3000).

3. **Build for Production**:
   ```bash
   npm run build
   ```
   All static assets will be compiled into the `dist/` directory.

---

## 🔥 Firebase Setup Requirements

The prototype comes configured for the following Firebase project parameters. To deploy or run this against your own Firebase environment, ensure your `firebase-applet-config.json` is updated and target project contains:

### 1. Key Configuration Metadata
- **Firebase Project ID**: `moukaeritaid`
- **Firebase Hosting Site ID**: `bluetooth-moukaeritai-work`
- **Firestore Database ID**: `bluetooth-moukaeritai-work`

### 2. Authentication Providers
The companion app and web dashboard expect the following auth channels to be enabled:
- **Google Sign-In** (for administrator access and dashboard monitoring)
- **Anonymous Authentication** (for fast companion-app provisioning during initial setup or guest flow testing)

### 3. Authorized OAuth Domains
To ensure Google Sign-In functions correctly, authorize the following domains inside your Firebase Auth console:
- `bluetooth.moukaeritai.work`
- `bluetooth-moukaeritai-work.web.app`
- `bluetooth-moukaeritai-work.firebaseapp.com`
- `localhost` (for sandbox environment previews)

### 4. Deploying Firestore Rules
Firestore Security Rules are located in `firestore.rules` and integrated into the Firebase CLI schema through `firebase.json`. Run the following command from your terminal to deploy rules:
```bash
firebase deploy --only firestore:rules
```

---

## ⚠️ Platform Limitations & Android Bluetooth Constraints

It is critical to evaluate the following platform restrictions before planning any native application deployment:

1. **Restricted Programmatic Power Controls**:
   Beginning with Android 10 (API level 29) and further solidified in subsequent versions, Google has deprecated and security-locked `BluetoothAdapter.enable()` and `BluetoothAdapter.disable()`. Normal user-installed apps cannot programmatically toggle Bluetooth power without human interaction.
2. **Experimental Request-State Pattern**:
   The Remote Bluetooth ON/OFF toggles in the dashboard write to Firestore as an intent (the `requestBluetoothPower` flag). The native Android service listens to this state, but actual toggle execution will be unsuccessful unless the app is running in system-app contexts (e.g., Device Owner, Profile Owner, or pre-installed system vendor privileges). On normal consumer devices, this should be considered an experimental request that native firmware logs or informs about rather than hard-executing.
3. **Android Client Implementation**:
   This repository contains initial design instructions and Kotlin snippet architecture under `/android-instructions.md`. **This phase does NOT deploy or fully implement the native Android application package.** It only lays out the database schema, rules, and service definitions.

---

## 🔒 Hardened User-Scoped Firestore Security Rules & Schema (Phase 4A Completed)

We have successfully migrated and hardened Firestore Security Rules and schema under the user-scoped path `/users/{uid}/devices/{deviceId}`:
1. **Strict Path-Based Ownership**: The dynamic path variable `uid` serves as the primary authorization boundary (`uid == request.auth.uid`). Users are strictly restricted to reading, creating, updating, and deleting only their own nested device documents.
2. **Lean Document Schema**: Device documents no longer contain or require the redundant `userId` field. Ownership is represented entirely by the path `/users/{uid}/devices/{deviceId}`, and rules map access strictly to `request.auth.uid`.
3. **Strict Key Allowlists**: Prevents arbitrary field injection on create/update using standard empty map diffs (`incoming().diff({}).affectedKeys().hasOnly([...])`).
4. **Field Types & Size Constraints**: Validates primitive types and enforces limits (e.g., `deviceName` string length check <= 100).
5. **List Length Bounding**:
   - `connectedDevices` is restricted to max 20 entries.
   - `allDevices` is restricted to max 50 entries.
6. **Bluetooth MAC Address Regex validation**: Checks that device address strings match `^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$`.
7. **Typing Enumeration Sanity**: Enforces valid device classification type strings: `AUDIO`, `COMPUTER`, `PHONE`, `WEARABLE`, `OTHER`.
8. **First-Element Validation (Partial Array Validation)**: Due to the known limitations of Firestore Security Rules around looping or iterating over arbitrary-length arrays, we validate the structure and allowed keys of the first element in lists when non-empty as a practical representative compromise (`data.array[0] is map`).

---

## ⚡ Command / Telemetry Separation & Subcollections (Phase 4B Completed)

We have successfully separated interactive operator control queues from primary state telemetry updates:
1. **Command Subcollection Path**: Created an independent command subcollection under `/users/{uid}/devices/{deviceId}/commands/{commandId}`.
2. **Telemetry Isolation**: Removed `requestBluetoothPower` and `disconnectRequests` fields from device telemetry documents to minimize unnecessary write overhead.
3. **Stricter Validation Rules**: Added validation helpers (`isValidCommand`, `isValidCommandType`, `isValidCommandStatus`) to enforce proper payload schema, including type-specific fields (`targetPower` for `SET_BLUETOOTH_POWER` and regex-vetted `accessoryAddress` for `DISCONNECT_ACCESSORY`).
4. **Asynchronous Command Pattern**: Operators write commands as new documents in the `commands` subcollection. Native companion units or mock-service workers dynamically pick up pending commands, execute them, and report execution logs and final statuses (`completed`/`failed`/`unsupported`) directly on the command documents.

### 📦 Pre-Production Data Cleanup Note
- This application is pre-production; therefore, no database migration script is provided.
- Existing root-level `/devices` demo data in Firestore can be safely discarded or deleted manually.
- The web app and companion integrations now exclusively interact with `/users/{uid}/devices/{deviceId}` going forward. Discarding old collections avoids clutter.

---

## 📅 Remaining Task List & Future Roadmap (Phase 5)

- [ ] **PWA Icons Integration**: Add corporate or custom brand assets for desktop and mobile homescreens (e.g., `pwa-192x192.png` and `pwa-512x512.png`), re-enabling the icons array definition inside `/public/manifest.json`.
- [ ] **Android App Build**: Compile and deploy the companion client service within Android Studio using the instructions inside `/android-instructions.md`.
- [ ] **Full Array Validation**: Implement granular per-element array verification under isolated sub-collections or cloud functions.

