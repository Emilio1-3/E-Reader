// src/firebase/Useroom.js
import { useState, useEffect, useRef, useCallback } from "react";
import {
  subscribeToProgress,
  subscribeToMessages,
  subscribeToRoom,
  saveProgress,
  sendMessage as dbSendMessage,
} from "./Db";

export function useRoom({ roomId, myUserId, partnerUserId: seedPartnerUserId, myName, myColor }) {
  const [myPage,      setMyPage]      = useState(0);
  const [partnerPage, setPartnerPage] = useState(0);
  const [messages,    setMessages]    = useState([]);
  const [loaded,      setLoaded]      = useState(false);
  // Live partner resolved from the room doc (always up to date)
  const [livePartner, setLivePartner] = useState(null);
  // The partner userId we're currently subscribed to for progress
  const [activePartnerId, setActivePartnerId] = useState(seedPartnerUserId || null);

  const saveTimer = useRef(null);

  // ── 1. Subscribe to the room doc ────────────────────────────────────────────
  // This fires immediately and again any time the doc changes.
  // As soon as a partner joins, their partnerId + partnerName appear here.
  useEffect(() => {
    if (!roomId) return;
    return subscribeToRoom(roomId, (roomData) => {
      const pid   = roomData.partnerId   || null;
      const pname = roomData.partnerName || null;
      const hid   = roomData.hostId      || null;
      const hname = roomData.hostName    || null;

      if (pid && pname) {
        // Update live partner info (name stays fresh if they rename)
        setLivePartner(prev => ({
          userId: pid,
          name:   pname,
          // preserve color if we already fetched it
          color: prev?.userId === pid ? prev?.color : undefined,
        }));

        // If we now have a partner userId we weren't subscribed to before, start tracking them
        setActivePartnerId(prev => (prev === pid ? prev : pid));
      }
    });
  }, [roomId]);

  // ── 2. Subscribe to progress ─────────────────────────────────────────────────
  // Re-runs whenever activePartnerId changes (e.g. host gets partner after waiting)
  useEffect(() => {
    if (!roomId || !myUserId) return;

    const unsub = subscribeToProgress({
      roomId,
      myUserId,
      partnerUserId: activePartnerId,
      onChange: ({ myPage: mp, partnerPage: pp }) => {
        setMyPage(mp);
        setPartnerPage(pp);
        setLoaded(true);
      },
    });

    return unsub;
  }, [roomId, myUserId, activePartnerId]);

  // ── 3. Subscribe to messages ─────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    return subscribeToMessages({ roomId, onChange: setMessages });
  }, [roomId]);

  // ── Save page (debounced 600ms) ──────────────────────────────────────────────
  const savePage = useCallback((page) => {
    setMyPage(page);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (roomId && myUserId) {
        saveProgress({ roomId, userId: myUserId, currentPage: page }).catch(console.error);
      }
    }, 600);
  }, [roomId, myUserId]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback((text, page) => {
    if (!roomId || !myUserId) return;
    dbSendMessage({
      roomId,
      userId: myUserId,
      name:   myName,
      color:  myColor,
      text,
      page,
    }).catch(console.error);
  }, [roomId, myUserId, myName, myColor]);

  return { myPage, partnerPage, messages, savePage, sendMessage, loaded, livePartner };
}