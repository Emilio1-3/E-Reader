// src/firebase/useAuth.js
// ─────────────────────────────────────────────────────────────────────────────
// Wraps Firebase Auth into a clean React hook.
//
// Usage:
//   const { user, profile, loading, signInWithGoogle, signOut } = useAuth();
//
//   user     → Firebase User object (null if signed out)
//   profile  → Firestore user document { displayName, color, ... }
//   loading  → true while checking auth state on first render
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import {
	onAuthStateChanged,
	signInWithPopup,
	signOut as firebaseSignOut,
	updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from './config';
import { upsertUser, getUser } from './Db';

const COLORS = [
	'#c2783a',
	'#6b8f71',
	'#7a6fa0',
	'#b5804a',
	'#4f7fa3',
	'#a05a6b',
	'#c2785a',
	'#4a8fa0',
];
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

export function useAuth() {
	const [user, setUser] = useState(null); // Firebase Auth user
	const [profile, setProfile] = useState(null); // Firestore profile doc
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
			if (firebaseUser) {
				setUser(firebaseUser);
				// Sync to Firestore and fetch profile
				await upsertUser({
					uid: firebaseUser.uid,
					displayName: firebaseUser.displayName,
					email: firebaseUser.email,
					photoURL: firebaseUser.photoURL,
					color: randomColor(), // only used on first sign-up
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

	// ── Google sign-in (popup)
	const signInWithGoogle = async () => {
		try {
			await signInWithPopup(auth, googleProvider);
		} catch (err) {
			console.error('Google sign-in failed:', err);
			throw err;
		}
	};

	// ── Email/password sign-in handled separately in AuthScreen
	// ── (import createUserWithEmailAndPassword / signInWithEmailAndPassword there)

	// ── Sign out
	const signOut = async () => {
		await firebaseSignOut(auth);
	};

	// ── Update display name (e.g. on first login with email)
	const updateDisplayName = async (displayName) => {
		if (!auth.currentUser) return;
		await updateProfile(auth.currentUser, { displayName });
		setProfile((p) => ({ ...p, displayName }));
	};

	return {
		user,
		profile,
		loading,
		signInWithGoogle,
		signOut,
		updateDisplayName,
	};
}
