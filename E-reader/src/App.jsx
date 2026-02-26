// src/App.jsx
import { createContext, useContext, useState } from "react";
import { useAuth } from "./firebase/useAuth";
import AuthScreen  from "./screens/AuthScreen";
import HomePage    from "./screens/HomePage";
import ReaderPage  from "./screens/ReaderPage";

// ─── App Context ──────────────────────────────────────────────────────────────
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export default function App() {
  const { user, profile, loading } = useAuth();

  // "home" | "reader"
  const [page, setPage]       = useState("home");
  const [session, setSession] = useState(null);
  // session shape:
  // {
  //   userId, name, color, roomId,
  //   partnerUserId, partner: { name, color },
  //   book: { title, content }
  // }

  const navigate = (to, data = {}) => {
    if (data.session) setSession(s => ({ ...s, ...data.session }));
    setPage(to);
  };

  // ── Loading splash ──
  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", background: "var(--paper)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "1rem",
      }}>
        <h1 style={{ fontFamily: "'Lora', serif", fontSize: "2rem", fontWeight: 700, color: "var(--ink)" }}>
          Page<em style={{ fontStyle: "italic", color: "var(--amber)" }}>Turn</em>
        </h1>
        <div style={{
          width: 28, height: 28,
          border: "3px solid var(--paper-deep)", borderTopColor: "var(--amber)",
          borderRadius: "50%", animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Not signed in → show auth ──
  if (!user) return <AuthScreen />;

  // ── Signed in → inject real user data into navigate ──
  const authedNavigate = (to, data = {}) => {
    if (data.session) {
      // Always stamp real user identity from Firebase auth
      data.session.userId = user.uid;
      data.session.name   = profile?.displayName || user.displayName || "Reader";
      data.session.color  = profile?.color       || "#c2783a";
    }
    navigate(to, data);
  };

  return (
    <AppContext.Provider value={{ page, session, setSession, navigate: authedNavigate, user, profile }}>
      <div style={{ fontFamily: "'Lora', Georgia, serif", minHeight: "100vh" }}>
        {page === "home"   && <HomePage />}
        {page === "reader" && <ReaderPage />}
      </div>
    </AppContext.Provider>
  );
}