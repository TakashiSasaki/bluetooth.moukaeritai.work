# Security Spec for Device Monitoring System

## 1. Data Invariants
- A device document must always be associated with a valid `userId`.
- Users can only read and write devices that they own (`userId == request.auth.uid`).
- A device can only be created with its `userId` matching the currently authenticated user.
- Status updates must have a strictly enforced server timestamp.
- The `bluetoothConnected` field must be a boolean.

## 2. The "Dirty Dozen" Payloads
1.  **Identity Spoofing (Create)**: Create a device with `userId` = Another person's UID.
2.  **Identity Spoofing (Update)**: Update an existing device to change the `userId`.
3.  **Cross-User Read**: Attempt to read/list devices where `userId` != `request.auth.uid`.
4.  **Shadow Field (Create)**: Create a device including an unapproved field (e.g. `isAdmin: true`).
5.  **Shadow Field (Update)**: Update a device adding an unapproved ghost field.
6.  **Type Mismatch**: Submit `bluetoothConnected` as a string (`"true"`).
7.  **Resource Poisoning**: Use a document ID exceeding 128 characters or containing weird symbols.
8.  **Empty Device Name**: Submit an empty string for `deviceName`.
9.  **Missing Fields**: Create a device missing the `bluetoothConnected` field.
10. **Client Timestamp Trust**: Submit `lastUpdated` as `1` instead of `request.time`.
11. **Guest Access**: Attempt any operation while not signed in.
12. **Unverified Email**: Attempt operation while signed in but email unverified.

## 3. Test Runner
We will generate `firestore.rules.test.ts` to test these scenarios.
