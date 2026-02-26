// src/firebase/Db.js
import {
  doc, getDoc, setDoc, updateDoc, addDoc,
  collection, query, orderBy, limit,
  onSnapshot, serverTimestamp, writeBatch,
} from "firebase/firestore";
import { db } from "./config";

// ─── PDF Chunked Upload ───────────────────────────────────────────────────────
const CHUNK_SIZE = 600_000;

export async function uploadPdfChunked(file, roomId, onProgress) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);
  onProgress?.(0);

  for (let i = 0; i < totalChunks; i++) {
    const chunk = base64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    await setDoc(doc(db, "rooms", roomId, "pdfChunks", String(i)), {
      index: i,
      data:  chunk,
    });
    onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
  }

  return totalChunks;
}

export async function downloadPdfChunked(roomId, totalChunks, onProgress) {
  const parts = [];
  for (let i = 0; i < totalChunks; i++) {
    const snap = await getDoc(doc(db, "rooms", roomId, "pdfChunks", String(i)));
    if (!snap.exists()) throw new Error(`Missing chunk ${i}`);
    parts.push(snap.data().data);
    onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
  }
  return parts.join("");
}

// ─── USERS ────────────────────────────────────────────────────────────────────

export async function upsertUser({ uid, displayName, email, photoURL, color }) {
  const ref2 = doc(db, "users", uid);
  const snap = await getDoc(ref2);
  if (!snap.exists()) {
    await setDoc(ref2, {
      displayName: displayName || "Reader",
      email:       email       || "",
      photoURL:    photoURL    || null,
      color:       color       || "#c2783a",
      createdAt:   serverTimestamp(),
      lastSeen:    serverTimestamp(),
    });
  } else {
    await updateDoc(ref2, { lastSeen: serverTimestamp() });
  }
}

export async function getUser(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

export async function updateUser(uid, fields) {
  await updateDoc(doc(db, "users", uid), { ...fields, lastSeen: serverTimestamp() });
}

// ─── ROOMS ────────────────────────────────────────────────────────────────────

export async function createRoom({ roomId, hostId, hostName, bookTitle, totalChunks }) {
  const batch = writeBatch(db);

  batch.set(doc(db, "rooms", roomId), {
    hostId,
    hostName,
    partnerId:    null,   // ← will be filled when partner joins
    partnerName:  null,
    bookTitle,
    totalChunks,
    createdAt:    serverTimestamp(),
    updatedAt:    serverTimestamp(),
  });

  batch.set(doc(db, "rooms", roomId, "progress", hostId), {
    currentPage: 0,
    updatedAt:   serverTimestamp(),
  });

  await batch.commit();
  return roomId;
}

export async function joinRoom({ roomId, userId, userName }) {
  const roomRef = doc(db, "rooms", roomId);
  const snap    = await getDoc(roomRef);
  if (!snap.exists()) throw new Error("Room not found");
  const data = snap.data();

  const batch = writeBatch(db);
  // ✅ Write both partnerId AND partnerName so the host can subscribe to partner's progress
  batch.update(roomRef, {
    partnerId:   userId,
    partnerName: userName,
    updatedAt:   serverTimestamp(),
  });

  const progressRef  = doc(db, "rooms", roomId, "progress", userId);
  const progressSnap = await getDoc(progressRef);
  if (!progressSnap.exists()) {
    batch.set(progressRef, { currentPage: 0, updatedAt: serverTimestamp() });
  }

  await batch.commit();
  return data;
}

export async function getRoom(roomId) {
  const snap = await getDoc(doc(db, "rooms", roomId));
  return snap.exists() ? { roomId, ...snap.data() } : null;
}

/** Subscribe to a room doc — fires whenever partner joins or room metadata changes */
export function subscribeToRoom(roomId, onChange) {
  return onSnapshot(doc(db, "rooms", roomId), (snap) => {
    if (snap.exists()) onChange({ roomId, ...snap.data() });
  });
}

/** Delete a room and all its subcollection docs (host only) */
export async function deleteRoom(roomId) {
  const chunksSnap  = await getDoc(doc(db, "rooms", roomId));
  const totalChunks = chunksSnap.exists() ? (chunksSnap.data().totalChunks || 0) : 0;

  const batch = writeBatch(db);
  for (let i = 0; i < totalChunks; i++) {
    batch.delete(doc(db, "rooms", roomId, "pdfChunks", String(i)));
  }
  batch.delete(doc(db, "rooms", roomId));
  await batch.commit();
}

// ─── PROGRESS ─────────────────────────────────────────────────────────────────

export async function saveProgress({ roomId, userId, currentPage }) {
  await setDoc(
    doc(db, "rooms", roomId, "progress", userId),
    { currentPage, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export function subscribeToProgress({ roomId, myUserId, partnerUserId, onChange }) {
  let myPage      = 0;
  let partnerPage = 0;

  const myRef   = doc(db, "rooms", roomId, "progress", myUserId);
  const unsubMe = onSnapshot(myRef, (snap) => {
    if (snap.exists()) myPage = snap.data().currentPage ?? 0;
    onChange({ myPage, partnerPage });
  });

  let unsubPartner = () => {};
  if (partnerUserId) {
    const partnerRef = doc(db, "rooms", roomId, "progress", partnerUserId);
    unsubPartner = onSnapshot(partnerRef, (snap) => {
      if (snap.exists()) partnerPage = snap.data().currentPage ?? 0;
      onChange({ myPage, partnerPage });
    });
  }

  return () => { unsubMe(); unsubPartner(); };
}

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

export async function sendMessage({ roomId, userId, name, color, text, page }) {
  await addDoc(collection(db, "rooms", roomId, "messages"), {
    userId, name, color,
    text: text.slice(0, 2000),
    page: page ?? 0,
    ts:   serverTimestamp(),
  });
}

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
      ts: d.data().ts?.toMillis?.() ?? Date.now(),
    }));
    onChange(msgs);
  });
}