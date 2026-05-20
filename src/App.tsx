/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, signInWithPopup, GoogleAuthProvider, signOut, signInAnonymously } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth, db } from './firebase/config';
import { doc, getDocFromServer } from 'firebase/firestore';
import Dashboard from './components/Dashboard';
import { LogIn, Activity, UserCircle } from 'lucide-react';
import { motion } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    // Check initial Firestore connection
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error('Please check your Firebase configuration.');
        }
      }
    }
    testConnection();

    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAnonymousSignIn = async () => {
    try {
      await signInAnonymously(auth);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSignOut = () => signOut(auth);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Activity className="w-8 h-8 text-slate-400 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-sm w-full text-center"
        >
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Activity className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">Device Monitor</h1>
          <p className="text-slate-500 mb-8">Sign in or continue as guest to monitor your Android devices' Bluetooth status.</p>
          <button
            onClick={handleSignIn}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl font-medium transition-colors mb-3"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
          <button
            onClick={handleAnonymousSignIn}
            className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-4 rounded-xl font-medium transition-colors"
          >
            <UserCircle className="w-5 h-5" />
            Continue as Guest
          </button>
        </motion.div>
      </div>
    );
  }

  return <Dashboard user={user} onSignOut={handleSignOut} />;
}
