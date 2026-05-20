/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, signInWithPopup, GoogleAuthProvider, signOut, signInAnonymously } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth, db } from './firebase/config';
import { doc, getDocFromServer } from 'firebase/firestore';
import Dashboard from './components/Dashboard';
import { LogIn, Activity, UserCircle, Copy, Check, ExternalLink, AlertTriangle, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [isUnauthorizedDomain, setIsUnauthorizedDomain] = useState(false);
  const [firestoreOffline, setFirestoreOffline] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);

  const testConnection = async () => {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      setFirestoreOffline(false);
    } catch (error: any) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error('Please check your Firebase configuration.');
        setFirestoreOffline(true);
      } else {
        // If it's permission-denied, Firestore is working fine but access is secured, which is expected!
        setFirestoreOffline(false);
      }
    }
  };

  useEffect(() => {
    testConnection();

    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    setErrorStatus(null);
    setIsUnauthorizedDomain(false);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      console.error(e);
      if (e.code === 'auth/unauthorized-domain' || String(e).includes('unauthorized-domain')) {
        setIsUnauthorizedDomain(true);
        setErrorStatus('auth/unauthorized-domain');
      } else {
        setErrorStatus(e.message || String(e));
      }
    }
  };

  const handleAnonymousSignIn = async () => {
    setErrorStatus(null);
    setIsUnauthorizedDomain(false);
    try {
      await signInAnonymously(auth);
    } catch (e: any) {
      console.error(e);
      if (e.code === 'auth/admin-restricted-operation' || String(e).includes('admin-restricted-operation')) {
        setErrorStatus(
          'Firebase Consoleで「匿名認証 (Anonymous)」プロバイダが有効化されていない可能性があります。\nFirebase Console > Authentication > Sign-in method で 匿名 のスイッチを有効にするか、または Google ログインをお試しください。'
        );
      } else if (e.code === 'auth/unauthorized-domain' || String(e).includes('unauthorized-domain')) {
        setIsUnauthorizedDomain(true);
        setErrorStatus('auth/unauthorized-domain');
      } else {
        setErrorStatus(e.message || String(e));
      }
    }
  };

  const handleSignOut = () => signOut(auth);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDomain(text);
    setTimeout(() => setCopiedDomain(null), 2000);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Activity className="w-8 h-8 text-slate-400 animate-pulse" />
      </div>
    );
  }

  const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const domainsToAuthorize = [
    currentDomain,
    'ais-dev-m2xdgdipcs3ud2jmfhbluk-800440726721.asia-east1.run.app',
    'ais-pre-m2xdgdipcs3ud2jmfhbluk-800440726721.asia-east1.run.app',
    'bluetooth-moukaeritai-work.web.app',
    'bluetooth-moukaeritai-work.firebaseapp.com',
    'bluetooth.moukaeritai.work'
  ].filter((value, index, self) => self.indexOf(value) === index); // unique list

  if (!user) {
    const hasErrorOrWarning = isUnauthorizedDomain || firestoreOffline;

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className={`w-full ${hasErrorOrWarning ? 'max-w-4xl' : 'max-w-md'} transition-all duration-300`}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            
            {/* Main Login Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`bg-white p-8 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-center ${
                hasErrorOrWarning ? 'lg:col-span-6' : 'lg:col-span-12'
              }`}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Activity className="w-8 h-8 text-blue-600 animate-pulse" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Device Monitor</h1>
                <p className="text-slate-500 mb-8 text-sm">
                  Sign in or continue as guest to monitor your Android devices' Bluetooth status.
                </p>

                <div className="space-y-3">
                  <button
                    onClick={handleSignIn}
                    className="w-full flex items-center justify-center gap-2.5 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl font-medium transition-colors cursor-pointer"
                  >
                    <LogIn className="w-5 h-5" />
                    Sign in with Google
                  </button>
                  <button
                    onClick={handleAnonymousSignIn}
                    className="w-full flex items-center justify-center gap-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-4 rounded-xl font-medium transition-colors cursor-pointer"
                  >
                    <UserCircle className="w-5 h-5" />
                    Continue as Guest
                  </button>
                </div>

                {errorStatus && errorStatus !== 'auth/unauthorized-domain' && (
                  <div className="mt-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-left text-xs whitespace-pre-line">
                    <span className="font-bold flex items-center gap-1.5 mb-1.5 text-sm">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      接続・ログインエラー
                    </span>
                    {errorStatus}
                  </div>
                )}

                {isUnauthorizedDomain && (
                  <div className="mt-6 p-4 bg-amber-50 border border-amber-250 text-amber-800 rounded-xl text-left text-xs">
                    <span className="font-bold flex items-center gap-1.5 mb-1.5 text-sm text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      承認されていないドメイン
                    </span>
                    <p className="mb-2 leading-relaxed">
                      このドメインからの認証リクエストが Firebase プロジェクトで承認されていません。右側のダッシュボード手順に沿って設定を行ってください。
                    </p>
                  </div>
                )}

                {firestoreOffline && !isUnauthorizedDomain && (
                  <div className="mt-6 p-4 bg-amber-50 border border-amber-250 text-amber-800 rounded-xl text-left text-xs">
                    <span className="font-bold flex items-center gap-1.5 mb-1.5 text-sm text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      Firebase 接続確認エラー
                    </span>
                    <p className="leading-relaxed mb-3">
                      Firestoreに接続できません。Firebase コンソールで <strong>Firestore Database</strong> が有効化されていない、またはプロジェクトの構成が間違っている可能性があります。
                    </p>
                    <button
                      onClick={testConnection}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> 再接続テスト
                    </button>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Interactive Troubleshooter Sidebar */}
            {hasErrorOrWarning && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-slate-900 text-slate-100 p-6 sm:p-8 rounded-2xl border border-slate-800 shadow-xl lg:col-span-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Activity className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <h2 className="text-md font-bold text-white">Firebase 連携セットアップ</h2>
                      <p className="text-[10px] text-slate-400">moukaeritaid プロジェクト設定ガイド</p>
                    </div>
                  </div>

                  <div className="space-y-6 text-xs text-slate-350">
                    
                    {/* Step 1 */}
                    <div className="space-y-2">
                      <h3 className="font-semibold text-white flex items-center gap-2">
                        <span className="w-5 h-5 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center font-mono text-xs">1</span>
                        承認済みドメインの追加 (必須)
                      </h3>
                      <p className="leading-relaxed">
                        Firebase Authentication でブラウザログインを許可するために、以下のドメインを全て<strong>「承認済みドメイン」</strong>に追加してください。
                      </p>
                      
                      <div className="bg-slate-950/80 rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-800/60 font-mono mt-2">
                        {domainsToAuthorize.map((domain) => (
                          <div key={domain} className="flex justify-between items-center py-2 px-3 text-[10px] hover:bg-slate-900 transition-colors">
                            <span className="truncate pr-2 text-slate-300 select-all" title={domain}>{domain}</span>
                            <button
                              onClick={() => handleCopy(domain)}
                              className="px-2 py-1 text-[9px] font-semibold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-805 rounded transition-all flex items-center gap-1 cursor-pointer shrink-0"
                            >
                              {copiedDomain === domain ? (
                                <>
                                  <Check className="w-3 h-3 text-green-400" />
                                  <span>コピー済</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>コピー</span>
                                </>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                      
                      <div className="pt-1.5 flex flex-wrap gap-2 text-[10px] text-slate-400">
                        <span>場所: Firebase Console &gt; Authentication &gt; Settings &gt; Authorized domains</span>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className="space-y-2 border-t border-slate-800/60 pt-4">
                      <h3 className="font-semibold text-white flex items-center gap-2">
                        <span className="w-5 h-5 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center font-mono text-xs">2</span>
                        サインイン プロバイダの有効化
                      </h3>
                      <p className="leading-relaxed">
                        下記プロバイダを有効にしてください。
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-sans">
                        <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-800/80 flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-blue-400" />
                          <div>
                            <p className="font-medium text-slate-200">Google ログイン</p>
                            <p className="text-[9px] text-slate-500">Google認証用</p>
                          </div>
                        </div>
                        <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-800/80 flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-purple-400" />
                          <div>
                            <p className="font-medium text-slate-200">匿名認証 (Guest)</p>
                            <p className="text-[9px] text-slate-500">ゲスト用</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div className="space-y-2 border-t border-slate-800/60 pt-4">
                      <h3 className="font-semibold text-white flex items-center gap-2">
                        <span className="w-5 h-5 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center font-mono text-xs">3</span>
                        Firestore Database の作成
                      </h3>
                      <p className="leading-relaxed">
                        Firebase プロジェクト「<strong>moukaeritaid</strong>」の左メニューから <strong>Firestore Database</strong> を開き、データベースを作成（本番環境またはテスト環境）しているかご確認ください。
                      </p>
                    </div>

                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between">
                  <a
                    href="https://console.firebase.google.com/project/moukaeritaid/authentication"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
                  >
                    Authentication 設定を開く
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href="https://console.firebase.google.com/project/moukaeritaid/firestore"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
                  >
                    Firestore 設定を開く
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

              </motion.div>
            )}

          </div>
        </div>
      </div>
    );
  }

  return <Dashboard user={user} onSignOut={handleSignOut} />;
}
