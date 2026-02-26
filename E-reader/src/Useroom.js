// src/firebase/Useroom.js
import { useState, useEffect, useRef, useCallback } from 'react';
import {
	subscribeToProgress,
	subscribeToMessages,
	subscribeToRoom,
	saveProgress,
	sendMessage as dbSendMessage,
} from './Db';

export function useRoom({
	roomId,
	myUserId,
	partnerUserId: seedPartnerUserId,
	myName,
	myColor,
}) {
	const [myPage, setMyPage] = useState(0);
	const [partnerPage, setPartnerPage] = useState(0);
	const [messages, setMessages] = useState([]);
	const [loaded, setLoaded] = useState(false);
	const [livePartner, setLivePartner] = useState(null);
	const [activePartnerId, setActivePartnerId] = useState(
		seedPartnerUserId || null,
	);

	const saveTimer = useRef(null);

	// ── 1. Subscribe to the room doc ────────────────────────────────────────────
	// Fires immediately on mount and on every change.
	// Works out which user is "me" and which is "partner" from the room doc,
	// so it correctly resolves livePartner for BOTH the host and the joining user.
	useEffect(() => {
		if (!roomId || !myUserId) return;
		return subscribeToRoom(roomId, (roomData) => {
			const hostId = roomData.hostId || null;
			const hostName = roomData.hostName || null;
			const partnerId = roomData.partnerId || null;
			const partnerName = roomData.partnerName || null;

			const amHost = myUserId === hostId;

			if (amHost) {
				// I am the host — my partner is whoever joined as partnerId
				if (partnerId && partnerName) {
					setLivePartner((prev) => ({
						userId: partnerId,
						name: partnerName,
						color: prev?.userId === partnerId ? prev?.color : undefined,
					}));
					setActivePartnerId((prev) => (prev === partnerId ? prev : partnerId));
				}
			} else {
				// I am the joining user — my partner is the host
				if (hostId && hostName) {
					setLivePartner((prev) => ({
						userId: hostId,
						name: hostName,
						color: prev?.userId === hostId ? prev?.color : undefined,
					}));
					setActivePartnerId((prev) => (prev === hostId ? prev : hostId));
				}
			}
		});
	}, [roomId, myUserId]);

	// ── 2. Subscribe to progress ─────────────────────────────────────────────────
	// Re-runs whenever activePartnerId changes so both sides track each other live
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
	const savePage = useCallback(
		(page) => {
			setMyPage(page);
			clearTimeout(saveTimer.current);
			saveTimer.current = setTimeout(() => {
				if (roomId && myUserId) {
					saveProgress({ roomId, userId: myUserId, currentPage: page }).catch(
						console.error,
					);
				}
			}, 600);
		},
		[roomId, myUserId],
	);

	// ── Send message ─────────────────────────────────────────────────────────────
	const sendMessage = useCallback(
		(text, page) => {
			if (!roomId || !myUserId) return;
			dbSendMessage({
				roomId,
				userId: myUserId,
				name: myName,
				color: myColor,
				text,
				page,
			}).catch(console.error);
		},
		[roomId, myUserId, myName, myColor],
	);

	return {
		myPage,
		partnerPage,
		messages,
		savePage,
		sendMessage,
		loaded,
		livePartner,
	};
}
