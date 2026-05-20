# AGENTS.md

## 開発・動作仕様の指示
- デモデータは、Bluetoothスマートアクセサリが現在コネクトされていない状態（未接続/Disconnected）のデバイス（例：ペアリング履歴のみ存在する非アクティブ端末、Bluetooth機能がオフの端末、あるいはBluetooth機能はオンだが接続機器がない端末など）を必ず含めるようにしてください。

---

# Coding Agent Guide: Operation & Constraints Checklist

This guide outlines the system architecture, development rules, constraints, and instructions for future coding agents.

## 📱 Project Overview
- **Name**: Bluetooth Status Monitor (Bluetooth Link)
- **Description**: Web-based operator dashboard for monitoring active Android devices' Bluetooth status & accessory telemetry, with an experimental remote power/disconnect request queue.
- **Web Tech Stack**: React (v19) + Vite + TypeScript, CSS styling via Tailwind CSS, Lucide icons, and Motion (`motion/react`) animations.
- **Backend & Deployments**: Firebase Auth (Google + Anonymous), Firestore Database, and Firebase Hosting.
- **PWA Features**: Offline-ready custom Service Worker (`public/sw.js`) and Manifest config (`public/manifest.json`).

## 🗺️ System Architecture & File Registry
1. **Frontend Entry**: `src/main.tsx` mounts `src/App.tsx`.
2. **Main Application Frame**: `src/App.tsx` handles onboarding, authorization status checks, and sets up OAuth domain warnings.
3. **Core Dashboard View**: `src/components/Dashboard.tsx` maintains status streaming, manages live queries, triggers remote adapters toggle request telemetry, and loads demo datasets.
4. **Firebase Configuration**: `src/firebase/config.ts` instantiates standard client services by loading from metadata `firebase-applet-config.json`.
5. **Database Rules**: `firestore.rules` enforces authorization, document scope checks, and limits write permissions.
6. **Deploy Parameters**: `firebase.json` controls hosting endpoints and links rules location.
7. **Android Implementation Material**: `android-instructions.md` documents service implementation blueprints and schemas for native engineers.

## 🛠️ Development & Validation Scripts
Execute the following native scripts exactly as defined in `package.json`:
- `npm install` — Installs package dependencies.
- `npm run dev` — Bootstraps developer sandbox server at `http://localhost:3000`.
- `npm run lint` — Executes static TypeScript compile checks (`tsc --noEmit`).
- `npm run build` — Bundles optimization build assets into raw output root `dist/`.
- `npm run preview` — Checks distribution bundle locally.

## ⛔ Operational Constraints & Rules
- **No Unused Dependencies**: Do NOT reintroduce template relics (like `@google/genai`, `dotenv`, `express`, `react-markdown`, etc.).
- **No Env Secrets**: Do NOT rebuild `.env.example` using outdated environment references (`GEMINI_API_KEY`, `APP_URL`). All configurations are stored locally inside `firebase-applet-config.json`. Do NOT rotate keys or publish secrets.
- **Authentication Resilience**: Maintain existing features for both **Google Sign-In** and **Anonymous Authentication**.
- **Schema Paths Integrity**: Keep devices under `/devices/{deviceId}` collection paths exactly as they are currently configured. Do NOT move them to `/users/{uid}/devices` during this phase.
- **No Native Android Package Modification**: No native Android development or Kotlin changes should be performed in the workspace.
- **Android Platform Limitations**: Do not assume consumer Android devices can toggle Bluetooth programmatically. Treat `requestBluetoothPower` strictly as a requested intent state.

## 🌍 Firebase Project Parameters
Verify the target parameters match the deployment properties:
- **Project ID**: `moukaeritaid`
- **Hosting Site**: `bluetooth-moukaeritai-work`
- **Firestore Database ID**: `bluetooth-moukaeritai-work`
- **Expected OAuth Authorized Domains**:
  - `bluetooth.moukaeritai.work`
  - `bluetooth-moukaeritai-work.web.app`
  - `bluetooth-moukaeritai-work.firebaseapp.com`
  - `localhost`

## 📦 PWA Specifications
- **No Missing Icons**: `public/manifest.json` currently has no icons array structure. Keep it clean or add local images directly to avoid broken offline-install references on device home screens.
- **Custom Service Worker**: `public/sw.js` utilizes a custom, streamlined Network-First & Cache-First navigation solution for same-origin static assets. Do NOT compile or rewrite it into Workbox.

## 🔒 Future Phase 3 Schema & Validation Hardening Goals
Use these specifications to guide future database schema iterations:
1. **Array Content Rules**: Enforce detailed validation on the contents of the `connectedDevices` and `allDevices` lists.
2. **Access Limitation & Payload Boundaries**: Set constraints on list sizes (e.g., maximum 50 paired devices in `allDevices`) and limit size inputs of device identities or Bluetooth MAC strings.
3. **Typing Enumeration Sanity**: Strictly limit device classifications to standard type definitions (`AUDIO`, `COMPUTER`, `PHONE`, `WEARABLE`, `OTHER`).
4. **Sub-resource Migration Plan**: Migrate standard entries to user nested structures (`/users/{uid}/devices/{deviceId}`) and isolate control parameters to a distinct requests collection to minimize telemetry write overhead.
