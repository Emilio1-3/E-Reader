// src/firebase/config.js
// ─────────────────────────────────────────────────────────────────────────────
// Replace the values below with your own Firebase project credentials.
// Get them from: Firebase Console → Project Settings → Your apps → SDK setup
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAdQ87MyLpfF5a2WaFn2zBgn6YqDxhMY6k",
  authDomain: "e-reading-c8ab2.firebaseapp.com",
  projectId: "e-reading-c8ab2",
  storageBucket: "e-reading-c8ab2.firebasestorage.app",
  messagingSenderId: "273485137438",
  appId: "1:273485137438:web:820a171aedf1efb87d900f",
  measurementId: "G-1BSD4RL79R"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();