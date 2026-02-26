// src/firebase/UseAuth.js
import { useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from './config';
import { upsertUser, getUser, updateUser } from './Db';

export function useAuth() {
  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // upsertUser will NOT overwrite color on existing users
        await upsertUser({
          uid:         firebaseUser.uid,
          displayName: firebaseUser.displayName,
          email:       firebaseUser.email,
          photoURL:    firebaseUser.photoURL,
          // color is only used if this is the first time (doc doesn't exist)
          // For Google sign-in, we assign a random one
          color: "#c2783a",
        });
        const p = await getUser(firebaseUser.uid);
        setProfile(p);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
    // onAuthStateChanged handles the rest
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  // Update both Firebase Auth profile and Firestore doc
  const updateUserProfile = useCallback(async ({ displayName, color }) => {
    if (!auth.currentUser) return;
    const updates = {};
    if (displayName !== undefined) {
      await updateProfile(auth.currentUser, { displayName });
      updates.displayName = displayName;
    }
    if (color !== undefined) updates.color = color;
    if (Object.keys(updates).length > 0) {
      await updateUser(auth.currentUser.uid, updates);
      setProfile(p => ({ ...p, ...updates }));
    }
  }, []);

  // Reload profile from Firestore (useful after external updates)
  const reloadProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    const p = await getUser(auth.currentUser.uid);
    setProfile(p);
  }, []);

  return {
    user,
    profile,
    loading,
    signInWithGoogle,
    signOut,
    updateUserProfile,
    reloadProfile,
  };
}