export interface BluetoothDevice {
  name: string;
  address: string;
  type?: string; // Allowed values: 'AUDIO', 'COMPUTER', 'PHONE', 'WEARABLE', 'OTHER'
  firstConnectedAt?: number; // Timestamp first detected
  lastConnectedAt?: number;  // Timestamp last connected
  lastDisconnectedAt?: number; // Timestamp last disconnected
  isConnected?: boolean;       // Current connection state of this replica
}

export interface Device {
  id: string;
  deviceName: string;
  bluetoothConnected: boolean; // True if at least one device is connected
  bluetoothPoweredOn?: boolean;  // Is the Bluetooth adapter itself turned on/active?
  requestBluetoothPower?: boolean; // Requested power state from remote control
  connectedDevices: BluetoothDevice[]; // Currently active connected devices (or legacy)
  allDevices?: BluetoothDevice[]; // All-time history of Bluetooth devices
  disconnectRequests?: string[]; // Array of bluetooth hardware addresses requested to disconnect
  lastUpdated: number;
}

