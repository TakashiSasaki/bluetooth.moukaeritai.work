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
To ensure Google Sign-In and frame embedding function correctly, authorize the following domains inside your Firebase Auth console:
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

## 📅 Remaining Task List & Assets

- [ ] **PWA Icons**: Custom visual files for `pwa-192x192.png` and `pwa-512x512.png` are referenced inside `/public/manifest.json`. Place your preferred binary images there to complete installation branding on mobile home screens.
- [ ] **Android App Build**: Compile and deploy the companion client service within Android Studio using the instructions inside `/android-instructions.md`.
