// src/firebase/useRoom.js
// ─────────────────────────────────────────────────────────────────────────────
// Connects ReaderPage to Firestore.
// Handles real-time page sync, message sync, and saving progress.
//
// Usage inside ReaderPage:
//
//   const {
//     myPage, partnerPage,
//     messages, sendMessage,
//     savePage, loaded,
//   } = useRoom({ roomId, myUserId, partnerUserId });
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import {
  subscribeToProgress,
  subscribeToMessages,
  saveProgress,
  sendMessage as dbSendMessage,
} from "./Db";

export function useRoom({ roomId, myUserId, partnerUserId, myName, myColor }) {
  const [myPage,      setMyPage]      = useState(0);
  const [partnerPage, setPartnerPage] = useState(0);
  const [messages,    setMessages]    = useState([]);
  const [loaded,      setLoaded]      = useState(false);

  // Debounce page saves — don't write on every single arrow click
  const saveTimer = useRef(null);

  // ── Subscribe to both users' progress
  useEffect(() => {
    if (!roomId || !myUserId || !partnerUserId) return;

    const unsub = subscribeToProgress({
      roomId, myUserId, partnerUserId,
      onChange: ({ myPage: mp, partnerPage: pp }) => {
        setMyPage(mp);
        setPartnerPage(pp);
        setLoaded(true);
      },
    });

    return unsub;
  }, [roomId, myUserId, partnerUserId]);

  // ── Subscribe to messages
  useEffect(() => {
    if (!roomId) return;
    const unsub = subscribeToMessages({
      roomId,
      onChange: setMessages,
    });
    return unsub;
  }, [roomId]);

  // ── Save my page (debounced 800ms)
  const savePage = useCallback((page) => {
    setMyPage(page);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveProgress({ roomId, userId: myUserId, currentPage: page }).catch(console.error);
    }, 800);
  }, [roomId, myUserId]);

  // ── Send a message
  const sendMessage = useCallback((text, page) => {
    dbSendMessage({
      roomId,
      userId: myUserId,
      name:   myName,
      color:  myColor,
      text,
      page,
    }).catch(console.error);
  }, [roomId, myUserId, myName, myColor]);

  return { myPage, partnerPage, messages, savePage, sendMessage, loaded };
}