import { User } from 'firebase/auth';
import { collection, onSnapshot, query, where, Timestamp, doc, updateDoc, setDoc, deleteDoc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { useEffect, useState, useRef } from 'react';
import { db } from '../firebase/config';
import { OperationType, handleFirestoreError } from '../firebase/error';
import { Device, BluetoothDevice } from '../types';
import { Bluetooth, BluetoothOff, LogOut, Smartphone, Clock, User as UserIcon, ChevronDown, ChevronUp, CheckCircle, XCircle, FileText, LayoutDashboard, ChevronRight, Database, Trash2, Unlink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow, format } from 'date-fns';

interface DashboardProps {
  user: User;
  onSignOut: () => void;
}

export default function Dashboard({ user, onSignOut }: DashboardProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState<Record<string, boolean>>({});

  const [activeTab, setActiveTab] = useState<'dashboard' | 'guide'>('dashboard');
  const [updatingPower, setUpdatingPower] = useState<Record<string, boolean>>({});
  const [disconnecting, setDisconnecting] = useState<Record<string, boolean>>({});
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const toggleBluetoothPower = async (deviceId: string, currentPower?: boolean) => {
    setUpdatingPower(prev => ({ ...prev, [deviceId]: true }));
    try {
      const targetState = !currentPower;
      const deviceRef = doc(db, 'devices', deviceId);
      
      const isDummy = deviceId.startsWith('dummy_');
      if (isDummy) {
        // デモデータの場合は、要求フィールドとともに、現在状態(bluetoothPoweredOn)も即座に書き換えシミュレート
        const updatePayload: any = {
          requestBluetoothPower: targetState,
          bluetoothPoweredOn: targetState,
          lastUpdated: serverTimestamp()
        };
        
        // Bluetooth機能がオフになった場合は接続も切れたとシミュレート
        if (!targetState) {
          updatePayload.bluetoothConnected = false;
          updatePayload.connectedDevices = [];
        } else {
          // オンに戻した時、本来のダミーデータを一部復元
          if (deviceId.includes('pixel')) {
            updatePayload.connectedDevices = [
              {
                name: 'Sony WH-1000XM5',
                address: '00:1B:44:11:3A:B7',
                type: 'AUDIO',
                firstConnectedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
                lastConnectedAt: Date.now() - 2 * 60 * 1050,
                isConnected: true
              },
              {
                name: 'Pixel Watch 2',
                address: '7C:2E:0D:1A:E5:90',
                type: 'WEARABLE',
                firstConnectedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
                lastConnectedAt: Date.now() - 2 * 60 * 1050,
                isConnected: true
              }
            ];
            updatePayload.bluetoothConnected = true;
          } else if (deviceId.includes('xperia')) {
            updatePayload.connectedDevices = [
              {
                name: 'Sony LinkBuds S',
                address: '38:18:AA:77:4B:92',
                type: 'AUDIO',
                firstConnectedAt: Date.now() - 12 * 60 * 60 * 1000,
                lastConnectedAt: Date.now() - 30 * 60 * 1050,
                isConnected: true
              }
            ];
            updatePayload.bluetoothConnected = true;
          } else {
            // Galaxyは未接続状態を維持
            updatePayload.bluetoothConnected = false;
            updatePayload.connectedDevices = [];
          }
        }
        await updateDoc(deviceRef, updatePayload);
      } else {
        await updateDoc(deviceRef, {
          requestBluetoothPower: targetState
        });
      }
    } catch (error) {
      console.error('Error updating Bluetooth power request:', error);
      handleFirestoreError(error, OperationType.UPDATE, `devices/${deviceId}`);
    } finally {
      setUpdatingPower(prev => ({ ...prev, [deviceId]: false }));
    }
  };

  const handleDisconnectAccessory = async (deviceId: string, address: string, isDummy: boolean) => {
    const key = `${deviceId}-${address}`;
    setDisconnecting(prev => ({ ...prev, [key]: true }));
    try {
      const deviceRef = doc(db, 'devices', deviceId);
      
      if (isDummy) {
        // [デモ/ダビデータ] 接続機器一覧から即削除し、履歴の状態を INACTIVE にする
        const currentDevice = devices.find(d => d.id === deviceId);
        if (currentDevice) {
          const updatedConnected = (currentDevice.connectedDevices || []).filter(
            sub => sub.address !== address
          );
          
          const updatedAll = (currentDevice.allDevices || []).map(hist => {
            if (hist.address === address) {
              return {
                ...hist,
                isConnected: false,
                lastDisconnectedAt: Date.now()
              };
            }
            return hist;
          });

          // すべての接続が切れたら全体の接続ステータスも更新
          const bluetoothConnected = updatedConnected.length > 0;

          await updateDoc(deviceRef, {
            connectedDevices: updatedConnected,
            allDevices: updatedAll,
            bluetoothConnected,
            lastUpdated: serverTimestamp()
          });
        }
      } else {
        // [本物デバイス] Androidアプリに切断を指令
        await updateDoc(deviceRef, {
          disconnectRequests: arrayUnion(address),
          lastUpdated: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error requesting accessory disconnect:', error);
      handleFirestoreError(error, OperationType.UPDATE, `devices/${deviceId}`);
    } finally {
      setDisconnecting(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleRegisterDummyData = async () => {
    try {
      const pixelId = `dummy_pixel_8_${user.uid}`;
      const xperiaId = `dummy_xperia_1_${user.uid}`;
      const galaxyId = `dummy_galaxy_24_${user.uid}`;
      const now = Date.now();

      // [デモ] Google Pixel 8 Pro
      await setDoc(doc(db, 'devices', pixelId), {
        userId: user.uid,
        deviceName: '[デモ] Google Pixel 8 Pro',
        bluetoothConnected: true,
        bluetoothPoweredOn: true,
        requestBluetoothPower: true,
        lastUpdated: serverTimestamp(),
        connectedDevices: [
          {
            name: 'Sony WH-1000XM5',
            address: '00:1B:44:11:3A:B7',
            type: 'AUDIO',
            firstConnectedAt: now - 3 * 24 * 60 * 60 * 1000,
            lastConnectedAt: now - 2 * 60 * 1050,
            isConnected: true
          },
          {
            name: 'Pixel Watch 2',
            address: '7C:2E:0D:1A:E5:90',
            type: 'WEARABLE',
            firstConnectedAt: now - 5 * 24 * 60 * 60 * 1000,
            lastConnectedAt: now - 2 * 60 * 1050,
            isConnected: true
          }
        ],
        allDevices: [
          {
            name: 'Sony WH-1000XM5',
            address: '00:1B:44:11:3A:B7',
            type: 'AUDIO',
            firstConnectedAt: now - 3 * 24 * 60 * 60 * 1000,
            lastConnectedAt: now - 2 * 60 * 1050,
            isConnected: true
          },
          {
            name: 'Pixel Watch 2',
            address: '7C:2E:0D:1A:E5:90',
            type: 'WEARABLE',
            firstConnectedAt: now - 5 * 24 * 60 * 60 * 1000,
            lastConnectedAt: now - 2 * 60 * 1050,
            isConnected: true
          },
          {
            name: 'MacBook Pro 16"',
            address: 'A4:83:E7:5C:1F:D2',
            type: 'COMPUTER',
            firstConnectedAt: now - 2 * 24 * 60 * 60 * 1000,
            lastConnectedAt: now - 24 * 60 * 60 * 1000,
            lastDisconnectedAt: now - 12 * 60 * 60 * 1000,
            isConnected: false
          }
        ],
        disconnectRequests: []
      });

      // [デモ] Sony Xperia 1 V
      await setDoc(doc(db, 'devices', xperiaId), {
        userId: user.uid,
        deviceName: '[デモ] Sony Xperia 1 V',
        bluetoothConnected: false,
        bluetoothPoweredOn: false,
        requestBluetoothPower: false,
        lastUpdated: serverTimestamp(),
        connectedDevices: [],
        allDevices: [
          {
            name: 'Bose QuietComfort 45',
            address: '44:65:0D:8F:A2:3B',
            type: 'AUDIO',
            firstConnectedAt: now - 10 * 24 * 60 * 60 * 1000,
            lastConnectedAt: now - 60 * 60 * 1000,
            lastDisconnectedAt: now - 45 * 60 * 1000,
            isConnected: false
          },
          {
            name: 'Xperia Buds Pro',
            address: 'D8:D0:3C:4B:10:9F',
            type: 'AUDIO',
            firstConnectedAt: now - 5 * 24 * 60 * 60 * 1000,
            lastConnectedAt: now - 24 * 60 * 60 * 1000,
            lastDisconnectedAt: now - 24 * 60 * 60 * 1000,
            isConnected: false
          }
        ],
        disconnectRequests: []
      });

      // [デモ] Samsung Galaxy S24 Ultra (Bluetooth機能ONだがペアリングされているものの現在未接続のデモデータ)
      await setDoc(doc(db, 'devices', galaxyId), {
        userId: user.uid,
        deviceName: '[デモ] Samsung Galaxy S24 Ultra',
        bluetoothConnected: false,
        bluetoothPoweredOn: true,
        requestBluetoothPower: true,
        lastUpdated: serverTimestamp(),
        connectedDevices: [],
        allDevices: [
          {
            name: 'Galaxy Buds2 Pro',
            address: 'E0:AA:96:2C:4D:81',
            type: 'AUDIO',
            firstConnectedAt: now - 4 * 24 * 60 * 60 * 1000,
            lastConnectedAt: now - 3 * 60 * 60 * 1000,
            lastDisconnectedAt: now - 2 * 60 * 60 * 1000,
            isConnected: false
          },
          {
            name: 'Galaxy Watch 6',
            address: '2C:F0:EE:D3:51:7A',
            type: 'WEARABLE',
            firstConnectedAt: now - 6 * 24 * 60 * 60 * 1000,
            lastConnectedAt: now - 5 * 24 * 60 * 60 * 1000,
            lastDisconnectedAt: now - 4 * 24 * 60 * 60 * 1000,
            isConnected: false
          }
        ],
        disconnectRequests: []
      });
    } catch (error) {
      console.error('Error registering dummy data:', error);
      handleFirestoreError(error, OperationType.WRITE, 'devices');
    }
  };

  const handleDeleteDummyData = async () => {
    try {
      const pixelId = `dummy_pixel_8_${user.uid}`;
      const xperiaId = `dummy_xperia_1_${user.uid}`;
      const galaxyId = `dummy_galaxy_24_${user.uid}`;

      await deleteDoc(doc(db, 'devices', pixelId));
      await deleteDoc(doc(db, 'devices', xperiaId));
      await deleteDoc(doc(db, 'devices', galaxyId));
    } catch (error) {
      console.error('Error deleting dummy data:', error);
      handleFirestoreError(error, OperationType.DELETE, 'devices');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'devices'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const devs: Device[] = [];
        snapshot.forEach((doc) => {
          devs.push({
            id: doc.id,
            ...doc.data(),
            lastUpdated: doc.data().lastUpdated?.toMillis ? doc.data().lastUpdated.toMillis() : Date.now(),
          } as Device);
        });
        // Sort by deviceName client-side for simplicity since we lack an index
        devs.sort((a, b) => a.deviceName.localeCompare(b.deviceName));
        setDevices(devs);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'devices');
      }
    );

    return () => unsubscribe();
  }, [user.uid]);

  const isStale = (timestampMs: number) => {
    // If we haven't heard from the device in 5 minutes, consider it stale/offline
    return Date.now() - timestampMs > 5 * 60 * 1000;
  };

  const toggleHistory = (deviceId: string) => {
    setShowHistory((prev) => ({ ...prev, [deviceId]: !prev[deviceId] }));
  };

  const formatTime = (ts?: number) => {
    if (!ts) return '-';
    try {
      return format(ts, 'yyyy/MM/dd HH:mm:ss');
    } catch {
      return '-';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Bluetooth className="w-5 h-5 text-blue-600 animate-pulse" />
              </div>
              <h1 className="font-bold text-lg text-slate-900">Bluetooth Link</h1>
            </div>

            <nav className="hidden md:flex items-center gap-1 bg-slate-100/60 p-1 rounded-xl border border-slate-200/40">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                ダッシュボード
              </button>
              <button
                onClick={() => setActiveTab('guide')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'guide'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                使い方ガイド
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2.5 p-1 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-full sm:rounded-xl hover:bg-slate-100/80 transition-all text-left"
                id="profile-dropdown-btn"
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-slate-200 shadow-sm" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200 shadow-sm">
                    <UserIcon className="w-4 h-4 text-blue-600" />
                  </div>
                )}
                <div className="hidden sm:flex flex-col pr-2">
                  <span className="text-xs font-semibold text-slate-700 max-w-[120px] truncate leading-tight">
                    {user.isAnonymous ? 'ゲストユーザー' : user.displayName || user.email}
                  </span>
                  <span className="text-[10px] text-slate-400 capitalize hover:text-blue-500 transition-colors">メニューを表示</span>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 hidden sm:block mr-1.5" />
              </button>

              <AnimatePresence>
                {showProfileMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2.5 w-64 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden z-40 py-2 divide-y divide-slate-100"
                  >
                    <div className="px-4 py-3 bg-slate-50/50">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">アカウント</p>
                      <p className="text-sm font-semibold text-slate-800 mt-1 truncate leading-tight">
                        {user.isAnonymous ? 'Guest User' : user.displayName || 'No name'}
                      </p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{user.email || 'guest-session'}</p>
                    </div>

                    <div className="py-1.5 px-1 space-y-0.5">
                      <button
                        onClick={() => {
                          setActiveTab('dashboard');
                          setShowProfileMenu(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-xl transition-all ${
                          activeTab === 'dashboard'
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-slate-650 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <LayoutDashboard className="w-4 h-4" />
                          <span>ダッシュボード</span>
                        </div>
                        {activeTab === 'dashboard' && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                      </button>

                      <button
                        onClick={() => {
                          setActiveTab('guide');
                          setShowProfileMenu(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-xl transition-all ${
                          activeTab === 'guide'
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-slate-650 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <FileText className="w-4 h-4" />
                          <span>使い方ガイド</span>
                        </div>
                        {activeTab === 'guide' && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                      </button>
                    </div>

                    <div className="py-1.5 px-1 space-y-0.5 border-t border-slate-100">
                      <div className="px-3 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        テストツール (デモ用)
                      </div>
                      <button
                        onClick={() => {
                          handleRegisterDummyData();
                          setShowProfileMenu(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-blue-50/50 hover:text-blue-600 rounded-xl transition-all text-left items-center"
                      >
                        <Database className="w-4 h-4 text-blue-500/80" />
                        <span>デモデータを投入</span>
                      </button>
                      <button
                        onClick={() => {
                          handleDeleteDummyData();
                          setShowProfileMenu(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-red-50/50 hover:text-red-500 rounded-xl transition-all text-left items-center"
                      >
                        <Trash2 className="w-4 h-4 text-red-400/80" />
                        <span>デモデータを削除</span>
                      </button>
                    </div>

                    <div className="py-1 px-1">
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          onSignOut();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-500 hover:text-red-650 hover:bg-red-50/50 rounded-xl transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>サインアウト</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'guide' ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-6 sm:p-10 border border-slate-200 shadow-sm space-y-10"
          >
            <div>
              <div className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-xs font-semibold mb-3">
                <Bluetooth className="w-3.5 h-3.5" /> Service Manual
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">使い方 &amp; 設定ガイド</h2>
              <p className="text-slate-500 mt-2 max-w-2xl text-base">
                本システムは、Android端末にペアリングされたBluetooth機器の接続情報を、複数のスマートデバイス間でリアルタイムに連携・監視するためのシステムです。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">1</span>
                  PWAとしてインストール
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  本ウェブアプリは<strong>PWA (Progressive Web App)</strong>に対応しています。スマートフォンのブラウザメニューから「<strong>アプリをインストール</strong>」または「<strong>ホーム画面に追加</strong>」をタップすることで、通常のネイティブアプリと同じように全画面で素早く起動できるようになります。オフライン時にもキャッシュベースで軽快に動作します。
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">2</span>
                  Androidアプリでの全端末監視
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  ウェブアプリだけでなく、<strong>Androidアプリ側からも同じGoogleアカウントでログイン</strong>することで、接続中の全スマートフォン端末のBluetooth状態を一覧で双方向にモニタリングできます。複数の端末を一元管理するための最も効率的な方法です。
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">3</span>
                  高精度な接続履歴の追跡
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  接続された各アクセサリ（オーディオ機器、ウェアラブル端末、PC、電話等）について、以下の3つのタイムスタンプを詳細に記録・保持しています。
                </p>
                <ul className="text-xs text-slate-500 space-y-1.5 pl-6 list-disc">
                  <li><strong>最初に検出された日時 (First Connected)</strong>: 本システムが初めて接続を記録した時間。</li>
                  <li><strong>最後に検出された日時 (Last Connected)</strong>: 最後に接続中の状態を確認、更新した時間。</li>
                  <li><strong>最後の切断日時 (Last Disconnected)</strong>: 接続から一転して切断が検出された際の切断時間。</li>
                </ul>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">4</span>
                  非接続デバイスのワンタップ展開
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  一度ペアリングを切断したデバイス情報もデータベースから削除されません。「<strong>ペアリング履歴</strong>」のボタンを<strong>ワンタップ</strong>するだけで、これまでに接続された全ての機器のステータス履歴（アクティブ/非アクティブ）および機器の種類（AUDIO, COMPUTER, WEARABLE等）をいつでも確認可能です。
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 mt-6">
              <h4 className="font-bold text-slate-800 text-sm mb-2">💡 Androidアプリの実装ポイント</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Android端末から現在接続されている全てのBluetoothプロファイル（Major Device Class）情報を取得するには、AndroidプロジェクトにBluetoothのパーミッション設定が必要です。詳細はプロジェクトルート内の <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-[11px] text-blue-600">android-instructions.md</code> ガイドラインを参照してください。
              </p>
            </div>
          </motion.div>
        ) : (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900">Your Android Devices</h2>
              <p className="text-slate-500 mt-1">Real-time Bluetooth connection status across all installations.</p>
            </div>


        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-slate-200 h-40 animate-pulse">
                <div className="w-12 h-12 bg-slate-100 rounded-full mb-4"></div>
                <div className="w-32 h-4 bg-slate-100 rounded mb-2"></div>
                <div className="w-24 h-4 bg-slate-100 rounded"></div>
              </div>
            ))}
          </div>
        ) : devices.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 border-dashed">
            <Smartphone className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900">No devices found</h3>
            <p className="text-slate-500 mt-1 max-w-sm mx-auto">
              Install the Android app and log in with this Google account to start monitoring.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {devices.map((device, index) => {
              const stale = isStale(device.lastUpdated);
              // If stale, we might not trust the bluetooth true status, but let's just indicate it's offline.
              const connected = device.bluetoothConnected && !stale;

              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  key={device.id}
                  className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group"
                >
                  <div className="flex items-start justify-between border-b border-slate-100 pb-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl transition-colors ${device.bluetoothPoweredOn !== false ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                        <Smartphone className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-semibold text-slate-900 text-sm line-clamp-1" title={device.deviceName}>
                            {device.deviceName}
                          </h3>
                          {device.id.startsWith('dummy_') && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-50 text-amber-600 border border-amber-200 uppercase tracking-widest leading-none">
                              デモ
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5 mt-1">
                          <span className="text-[10px] text-slate-400 font-mono">ID: {device.id.substring(0, 8)}...</span>
                          <span className={`text-[9px] font-bold uppercase tracking-wider ${
                            device.bluetoothPoweredOn !== false ? 'text-green-600' : 'text-slate-400'
                          }`}>
                            Bluetooth Adapter: {device.bluetoothPoweredOn !== false ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Remote Controller Action Switch */}
                    <div className="flex flex-col items-end gap-1 bg-slate-50/80 p-1.5 rounded-lg border border-slate-100">
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">ON/OFF Remote</span>
                      <button
                        onClick={() => {
                          const currentToggleState = device.requestBluetoothPower ?? device.bluetoothPoweredOn ?? true;
                          toggleBluetoothPower(device.id, currentToggleState);
                        }}
                        disabled={updatingPower[device.id]}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                          (device.requestBluetoothPower ?? device.bluetoothPoweredOn ?? true) ? 'bg-blue-600' : 'bg-slate-300'
                        } ${updatingPower[device.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className="sr-only">Toggle Bluetooth Power</span>
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            (device.requestBluetoothPower ?? device.bluetoothPoweredOn ?? true) ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Bluetooth Status</span>
                      <div className="flex items-center gap-2">
                        {connected ? (
                          <div className="flex items-center gap-2 text-blue-600 font-medium">
                            <Bluetooth className="w-4 h-4" />
                            <span>Connected ({device.connectedDevices?.length || 0})</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-slate-500 font-medium">
                            <BluetoothOff className="w-4 h-4" />
                            <span>Disconnected</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {device.connectedDevices && device.connectedDevices.length > 0 ? (
                      <div className="flex flex-col gap-1.5 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                        <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider flex items-center gap-1">
                          <Bluetooth className="w-3 h-3 animate-pulse" />
                          Connected Accessories ({device.connectedDevices.length})
                        </span>
                        <div className="space-y-1.5 max-h-32 overflow-y-auto">
                          {device.connectedDevices.map((sub, sIdx) => {
                            const isRequestPending = device.disconnectRequests?.includes(sub.address) || false;
                            const isSpinning = disconnecting[`${device.id}-${sub.address}`];
                            const isDummy = device.id.startsWith('dummy_');

                            return (
                              <div key={sIdx} className="flex justify-between items-center text-xs bg-white p-1.5 rounded border border-blue-50 gap-2">
                                <div className="flex flex-col min-w-0 flex-1">
                                  <span className="text-slate-800 font-medium truncate max-w-[150px]">{sub.name || 'Unknown Device'}</span>
                                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                    {sub.type && (
                                      <span className="text-[9px] text-blue-500 font-semibold uppercase tracking-wider">{sub.type}</span>
                                    )}
                                    <span className="text-[9px] text-slate-400 font-mono bg-slate-100 px-1 rounded">{sub.address}</span>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {isRequestPending ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-50 text-amber-600 border border-amber-200 uppercase tracking-wider animate-pulse">
                                      要求中
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => handleDisconnectAccessory(device.id, sub.address, isDummy)}
                                      disabled={isSpinning}
                                      title="このBluetooth機器をリモート切断"
                                      className={`p-1.5 rounded-lg border border-slate-100 text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100 transition-all ${
                                        isSpinning ? 'opacity-50 cursor-not-allowed animate-pulse' : ''
                                      }`}
                                    >
                                      <Unlink className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Connected Accessories</span>
                        <div className="text-xs text-slate-400 italic">No active connected accessories</div>
                      </div>
                    )}

                    {/* Historical Bluetooth Devices List (Collapsible with One-Tap) */}
                    <div>
                      <button
                        onClick={() => toggleHistory(device.id)}
                        className="w-full flex items-center justify-between py-2 px-3 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          Device Coupling History ({device.allDevices?.length || 0})
                        </span>
                        {showHistory[device.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      <AnimatePresence>
                        {showHistory[device.id] && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden mt-2"
                          >
                            <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs max-h-48 overflow-y-auto">
                              {device.allDevices && device.allDevices.length > 0 ? (
                                device.allDevices.map((hist, hIdx) => {
                                  // Determine status among active connections
                                  const isActiveNow = device.connectedDevices?.some((active) => active.address === hist.address) || false;
                                  return (
                                    <div key={hIdx} className="bg-white p-2 rounded border border-slate-100 space-y-1">
                                      <div className="flex justify-between items-start">
                                        <div className="flex flex-col min-w-0">
                                          <span className="text-slate-800 font-medium truncate max-w-[130px]">{hist.name || 'Unknown Device'}</span>
                                          <span className="text-[9px] text-slate-400 font-mono">{hist.address}</span>
                                          {hist.type && <span className="text-[8px] text-slate-500 uppercase font-semibold mt-0.5">{hist.type}</span>}
                                        </div>
                                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                          isActiveNow ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                          {isActiveNow ? <CheckCircle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                                          {isActiveNow ? 'ACTIVE' : 'INACTIVE'}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-x-2 pt-1 border-t border-slate-50 text-[10px] text-slate-500">
                                        <div>
                                          <span className="text-slate-400">First Connected:</span>
                                          <div className="font-mono text-[9px]">{formatTime(hist.firstConnectedAt)}</div>
                                        </div>
                                        <div>
                                          <span className="text-slate-400">Last Connected:</span>
                                          <div className="font-mono text-[9px]">{formatTime(hist.lastConnectedAt)}</div>
                                        </div>
                                        {hist.lastDisconnectedAt && (
                                          <div className="col-span-2 mt-1">
                                            <span className="text-slate-400">Last Disconnected:</span>
                                            <span className="font-mono text-[9px] ml-1">{formatTime(hist.lastDisconnectedAt)}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="text-slate-400 italic text-center text-[11px] py-1">No historical couplings logged.</div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Last Sync</span>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <span>{formatDistanceToNow(device.lastUpdated, { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                  
                  {stale && (
                    <div className="absolute top-0 right-0 left-0 h-1 bg-yellow-400 opacity-50" />
                  )}
                  {connected && !stale && (
                    <div className="absolute top-0 right-0 left-0 h-1 bg-blue-500" />
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
          </>
        )}
      </main>
    </div>
  );
}
