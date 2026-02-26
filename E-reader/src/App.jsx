// src/App.jsx
import { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./UseAuth";
import AuthScreen  from "./screens/AuthScreen";
import HomePage    from "./screens/Homepage";
import ReaderPage  from "./screens/ReadPage";
import ProfilePage from "./screens/ProfilePage";

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const SESSION_KEY = "pageturn_session";
const PAGE_KEY    = "pageturn_page";

export default function App() {
  const { user, profile, loading } = useAuth();

  const [page, setPage] = useState(() => {
    try { return sessionStorage.getItem(PAGE_KEY) || "home"; } catch { return "home"; }
  });
  const [session, setSessionState] = useState(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const [pendingRoomCode, setPendingRoomCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("room") || null;
  });

  // ✅ Moved above early returns — hooks must always be called unconditionally
  useEffect(() => {
    if (page === "reader" && session && user) {
      setSession(s => ({
        ...s,
        userId: user.uid,
        name:   profile?.displayName || user.displayName || s.name || "Reader",
        color:  profile?.color       || s.color          || "#c2783a",
      }));
    }
  }, [user?.uid, profile?.displayName]);

  const setSession = (updater) => {
    setSessionState(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const savePage = (p) => {
    setPage(p);
    try { sessionStorage.setItem(PAGE_KEY, p); } catch {}
  };

  const navigate = (to, data = {}) => {
    if (data.session) setSession(s => ({ ...s, ...data.session }));
    savePage(to);
  };

  if (loading) {
    return (
      <div style={{ minHeight:"100vh", background:"var(--paper)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"1rem" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,700;1,400&family=Crimson+Pro:ital,wght@0,400;1,400&display=swap');
          :root { --paper:#f7f2ea; --ink:#1a1208; --amber:#c2783a; --paper-deep:#e0d4be; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
        <h1 style={{ fontFamily:"'Lora', serif", fontSize:"2rem", fontWeight:700, color:"var(--ink)" }}>
          Page<em style={{ fontStyle:"italic", color:"var(--amber)" }}>Turn</em>
        </h1>
        <div style={{ width:28, height:28, border:"3px solid var(--paper-deep)", borderTopColor:"var(--amber)", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (!user) return <AuthScreen pendingRoomCode={pendingRoomCode} />;

  const authedNavigate = (to, data = {}) => {
    if (data.session) {
      data.session.userId = user.uid;
      data.session.name   = profile?.displayName || user.displayName || "Reader";
      data.session.color  = profile?.color       || "#c2783a";
    }
    if (to === "reader") {
      window.history.replaceState({}, "", window.location.pathname);
      setPendingRoomCode(null);
    }
    if (to === "home") {
      try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(PAGE_KEY); } catch {}
      setSessionState(null);
      savePage("home");
      return;
    }
    navigate(to, data);
  };

  return (
    <AppContext.Provider value={{ page, session, setSession, navigate: authedNavigate, user, profile }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --ink:#1a1208; --ink-soft:#3d3020; --ink-faint:#7a6a55;
          --paper:#f7f2ea; --paper-mid:#ede4d4; --paper-deep:#e0d4be;
          --amber:#c2783a; --amber-glow:#e8a060; --sage:#6b8f71;
          --radius-sm:6px; --radius-md:14px; --radius-lg:24px;
          --shadow-sm:0 2px 8px rgba(26,18,8,0.08);
          --shadow-md:0 8px 32px rgba(26,18,8,0.12);
          --shadow-lg:0 24px 64px rgba(26,18,8,0.18);
          --transition:0.22s cubic-bezier(0.4,0,0.2,1);
        }
        body { background: var(--paper); color: var(--ink); }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        @keyframes popIn { from { opacity:0; transform:scale(0.88); } to { opacity:1; transform:scale(1); } }
        @keyframes floatY { 0%,100%{ transform:translateY(0px) rotate(-1deg); } 50%{ transform:translateY(-12px) rotate(1deg); } }
        @keyframes pulse { 0%,100%{ opacity:1; } 50%{ opacity:0.4; } }
        .fade-up   { animation: fadeUp 0.6s cubic-bezier(0.4,0,0.2,1) both; }
        .fade-up-1 { animation: fadeUp 0.6s 0.1s  cubic-bezier(0.4,0,0.2,1) both; }
        .fade-up-2 { animation: fadeUp 0.6s 0.22s cubic-bezier(0.4,0,0.2,1) both; }
        .fade-up-3 { animation: fadeUp 0.6s 0.34s cubic-bezier(0.4,0,0.2,1) both; }
        .fade-up-4 { animation: fadeUp 0.6s 0.46s cubic-bezier(0.4,0,0.2,1) both; }
        .pop-in    { animation: popIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both; }
        button, input, textarea { font-family: inherit; }
        button { cursor: pointer; border: none; background: none; }
        input, textarea { border: none; outline: none; background: none; }
        input::placeholder, textarea::placeholder { color: var(--ink-faint); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--paper-deep); border-radius: 4px; }
      `}</style>
      <div style={{ fontFamily: "'Lora', Georgia, serif", minHeight: "100vh" }}>
        {page === "home"    && <HomePage pendingRoomCode={pendingRoomCode} />}
        {page === "reader"  && <ReaderPage />}
        {page === "profile" && <ProfilePage />}
      </div>
    </AppContext.Provider>
  );
}