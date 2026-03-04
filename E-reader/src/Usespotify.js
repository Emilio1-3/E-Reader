// src/firebase/UseSpotify.js
import { useState, useEffect, useRef, useCallback } from "react";
import { saveMusicState, subscribeMusicState } from "./Db";

// ─── PKCE helpers ─────────────────────────────────────────────────────────────
function base64urlencode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
async function generateCodeChallenge(verifier) {
  const data   = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64urlencode(digest);
}
function randomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map(b => chars[b % chars.length]).join("");
}

const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
].join(" ");

// ─── Spotify API helper ───────────────────────────────────────────────────────
async function spotifyFetch(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Spotify ${res.status}`);
  }
  return res.json();
}

// ─── Fetch ALL playlist types ─────────────────────────────────────────────────
// Covers: personal + collaborative playlists, Daily Mix 1-6, Daylist,
// DJ, Discover Weekly, Release Radar, On Repeat, Repeat Rewind, etc.
async function fetchAllPlaylists(token) {
  const all  = [];
  const seen = new Set();

  const add = (items) => {
    if (!items) return;
    for (const pl of items) {
      if (!pl?.id || seen.has(pl.id)) continue;
      seen.add(pl.id);
      all.push(pl);
    }
  };

  // 1. Page through ALL /me/playlists — fixes missing playlists for large libraries
  //    Old code only fetched limit=30 (first page). Now we paginate up to 500.
  try {
    let url = "https://api.spotify.com/v1/me/playlists?limit=50";
    let pages = 0;
    while (url && pages < 10) {
      const data = await spotifyFetch(url, token);
      add(data?.items);
      url = data?.next || null;
      pages++;
    }
  } catch (e) {
    console.warn("User playlists error:", e);
  }

  // 2. Search for Spotify-curated mixes that may not appear in /me/playlists
  //    (Daily Mix, Daylist, and DJ in particular can be missing for some accounts)
  const curatedTerms = [
    "Daily Mix 1", "Daily Mix 2", "Daily Mix 3",
    "Daily Mix 4", "Daily Mix 5", "Daily Mix 6",
    "daylist", "DJ", "Discover Weekly", "Release Radar",
    "On Repeat", "Repeat Rewind", "Your Top Songs", "Time Capsule",
  ];

  await Promise.allSettled(
    curatedTerms.map(async (term) => {
      try {
        const data = await spotifyFetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(term)}&type=playlist&limit=5`,
          token
        );
        const curated = (data?.playlists?.items || []).filter(
          pl => pl?.owner?.id === "spotify" ||
                pl?.owner?.display_name?.toLowerCase() === "spotify"
        );
        add(curated);
      } catch { /* silently skip */ }
    })
  );

  // 3. Sort: Spotify-curated mixes first (Daily Mix → Daylist → DJ → etc.), then personal
  const CURATED_ORDER = [
    "daily mix", "daylist", " dj", "discover weekly",
    "release radar", "on repeat", "repeat rewind",
    "your top songs", "time capsule",
  ];

  all.sort((a, b) => {
    const aSpotify = a.owner?.id === "spotify" ? 1 : 0;
    const bSpotify = b.owner?.id === "spotify" ? 1 : 0;
    if (aSpotify !== bSpotify) return bSpotify - aSpotify;

    const aName = (a.name || "").toLowerCase();
    const bName = (b.name || "").toLowerCase();
    const aIdx  = CURATED_ORDER.findIndex(k => aName.includes(k));
    const bIdx  = CURATED_ORDER.findIndex(k => bName.includes(k));
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return  1;
    return aName.localeCompare(bName);
  });

  return all;
}

// ─── useSpotify ───────────────────────────────────────────────────────────────
// Both users have full playback control.
// Whoever triggers an action sets suppressSync=true and broadcasts to Firestore.
// The other user's listener picks it up and syncs their player.
export function useSpotify({ roomId, clientId, redirectUri }) {
  const [token,            setToken]            = useState(() => sessionStorage.getItem("sp_token") || null);
  const [player,           setPlayer]           = useState(null);
  const [deviceId,         setDeviceId]         = useState(null);
  const [playerState,      setPlayerState]      = useState(null);
  const [musicSync,        setMusicSync]        = useState(null);
  const [playlists,        setPlaylists]        = useState([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [sdkReady,         setSdkReady]         = useState(false);
  const [connecting,       setConnecting]       = useState(false);
  const [error,            setError]            = useState(null);

  const suppressSync = useRef(false); // true while WE just triggered an action
  const lastSentRef  = useRef(null);  // deduplicate Firestore writes
  const isSyncing    = useRef(false); // prevent concurrent sync applies

  // ── OAuth redirect ─────────────────────────────────────────────────────────
  useEffect(() => {
    const params   = new URLSearchParams(window.location.search);
    const code     = params.get("code");
    const verifier = sessionStorage.getItem("sp_verifier");
    if (!code || !verifier) return;
    window.history.replaceState({}, "", window.location.pathname);

    fetch("https://accounts.spotify.com/api/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId, grant_type: "authorization_code",
        code, redirect_uri: redirectUri, code_verifier: verifier,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.access_token) {
          sessionStorage.setItem("sp_token", data.access_token);
          if (data.refresh_token) sessionStorage.setItem("sp_refresh", data.refresh_token);
          setToken(data.access_token);
          setError(null);
        } else {
          setError("Spotify auth failed: " + (data.error_description || data.error || "unknown"));
        }
        sessionStorage.removeItem("sp_verifier");
      })
      .catch(e => setError("Token exchange failed: " + e.message));
  }, [clientId, redirectUri]);

  // ── Load SDK ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    if (window.Spotify) { setSdkReady(true); return; }
    window.onSpotifyWebPlaybackSDKReady = () => setSdkReady(true);
    if (!document.getElementById("spotify-sdk")) {
      const s = document.createElement("script");
      s.id = "spotify-sdk"; s.src = "https://sdk.scdn.co/spotify-player.js";
      document.head.appendChild(s);
    }
  }, [token]);

  // ── Init player ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sdkReady || !token) return;

    const p = new window.Spotify.Player({
      name: "PageTurn 📚", getOAuthToken: cb => cb(token), volume: 0.6,
    });

    p.addListener("ready",     ({ device_id }) => { setDeviceId(device_id); setConnecting(false); });
    p.addListener("not_ready", () => setDeviceId(null));

    p.addListener("player_state_changed", (state) => {
      if (!state) return;
      setPlayerState(state);

      // Only broadcast to Firestore when we are the active controller
      if (suppressSync.current) {
        const track = state.track_window?.current_track;
        if (!track) return;
        const payload = {
          trackUri:   track.uri,
          trackName:  track.name,
          artistName: track.artists?.[0]?.name || "",
          albumArt:   track.album?.images?.[0]?.url || "",
          albumName:  track.album?.name || "",
          isPlaying:  !state.paused,
          position:   state.position,
          duration:   state.duration || 0,
          sentAt:     Date.now(),
        };
        const last    = lastSentRef.current;
        const changed = !last
          || last.trackUri  !== payload.trackUri
          || last.isPlaying !== payload.isPlaying
          || Math.abs((last.position || 0) - payload.position) > 3000;
        if (changed) {
          lastSentRef.current = payload;
          saveMusicState(roomId, payload).catch(console.error);
        }
      }
    });

    p.addListener("initialization_error", ({ message }) => setError(message));
    p.addListener("authentication_error", ({ message }) => {
      setError(message); sessionStorage.removeItem("sp_token"); setToken(null);
    });
    p.addListener("account_error", ({ message }) => {
      setError("Spotify Premium required. " + message);
    });

    setConnecting(true);
    p.connect();
    setPlayer(p);
    return () => p.disconnect();
  }, [sdkReady, token, roomId]);

  // ── Fetch all playlists ────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    setLoadingPlaylists(true);
    fetchAllPlaylists(token)
      .then(setPlaylists)
      .catch(e => console.error("Playlist fetch:", e))
      .finally(() => setLoadingPlaylists(false));
  }, [token]);

  // ── Subscribe to Firestore music state ────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    return subscribeMusicState(roomId, setMusicSync);
  }, [roomId]);

  // ── Apply incoming sync from the other user ────────────────────────────────
  useEffect(() => {
    if (!musicSync || !deviceId || !token) return;
    if (suppressSync.current) return;   // we just sent this — skip
    if (isSyncing.current) return;      // already applying

    const age = Date.now() - (musicSync.sentAt || 0);
    if (age > 30_000) return;           // stale — ignore

    // Already in sync — skip
    const localTrack  = playerState?.track_window?.current_track?.uri;
    const localPaused = playerState?.paused;
    if (localTrack === musicSync.trackUri && localPaused === !musicSync.isPlaying) return;

    isSyncing.current = true;
    (async () => {
      try {
        const drift    = Date.now() - (musicSync.sentAt || Date.now());
        const position = Math.max(0, (musicSync.position || 0) + drift);

        await fetch("https://api.spotify.com/v1/me/player", {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ device_ids: [deviceId], play: false }),
        });
        await new Promise(r => setTimeout(r, 300));

        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ uris: [musicSync.trackUri], position_ms: position }),
        });

        if (!musicSync.isPlaying) {
          await new Promise(r => setTimeout(r, 400));
          await fetch("https://api.spotify.com/v1/me/player/pause", {
            method: "PUT", headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch (e) {
        console.error("Sync apply error:", e);
      } finally {
        isSyncing.current = false;
      }
    })();
  }, [musicSync?.trackUri, musicSync?.isPlaying, musicSync?.sentAt, deviceId, token]);

  // ── Auth ───────────────────────────────────────────────────────────────────
  const login = useCallback(async () => {
    const verifier  = randomString(64);
    const challenge = await generateCodeChallenge(verifier);
    sessionStorage.setItem("sp_verifier", verifier);
    const params = new URLSearchParams({
      client_id: clientId, response_type: "code", redirect_uri: redirectUri,
      scope: SCOPES, code_challenge_method: "S256", code_challenge: challenge,
    });
    window.location.href = `https://accounts.spotify.com/authorize?${params}`;
  }, [clientId, redirectUri]);

  const logout = useCallback(() => {
    sessionStorage.removeItem("sp_token");
    sessionStorage.removeItem("sp_refresh");
    setToken(null); setPlayer(null); setDeviceId(null);
    setPlayerState(null); setPlaylists([]);
    player?.disconnect();
  }, [player]);

  // ── Playback controls — available to BOTH users ───────────────────────────
  const withControl = (fn) => async (...args) => {
    suppressSync.current = true;
    try { await fn(...args); }
    finally { setTimeout(() => { suppressSync.current = false; }, 3000); }
  };

  const playPlaylist = useCallback(withControl(async (contextUri) => {
    if (!token || !deviceId) return;
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ context_uri: contextUri }),
    });
  }), [token, deviceId]);

  const togglePlay = useCallback(withControl(async () => { await player?.togglePlay(); }), [player]);
  const nextTrack  = useCallback(withControl(async () => { await player?.nextTrack(); }), [player]);
  const prevTrack  = useCallback(withControl(async () => { await player?.previousTrack(); }), [player]);
  const setVolume  = useCallback((v) => player?.setVolume(v), [player]);

  return {
    token, login, logout,
    player, deviceId, connecting,
    playerState, musicSync,
    playlists, loadingPlaylists,
    sdkReady, error,
    playPlaylist, togglePlay, nextTrack, prevTrack, setVolume,
  };
}