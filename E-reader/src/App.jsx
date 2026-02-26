import { useState, createContext, useContext } from "react";
import HomePage from "./screens/Homepage";
import ReaderPage from "./screens/ReadPage";

// ─── Global App Context ───────────────────────────────────────────────────────
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

// Pages: "home" | "upload" | "room" | "reader"
export default function App() {
  const [page, setPage]       = useState("home");
  const [session, setSession] = useState(null);
  // session: { userId, name, color, roomId, roomCode, book: { title, content } | null }

  const navigate = (to, data = {}) => {
    if (data.session) setSession(s => ({ ...s, ...data.session }));
    setPage(to);
  };

  return (
    <AppContext.Provider value={{ page, session, setSession, navigate }}>
      <div style={{ fontFamily: "'Lora', Georgia, serif", minHeight: "100vh" }}>
        {page === "home"   && <HomePage />}
        {page === "reader" && <ReaderPage />}
      </div>
    </AppContext.Provider>
  );
}