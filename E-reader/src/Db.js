// src/firebase/db.js
// ─────────────────────────────────────────────────────────────────────────────
// All Firestore read/write operations for PageTurn.
//
// DATABASE SCHEMA
// ───────────────
// users/{userId}
//   displayName   string
//   email         string
//   photoURL      string | null
//   color         string          ← avatar colour chosen on signup
//   createdAt     timestamp
//   lastSeen      timestamp
//
// rooms/{roomId}
//   hostId        string          ← userId of creator
//   hostName      string
//   partnerName   string | null
//   bookTitle     string
//   bookContent   string          ← full extracted text (≤ 1 MB Firestore limit)
//   totalPages    number
//   createdAt     timestamp
//   updatedAt     timestamp
//
// rooms/{roomId}/progress/{userId}
//   currentPage   number
//   updatedAt     timestamp
//
// rooms/{roomId}/messages/{messageId}
//   userId        string
//   name          string
//   color         string
//   text          string
//   page          number
//   ts            timestamp
// ─────────────────────────────────────────────────────────────────────────────

import {
  doc, getDoc, setDoc, updateDoc, addDoc,
  collection, query, orderBy, limit,
  onSnapshot, serverTimestamp, writeBatch,
} from "firebase/firestore";
import { db } from "./config";

// ─── Chunk helper (mirrors the one in ReaderPage) ─────────────────────────────
export function chunkText(text, size = 1400) {
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let current = "";
  for (const para of paragraphs) {
    const candidate = current ? current + "\n\n" + para : para;
    if (candidate.length > size && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text];
}

// ─────────────────────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create or update the user document on login.
 * Safe to call every time auth state changes.
 */
export async function upsertUser({ uid, displayName, email, photoURL, color }) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // First login — create full document
    await setDoc(ref, {
      displayName: displayName || "Reader",
      email:       email || "",
      photoURL:    photoURL || null,
      color:       color || "#c2783a",
      createdAt:   serverTimestamp(),
      lastSeen:    serverTimestamp(),
    });
  } else {
    // Returning user — just update lastSeen
    await updateDoc(ref, { lastSeen: serverTimestamp() });
  }
}

/** Fetch a user document once. */
export async function getUser(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOMS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new room and seed the host's progress doc.
 * Returns the roomId (same as the 6-char code the user shares).
 */
export async function createRoom({ roomId, hostId, hostName, bookTitle, bookContent }) {
  const totalPages = chunkText(bookContent).length;

  const batch = writeBatch(db);

  // Room document
  batch.set(doc(db, "rooms", roomId), {
    hostId,
    hostName,
    partnerName: null,
    bookTitle,
    bookContent,
    totalPages,
    createdAt:  serverTimestamp(),
    updatedAt:  serverTimestamp(),
  });

  // Host's initial progress
  batch.set(doc(db, "rooms", roomId, "progress", hostId), {
    currentPage: 0,
    updatedAt:   serverTimestamp(),
  });

  await batch.commit();
  return roomId;
}

/**
 * Join an existing room as the partner.
 * Sets partnerName on the room and seeds the partner's progress doc.
 */
export async function joinRoom({ roomId, userId, userName }) {
  const roomRef = doc(db, "rooms", roomId);
  const snap    = await getDoc(roomRef);
  if (!snap.exists()) throw new Error("Room not found");

  const batch = writeBatch(db);

  batch.update(roomRef, {
    partnerName: userName,
    updatedAt:   serverTimestamp(),
  });

  // Only create progress if it doesn't exist yet
  const progressRef = doc(db, "rooms", roomId, "progress", userId);
  const progressSnap = await getDoc(progressRef);
  if (!progressSnap.exists()) {
    batch.set(progressRef, { currentPage: 0, updatedAt: serverTimestamp() });
  }

  await batch.commit();
  return snap.data();
}

/**
 * Fetch a room document once (for initial load).
 */
export async function getRoom(roomId) {
  const snap = await getDoc(doc(db, "rooms", roomId));
  return snap.exists() ? { roomId, ...snap.data() } : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save the current user's page progress.
 * Called every time they turn a page.
 */
export async function saveProgress({ roomId, userId, currentPage }) {
  await setDoc(
    doc(db, "rooms", roomId, "progress", userId),
    { currentPage, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/**
 * Subscribe to both users' progress in real time.
 * Calls onChange({ myPage, partnerPage }) whenever either changes.
 * Returns the unsubscribe function.
 */
export function subscribeToProgress({ roomId, myUserId, partnerUserId, onChange }) {
  let myPage      = 0;
  let partnerPage = 0;

  const myRef      = doc(db, "rooms", roomId, "progress", myUserId);
  const partnerRef = doc(db, "rooms", roomId, "progress", partnerUserId);

  const unsubMe = onSnapshot(myRef, (snap) => {
    if (snap.exists()) myPage = snap.data().currentPage ?? 0;
    onChange({ myPage, partnerPage });
  });

  const unsubPartner = onSnapshot(partnerRef, (snap) => {
    if (snap.exists()) partnerPage = snap.data().currentPage ?? 0;
    onChange({ myPage, partnerPage });
  });

  return () => { unsubMe(); unsubPartner(); };
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a chat message to the room.
 */
export async function sendMessage({ roomId, userId, name, color, text, page }) {
  await addDoc(collection(db, "rooms", roomId, "messages"), {
    userId, name, color,
    text: text.slice(0, 2000),
    page: page ?? 0,
    ts:   serverTimestamp(),
  });
}

/**
 * Subscribe to the last 100 messages in real time.
 * Calls onChange(messagesArray) on every update.
 * Returns the unsubscribe function.
 */
export function subscribeToMessages({ roomId, onChange }) {
  const q = query(
    collection(db, "rooms", roomId, "messages"),
    orderBy("ts", "asc"),
    limit(100)
  );

  return onSnapshot(q, (snapshot) => {
    const msgs = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      // Convert Firestore Timestamp → JS ms for timeAgo()
      ts: d.data().ts?.toMillis?.() ?? Date.now(),
    }));
    onChange(msgs);
  });
}