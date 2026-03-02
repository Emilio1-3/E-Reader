// src/firebase/UseSpotify.js
import { useState, useEffect, useRef, useCallback } from "react";
import { saveMusicState, subscribeMusicState } from "./Db";

// ─── PKCE helpers ─────────────────────────────────────────────────────────────
function base64urlencode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
async function generateCodeChallenge(verifier) {
  const data    = new TextEncoder().encode(verifier);
  const digest  = await crypto.subtle.digest("SHA-256", data);
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
].join(" ");

// ─── useSpotify ───────────────────────────────────────────────────────────────
export function useSpotify({ roomId, isHost, clientId, redirectUri }) {
  const [token,         setToken]         = useState(() => sessionStorage.getItem("sp_token") || null);
  const [player,        setPlayer]        = useState(null);
  const [deviceId,      setDeviceId]      = useState(null);
  const [playerState,   setPlayerState]   = useState(null);  // local Spotify state
  const [musicSync,     setMusicSync]     = useState(null);  // Firestore sync state
  const [playlists,     setPlaylists]     = useState([]);
  const [sdkReady,      setSdkReady]      = useState(false);
  const [connecting,    setConnecting]    = useState(false);
  const [error,         setError]         = useState(null);

  const syncRef        = useRef(null);    // latest Firestore music state
  const playerRef      = useRef(null);
  const suppressSync   = useRef(false);   // avoid feedback loops when we apply sync
  const lastSentRef    = useRef(null);    // avoid spamming Firestore with identical state

  // ── Handle OAuth redirect ────────────────────────────────────────────────────
  useEffect(() => {
    const params   = new URLSearchParams(window.location.search);
    const code     = params.get("code");
    const verifier = sessionStorage.getItem("sp_verifier");

    if (code && verifier) {
      // Clear URL
      window.history.replaceState({}, "", window.location.pathname);

      fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id:     clientId,
          grant_type:    "authorization_code",
          code,
          redirect_uri:  redirectUri,
          code_verifier: verifier,
        }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.access_token) {
            sessionStorage.setItem("sp_token", data.access_token);
            // Store refresh token if provided
            if (data.refresh_token) sessionStorage.setItem("sp_refresh", data.refresh_token);
            setToken(data.access_token);
          } else {
            setError("Spotify auth failed: " + (data.error_description || data.error));
          }
          sessionStorage.removeItem("sp_verifier");
        })
        .catch(e => setError("Spotify token exchange failed: " + e.message));
    }
  }, [clientId, redirectUri]);

  // ── Load Spotify Web Playback SDK ────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    if (window.Spotify) { setSdkReady(true); return; }

    window.onSpotifyWebPlaybackSDKReady = () => setSdkReady(true);

    if (!document.getElementById("spotify-sdk")) {
      const script = document.createElement("script");
      script.id    = "spotify-sdk";
      script.src   = "https://sdk.scdn.co/spotify-player.js";
      document.head.appendChild(script);
    }
  }, [token]);

  // ── Initialise player once SDK is ready ─────────────────────────────────────
  useEffect(() => {
    if (!sdkReady || !token) return;

    const p = new window.Spotify.Player({
      name:              "PageTurn 📚",
      getOAuthToken:     cb => cb(token),
      volume:            0.6,
    });

    p.addListener("ready", ({ device_id }) => {
      setDeviceId(device_id);
      setConnecting(false);
      playerRef.current = p;
    });

    p.addListener("not_ready", () => setDeviceId(null));

    p.addListener("player_state_changed", (state) => {
      if (!state) return;
      setPlayerState(state);

      // Host broadcasts state to Firestore
      if (isHost && !suppressSync.current) {
        const track = state.track_window?.current_track;
        if (!track) return;

        const payload = {
          trackUri:   track.uri,
          trackName:  track.name,
          artistName: track.artists?.[0]?.name || "",
          albumArt:   track.album?.images?.[0]?.url || "",
          isPlaying:  !state.paused,
          position:   state.position,
          sentAt:     Date.now(),
        };

        // Deduplicate — only write if meaningfully different
        const last = lastSentRef.current;
        const diff = !last
          || last.trackUri  !== payload.trackUri
          || last.isPlaying !== payload.isPlaying
          || Math.abs(last.position - payload.position) > 3000;

        if (diff) {
          lastSentRef.current = payload;
          saveMusicState(roomId, payload).catch(console.error);
        }
      }
    });

    p.addListener("initialization_error", ({ message }) => setError(message));
    p.addListener("authentication_error", ({ message }) => {
      setError(message);
      sessionStorage.removeItem("sp_token");
      setToken(null);
    });
    p.addListener("account_error", ({ message }) => setError("Spotify Premium required: " + message));

    setConnecting(true);
    p.connect();
    setPlayer(p);

    return () => { p.disconnect(); };
  }, [sdkReady, token, isHost, roomId]);

  // ── Fetch user playlists ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch("https://api.spotify.com/v1/me/playlists?limit=30", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.items) setPlaylists(data.items);
      })
      .catch(console.error);
  }, [token]);

  // ── Subscribe to Firestore music state (partner follows host) ────────────────
  useEffect(() => {
    if (!roomId) return;
    return subscribeMusicState(roomId, (state) => {
      syncRef.current = state;
      setMusicSync(state);
    });
  }, [roomId]);

  // ── Partner: apply sync when Firestore state changes ────────────────────────
  useEffect(() => {
    if (isHost || !musicSync || !deviceId || !token) return;

    const applySync = async () => {
      suppressSync.current = true;
      try {
        const drift    = Date.now() - (musicSync.sentAt || Date.now());
        const position = Math.max(0, musicSync.position + drift);

        // Transfer playback to our device first if needed
        await fetch(`https://api.spotify.com/v1/me/player`, {
          method:  "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body:    JSON.stringify({ device_ids: [deviceId], play: false }),
        });

        // Play the synced track at the synced position
        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
          method:  "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body:    JSON.stringify({
            uris:          [musicSync.trackUri],
            position_ms:   position,
          }),
        });

        // Match play/pause state
        if (!musicSync.isPlaying) {
          await fetch("https://api.spotify.com/v1/me/player/pause", {
            method:  "PUT",
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch (e) {
        console.error("Sync error:", e);
      } finally {
        setTimeout(() => { suppressSync.current = false; }, 2000);
      }
    };

    applySync();
  }, [musicSync?.trackUri, musicSync?.isPlaying, isHost, deviceId, token]);

  // ── Auth: start PKCE OAuth flow ──────────────────────────────────────────────
  const login = useCallback(async () => {
    const verifier   = randomString(64);
    const challenge  = await generateCodeChallenge(verifier);
    sessionStorage.setItem("sp_verifier", verifier);

    const params = new URLSearchParams({
      client_id:             clientId,
      response_type:         "code",
      redirect_uri:          redirectUri,
      scope:                 SCOPES,
      code_challenge_method: "S256",
      code_challenge:        challenge,
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params}`;
  }, [clientId, redirectUri]);

  const logout = useCallback(() => {
    sessionStorage.removeItem("sp_token");
    sessionStorage.removeItem("sp_refresh");
    setToken(null);
    setPlayer(null);
    setDeviceId(null);
    setPlayerState(null);
    player?.disconnect();
  }, [player]);

  // ── Playback controls (host only) ────────────────────────────────────────────
  const playPlaylist = useCallback(async (playlistUri) => {
    if (!token || !deviceId) return;
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method:  "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ context_uri: playlistUri }),
    });
  }, [token, deviceId]);

  const togglePlay = useCallback(() => player?.togglePlay(), [player]);
  const nextTrack  = useCallback(() => player?.nextTrack(),  [player]);
  const prevTrack  = useCallback(() => player?.previousTrack(), [player]);
  const setVolume  = useCallback((v) => player?.setVolume(v), [player]);

  return {
    token, login, logout,
    player, deviceId, connecting,
    playerState, musicSync,
    playlists, sdkReady, error,
    playPlaylist, togglePlay, nextTrack, prevTrack, setVolume,
  };
}