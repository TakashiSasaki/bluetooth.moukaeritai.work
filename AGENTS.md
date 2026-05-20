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
> [!IMPORTANT]
> **package-lock.json is intentionally absent for now** because the previous lockfile was stale and inconsistent with `package.json`. Until a fresh lockfile is regenerated and committed, **use `npm install` instead of `npm ci`**. Before CI, release, or reproducible-build workflows are introduced, regenerate `package-lock.json` from the current `package.json` and verify `npm ci`, `npm run lint`, and `npm run build`.

Execute the following native scripts exactly as defined in `package.json`:
- `npm install` — Installs package dependencies. (Use `npm install` instead of `npm ci` in this temporary state)
- `npm run dev` — Bootstraps developer sandbox server at `http://localhost:3000`.
- `npm run lint` — Executes static TypeScript compile checks (`tsc --noEmit`).
- `npm run build` — Bundles optimization build assets into raw output root `dist/`.
- `npm run preview` — Checks distribution bundle locally.

## ⛔ Operational Constraints & Rules
- **No Unused Dependencies**: Do NOT reintroduce template relics (like `@google/genai`, `dotenv`, `express`, `react-markdown`, etc.).
- **No Env Secrets**: Do NOT rebuild `.env.example` using outdated environment references (`GEMINI_API_KEY`, `APP_URL`). All configurations are stored locally inside `firebase-applet-config.json`. Do NOT rotate keys or publish secrets.
- **Authentication Resilience**: Maintain existing features for both **Google Sign-In** and **Anonymous Authentication**.
- **Schema Paths Integrity**: Canonical device path is now `/users/{uid}/devices/{deviceId}`. Do NOT reintroduce the obsolete root-level `/devices` collection path for normal app reads, writes, deletes, or listings. The dynamic path variable `uid` serves as the primary authorization boundary. User data is fully isolated from other authenticated users. Device documents do not require/contain the redundant `userId` field; client writes should not include it, as path-level validation is authoritative.
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

## 🔒 Completed Security Rules Hardening (Phase 4A)
We have successfully hardened `firestore.rules` under the user-scoped `/users/{uid}/devices/{deviceId}` path:
1. **Strict Path-Based Ownership (Isolation)**: Access is bounded by path variable `{uid}` matches `request.auth.uid`. Users can only select, create, update, or remove their own nested items.
2. **Lean Document Schema**: Device documents no longer contain or require the redundant `userId` field. Ownership is represented entirely by the path `/users/{uid}/devices/{deviceId}`.
3. **Strict Key Allowlists**: Prevents arbitrary field injection on both creation and updates using standard empty diff sets (`incoming().diff({}).affectedKeys().hasOnly([...])`).
4. **Strict Types & Length Ranges**: Validates types for all fields and sizes (`deviceName` is <= 100 chars, `bluetoothConnected` is `bool`).
5. **Array Bounding Restrictions**:
   - `connectedDevices`: maximum 20 entries.
   - `allDevices`: maximum 50 entries.
6. **Bluetooth MAC Address Regex**: Validates representation format (`^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$`) for `address` fields.
7. **Typing Enumeration Sanity**: Restricts device classification `type` values exactly to the allowed list: `AUDIO`, `COMPUTER`, `PHONE`, `WEARABLE`, `OTHER`.
8. **First-Element Validation (Partial Array Validation)**: Inspects and validates the structure, nested key allowlist, and data types of the first element of list structures when non-empty as a practical representative compromise due to the known limitations of Firestore Security Rules around array looping. Future agents must not assume every element in `connectedDevices`/`allDevices` is validated; application-side validation or sub-collection migration is recommended.

## ⚡ Completed Command / Telemetry Separation (Phase 4B)
We have introduced a per-device commands subcollection path (`/users/{uid}/devices/{deviceId}/commands/{commandId}`):
1. **Telemetry Isolation**: Removed all transient command fields (`requestBluetoothPower`, `disconnectRequests`) from the telemetry document to minimize update/write overhead.
2. **Independent Status Tracker**: Command documents contain metadata such as `type`, `status` (`pending`, `acknowledged`, `completed`, `failed`, `unsupported`), and server-side `requestedAt`/`updatedAt` timestamps.
3. **Stricter Validation Rules**: Added validation helpers (`isValidCommand()`, `isValidCommandType()`, `isValidCommandStatus()`) to enforce type-specific properties like `targetPower` for `SET_BLUETOOTH_POWER` and format-checked `accessoryAddress` via Bluetooth MAC Address regex for `DISCONNECT_ACCESSORY`.
4. **Audit Trail**: Real-world/replica Android devices fetch commands with status `"pending"`, execute the task asynchronously, and safely write logs of their execution back to the same command document.
5. **Authentication & Ownership Boundary**: All command documents are nested within the user-scoped path structure (`/users/{uid}/devices/{deviceId}/commands/{commandId}`). Therefore, a native companion app or processor must authenticate with Firestore using the same Firebase user account (or share the same `uid` identity scope) to fetch or update pending commands. The security rules strictly forbid cross-user command access or arbitrary device-agent privilege escalation.

## 🚀 Future Phase 5 Schema Migration & Isolation Goals
Use these specifications to guide future database schema iterations:
1. **Full Per-Element Array Validation**: Implement individual document/sub-collection designs for robust per-element validation.

## 🔒 Documented Same-UID Design & Lifecycle Policy (Phase 5A & 5B Completed)
1. **No Unrequested Device Identity Setup**: Do not introduce separate client tokens, service account access, or third-party multi-tenant administration layers unless explicitly requested.
2. **Path-Based Authorization Boundary**: Retain `request.auth.uid == uid` as the primary authorization check. Device agents must share/authenticate with this exact same user context.
3. **Command Lifecycle Rule Compliance**:
   - Newly created commands must strictly target `status == "pending"`.
   - Modifying a command that has reached a terminal status (`completed`, `failed`, `unsupported`) is forbidden. Transition is only valid if `existing().status` is either `pending` or `acknowledged`.
4. **Command Retention & Stale State Rules**:
   - Do not add a "stale" status to Firestore command documents unless explicitly requested. "Stale" is purely a UI visual state indicating `pending` > 10 minutes.
   - Do not weaken terminal command immutability rules. Terminal immutability applies to updates/reopening of terminal command documents, not to owner deletion.
   - Do not implement automatic deletion or Cloud Functions unless explicitly requested. Terminal commands are retained for approximately 7 days by general policy.
   - Do not treat commands as compliance-grade immutable audit logs. Do not remove owner delete permission from command documents unless explicitly instructed.
   - Keep `package-lock.json` absent unless explicitly instructed otherwise.

