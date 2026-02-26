import { useState, useEffect, useRef, useCallback } from "react";
import { useApp } from "../App";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const chunkText = (text, size = 1400) => {
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
};

const timeAgo = (ts) => {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 5)    return "just now";
  if (d < 60)   return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  return `${Math.floor(d / 3600)}h ago`;
};

const uid = () => Math.random().toString(36).slice(2, 10);

const PARTNER_LINES = [
  "Oh wow, that part hit differently 😮",
  "Wait — did that just happen??",
  "I had to re-read that paragraph",
  "This is getting so tense 😅",
  "The writing here is beautiful",
  "Taking a note on this 📝",
  "Ok I was NOT expecting that twist",
  "This chapter is everything",
  "Going back to re-read the last bit",
  "Are you on the same page as me?",
];

// ─── Styles injected once ─────────────────────────────────────────────────────
const READER_CSS = `
  @keyframes slideUp    { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  @keyframes slideRight { from { opacity:0; transform:translateX(100%); } to { opacity:1; transform:translateX(0); } }
  @keyframes pageFade   { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:translateX(0); } }
  @keyframes floatBob   { 0%,100%{ transform:translateY(0); } 50%{ transform:translateY(-5px); } }
  @keyframes popIn      { from { opacity:0; transform:scale(0.85) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }
  @keyframes pulse      { 0%,100%{ opacity:1; } 50%{ opacity:0.35; } }
  @keyframes ripple     { 0%{ transform:scale(1); opacity:0.6; } 100%{ transform:scale(2.4); opacity:0; } }
  @keyframes bounce     { 0%,100%{ transform:translateY(0); } 40%{ transform:translateY(-4px); } }
  @keyframes spin       { to { transform:rotate(360deg); } }

  .page-content  { animation: pageFade 0.32s cubic-bezier(0.4,0,0.2,1) both; }
  .chat-sidebar  { animation: slideRight 0.3s cubic-bezier(0.4,0,0.2,1) both; }
  .msg-bubble    { animation: slideUp 0.22s ease both; }
  .toast-pop     { animation: popIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both; }
  .page-btn      { transition: all 0.18s ease; }
  .page-btn:hover:not(:disabled) { opacity:0.8; transform:scale(1.06); }

  .reader-scroll::-webkit-scrollbar { display: none; }
  .reader-scroll { -ms-overflow-style: none; scrollbar-width: none; }

  .chat-scroll::-webkit-scrollbar { width: 3px; }
  .chat-scroll::-webkit-scrollbar-thumb { background: var(--paper-deep); border-radius: 3px; }
`;

function injectReaderStyles() {
  if (document.getElementById("reader-styles")) return;
  const s = document.createElement("style");
  s.id = "reader-styles";
  s.textContent = READER_CSS;
  document.head.appendChild(s);
}

// ─── Message Toast ────────────────────────────────────────────────────────────
function MessageToast({ msg, onDismiss, onOpen }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="toast-pop" style={{
      position: "absolute",
      bottom: "calc(100% + 14px)",
      left: 0,
      background: "#fff",
      borderRadius: 14,
      border: "1px solid var(--paper-deep)",
      boxShadow: "0 8px 32px rgba(26,18,8,0.14), 0 2px 8px rgba(26,18,8,0.08)",
      padding: "0.65rem 0.9rem",
      maxWidth: 265,
      display: "flex", gap: "0.6rem", alignItems: "flex-start",
      cursor: "pointer",
      zIndex: 60,
    }} onClick={() => { onDismiss(); onOpen(); }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%", background: msg.color,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: "0.7rem", color: "#fff", flexShrink: 0,
      }}>{msg.name?.[0]?.toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "0.7rem", fontWeight: 700, color: msg.color, marginBottom: "0.15rem" }}>{msg.name}</p>
        <p style={{ fontSize: "0.82rem", color: "var(--ink)", lineHeight: 1.4, wordBreak: "break-word" }}>{msg.text}</p>
      </div>
      <span style={{ color: "var(--ink-faint)", fontSize: "0.65rem", flexShrink: 0, marginTop: 2, opacity: 0.6 }}>tap to reply</span>
    </div>
  );
}

// ─── Floating User Bar ────────────────────────────────────────────────────────
function FloatingBar({ me, partner, partnerPage, currentPage, unreadCount, onOpenChat, chatOpen, toast, onDismissToast }) {
  const isSamePage = partnerPage === currentPage;

  return (
    <div style={{
      position: "fixed",
      bottom: 28,
      left: chatOpen ? "calc(50% - 160px)" : "50%",
      transform: chatOpen ? "translateX(-50%)" : "translateX(-50%)",
      zIndex: 50,
      transition: "left 0.3s ease",
    }}>
      {/* Relative wrapper so toast positions above pill */}
      <div style={{ position: "relative", display: "inline-flex" }}>

        {/* Toast */}
        {toast && (
          <MessageToast
            msg={toast}
            onDismiss={onDismissToast}
            onOpen={onOpenChat}
          />
        )}

        {/* "Reading together" label */}
        {isSamePage && (
          <div className="toast-pop" style={{
            position: "absolute", bottom: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)",
            background: "var(--ink)", color: "var(--amber-glow)",
            borderRadius: 100, padding: "3px 12px",
            fontSize: "0.68rem", fontWeight: 600, whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(26,18,8,0.22)",
          }}>
            📖 Reading together
          </div>
        )}

        {/* Pill */}
        <div style={{
          background: "rgba(247,242,234,0.94)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid var(--paper-deep)",
          borderRadius: 100,
          boxShadow: "0 8px 40px rgba(26,18,8,0.18), 0 2px 8px rgba(26,18,8,0.08)",
          padding: "0.5rem 1.1rem",
          display: "flex", alignItems: "center", gap: "0.9rem",
        }}>

          {/* My avatar */}
          <div style={{ position: "relative", animation: "floatBob 3.2s ease-in-out infinite" }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: me.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: "1rem", color: "#fff",
              boxShadow: `0 0 0 3px rgba(247,242,234,1), 0 0 0 5px ${me.color}44`,
            }}>{me.name?.[0]?.toUpperCase()}</div>
            <div style={{
              position: "absolute", bottom: 1, right: 1,
              width: 10, height: 10, borderRadius: "50%",
              background: "var(--sage)", border: "2px solid rgba(247,242,234,1)",
              boxShadow: "0 0 6px var(--sage)",
            }} />
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 22, background: "var(--paper-deep)" }} />

          {/* Partner avatar */}
          <div style={{ position: "relative", animation: "floatBob 3.6s 0.4s ease-in-out infinite" }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: partner.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: "1rem", color: "#fff",
              boxShadow: `0 0 0 3px rgba(247,242,234,1), 0 0 0 5px ${partner.color}44`,
            }}>{partner.name?.[0]?.toUpperCase()}</div>
            {/* Page badge */}
            <div style={{
              position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)",
              background: "var(--ink)", borderRadius: 8, padding: "1px 6px",
              fontSize: "0.52rem", color: "var(--amber-glow)", fontWeight: 700,
              whiteSpace: "nowrap", lineHeight: 1.6, zIndex: 2,
            }}>p.{partnerPage + 1}</div>
            {/* Online */}
            <div style={{
              position: "absolute", bottom: 1, right: 1,
              width: 10, height: 10, borderRadius: "50%",
              background: "var(--sage)", border: "2px solid rgba(247,242,234,1)",
            }}>
              <div style={{
                position: "absolute", inset: -1, borderRadius: "50%",
                background: "var(--sage)", opacity: 0.4,
                animation: "ripple 2.2s ease-out infinite",
              }} />
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 22, background: "var(--paper-deep)" }} />

          {/* Chat button */}
          <button onClick={onOpenChat} style={{
            width: 40, height: 40, borderRadius: "50%",
            background: chatOpen
              ? "linear-gradient(135deg, var(--amber), var(--amber-glow))"
              : "var(--ink)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: chatOpen
              ? "0 4px 18px rgba(194,120,58,0.45)"
              : "0 4px 16px rgba(26,18,8,0.28)",
            transition: "all 0.22s ease",
            border: "none", cursor: "pointer", position: "relative", flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {unreadCount > 0 && !chatOpen && (
              <div style={{
                position: "absolute", top: -3, right: -3,
                background: "#e05c4a", color: "#fff",
                width: 18, height: 18, borderRadius: "50%",
                fontSize: "0.6rem", fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px solid rgba(247,242,234,1)",
                animation: "bounce 1s ease-in-out infinite",
              }}>{unreadCount > 9 ? "9+" : unreadCount}</div>
            )}
          </button>

        </div>
      </div>
    </div>
  );
}

// ─── Chat Sidebar ─────────────────────────────────────────────────────────────
function ChatSidebar({ messages, partner, me, currentPage, onSend, onClose }) {
  const [text, setText] = useState("");
  const endRef  = useRef();
  const inputRef = useRef();

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);

  const send = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
    inputRef.current?.focus();
  };

  return (
    <div className="chat-sidebar" style={{
      width: 310, flexShrink: 0,
      background: "#fff",
      borderLeft: "1px solid var(--paper-deep)",
      display: "flex", flexDirection: "column",
      height: "100%", overflow: "hidden",
    }}>

      {/* Header */}
      <div style={{
        padding: "0.9rem 1.1rem",
        borderBottom: "1px solid var(--paper-deep)",
        display: "flex", alignItems: "center", gap: "0.6rem",
        flexShrink: 0, background: "rgba(247,242,234,0.6)",
      }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%", background: partner.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: "0.8rem", color: "#fff",
            boxShadow: `0 0 0 2px #fff, 0 0 0 3.5px ${partner.color}44`,
          }}>{partner.name?.[0]?.toUpperCase()}</div>
          <div>
            <p style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--ink)", lineHeight: 1.2 }}>{partner.name}</p>
            <p style={{ fontSize: "0.64rem", color: "var(--sage)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--sage)", display: "inline-block", animation: "pulse 2s ease-in-out infinite" }} />
              Online · Page {partner.page + 1}
            </p>
          </div>
        </div>
        <button onClick={onClose} style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "var(--paper)", border: "1.5px solid var(--paper-deep)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--ink-faint)", fontSize: "0.85rem", cursor: "pointer",
          transition: "all 0.15s", flexShrink: 0,
        }}
          onMouseOver={e => { e.currentTarget.style.background = "var(--ink)"; e.currentTarget.style.color = "#fff"; }}
          onMouseOut={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.color = "var(--ink-faint)"; }}
        >✕</button>
      </div>

      {/* Messages */}
      <div className="chat-scroll" style={{
        flex: 1, overflowY: "auto", padding: "1rem",
        display: "flex", flexDirection: "column", gap: "0.85rem",
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.75rem", animation: "floatBob 3s ease-in-out infinite" }}>✍️</div>
            <p style={{ color: "var(--ink-faint)", fontSize: "0.82rem", fontStyle: "italic", fontFamily: "'Crimson Pro', serif", lineHeight: 1.6 }}>
              Start the conversation…
            </p>
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.userId === "me";
          return (
            <div key={msg.id} className="msg-bubble" style={{
              display: "flex", gap: "0.4rem",
              flexDirection: isMe ? "row-reverse" : "row",
              alignItems: "flex-end",
            }}>
              {!isMe && (
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", background: msg.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: "0.6rem", color: "#fff", flexShrink: 0,
                }}>{msg.name?.[0]?.toUpperCase()}</div>
              )}
              <div style={{
                maxWidth: "76%", display: "flex", flexDirection: "column",
                gap: 3, alignItems: isMe ? "flex-end" : "flex-start",
              }}>
                <div style={{
                  padding: "0.5rem 0.85rem",
                  background: isMe
                    ? "linear-gradient(135deg, var(--amber) 0%, var(--amber-glow) 100%)"
                    : "var(--paper)",
                  borderRadius: isMe ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
                  color: isMe ? "#fff" : "var(--ink)",
                  fontSize: "0.875rem", lineHeight: 1.5,
                  border: isMe ? "none" : "1px solid var(--paper-deep)",
                  boxShadow: isMe ? "0 3px 14px rgba(194,120,58,0.28)" : "0 1px 4px rgba(26,18,8,0.06)",
                  wordBreak: "break-word",
                }}>{msg.text}</div>
                <div style={{ display: "flex", gap: "0.3rem", paddingInline: "0.2rem" }}>
                  <span style={{ color: "var(--ink-faint)", fontSize: "0.6rem" }}>{timeAgo(msg.ts)}</span>
                  <span style={{ color: "var(--paper-deep)", fontSize: "0.6rem", background: "var(--paper-mid)", borderRadius: 3, padding: "0 4px" }}>p.{msg.page + 1}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "0.875rem", borderTop: "1px solid var(--paper-deep)", flexShrink: 0 }}>
        <div style={{
          display: "flex", gap: "0.4rem", alignItems: "flex-end",
          background: "var(--paper)", border: "1.5px solid var(--paper-deep)",
          borderRadius: 14, padding: "0.45rem 0.45rem 0.45rem 0.85rem",
          transition: "border-color 0.2s",
        }}
          onFocusCapture={e => e.currentTarget.style.borderColor = "var(--amber)"}
          onBlurCapture={e => e.currentTarget.style.borderColor = "var(--paper-deep)"}
        >
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={`Message ${partner.name}…`}
            rows={1}
            style={{
              flex: 1, background: "transparent", resize: "none",
              color: "var(--ink)", fontSize: "0.875rem", lineHeight: 1.5,
              fontFamily: "'Lora', serif", maxHeight: 100, overflowY: "auto",
            }}
          />
          <button onClick={send} disabled={!text.trim()} style={{
            width: 32, height: 32, borderRadius: 10, border: "none", flexShrink: 0,
            background: text.trim()
              ? "linear-gradient(135deg, var(--amber), var(--amber-glow))"
              : "var(--paper-deep)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: text.trim() ? "0 3px 12px rgba(194,120,58,0.35)" : "none",
            transition: "all 0.18s", cursor: text.trim() ? "pointer" : "not-allowed",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke={text.trim() ? "#fff" : "var(--ink-faint)"}
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: "rotate(90deg)" }}>
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
          </button>
        </div>
        <p style={{ color: "var(--ink-faint)", fontSize: "0.62rem", textAlign: "center", marginTop: "0.3rem" }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

// ─── ReaderPage ───────────────────────────────────────────────────────────────
export default function ReaderPage() {
  useEffect(() => { injectReaderStyles(); }, []);

  const { session, navigate } = useApp();
  const { name, color, roomId, partner, book } = session || {};
  const pages = book ? chunkText(book.content) : [];

  const [currentPage, setCurrentPage]         = useState(0);
  const [partnerPage, setPartnerPage]         = useState(0);
  const [messages, setMessages]               = useState(() => [{
    id: "welcome",
    userId: "partner",
    name: partner?.name || "Partner",
    color: partner?.color || "#6b8f71",
    text: `Hey ${name || "there"}! Ready to read together? 📖`,
    page: 0, ts: Date.now() - 6000,
  }]);
  const [chatOpen, setChatOpen]               = useState(false);
  const [unreadCount, setUnreadCount]         = useState(0);
  const [toast, setToast]                     = useState(null);
  const [syncFlash, setSyncFlash]             = useState(false);

  const lastPartnerMsgTime = useRef(Date.now() - 15000);

  const me             = { name, color };
  const partnerObj     = { ...(partner || {}), page: partnerPage };

  // ── Simulate partner page changes (~every 14s)
  useEffect(() => {
    if (!pages.length) return;
    const t = setInterval(() => {
      if (Math.random() > 0.45) {
        setPartnerPage(p => Math.min(pages.length - 1, p + 1));
      }
    }, 14000);
    return () => clearInterval(t);
  }, [pages.length]);

  // ── Simulate partner chat messages (~every 22s)
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      if (now - lastPartnerMsgTime.current > 18000 && Math.random() > 0.4) {
        const msg = {
          id: uid(),
          userId: "partner",
          name: partner?.name || "Partner",
          color: partner?.color || "#6b8f71",
          text: PARTNER_LINES[Math.floor(Math.random() * PARTNER_LINES.length)],
          page: partnerPage, ts: now,
        };
        setMessages(prev => [...prev, msg]);
        lastPartnerMsgTime.current = now;
        if (!chatOpen) {
          setUnreadCount(c => c + 1);
          setToast(msg);
        }
      }
    }, 22000);
    return () => clearInterval(t);
  }, [partner, partnerPage, chatOpen]);

  // ── Clear unread when chat opens
  useEffect(() => {
    if (chatOpen) { setUnreadCount(0); setToast(null); }
  }, [chatOpen]);

  const goToPage = useCallback((p) => {
    const next = Math.max(0, Math.min(pages.length - 1, p));
    setCurrentPage(next);
    // → ws.send({ type: "page", page: next })
  }, [pages.length]);

  const syncToPartner = () => {
    goToPage(partnerPage);
    setSyncFlash(true);
    setTimeout(() => setSyncFlash(false), 2000);
  };

  const sendMessage = useCallback((text) => {
    setMessages(prev => [...prev, {
      id: uid(), userId: "me", name, color,
      text, page: currentPage, ts: Date.now(),
    }]);
    // → ws.send({ type: "chat", text, page: currentPage })
  }, [name, color, currentPage]);

  const progress   = pages.length > 1 ? (currentPage / (pages.length - 1)) * 100 : 100;
  const isSamePage = partnerPage === currentPage;
  const pagesDiff  = Math.abs(partnerPage - currentPage);

  if (!session || !book) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--paper)", gap: "1rem" }}>
        <p style={{ color: "var(--ink-faint)", fontStyle: "italic", fontFamily: "'Crimson Pro', serif", fontSize: "1.1rem" }}>No book loaded.</p>
        <button onClick={() => navigate("home")} style={{ color: "var(--amber)", fontWeight: 600, fontSize: "0.9rem", padding: "0.5rem 1.25rem", border: "1.5px solid var(--amber)", borderRadius: 100 }}>← Go Home</button>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--paper)", overflow: "hidden", position: "relative" }}>

      {/* ── Top bar ── */}
      <header style={{
        height: 52, flexShrink: 0, zIndex: 20,
        background: "rgba(247,242,234,0.96)",
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--paper-deep)",
        display: "flex", alignItems: "center", gap: "0.9rem",
        padding: "0 1.25rem",
        boxShadow: "0 1px 0 var(--paper-deep), 0 2px 12px rgba(26,18,8,0.04)",
      }}>
        <button onClick={() => navigate("home")} style={{ color: "var(--ink-faint)", fontSize: "0.78rem", fontWeight: 500, transition: "color 0.15s", display: "flex", alignItems: "center", gap: "0.25rem" }}
          onMouseOver={e => e.currentTarget.style.color = "var(--amber)"}
          onMouseOut={e => e.currentTarget.style.color = "var(--ink-faint)"}
        >← Leave</button>

        <span style={{ color: "var(--paper-deep)", fontSize: "1rem" }}>·</span>

        <span style={{ fontFamily: "'Lora', serif", fontSize: "1rem", fontWeight: 700, color: "var(--ink)" }}>
          Page<em style={{ fontStyle: "italic", color: "var(--amber)" }}>Turn</em>
        </span>

        <span style={{ color: "var(--paper-deep)", fontSize: "1rem" }}>·</span>

        <span style={{ fontFamily: "'Crimson Pro', serif", fontStyle: "italic", color: "var(--ink-soft)", fontSize: "0.92rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
          {book.title}
        </span>

        <div style={{ flex: 1 }} />

        {/* Room tag */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "var(--paper-mid)", border: "1px solid var(--paper-deep)", borderRadius: 100, padding: "3px 10px" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--sage)", boxShadow: "0 0 5px var(--sage)", display: "inline-block", animation: "pulse 2s ease-in-out infinite" }} />
          <span style={{ color: "var(--ink-faint)", fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.06em" }}>#{roomId}</span>
        </div>

        {/* Progress */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ width: 68, height: 3, background: "var(--paper-deep)", borderRadius: 3 }}>
            <div style={{ width: `${progress}%`, height: "100%", borderRadius: 3, background: "linear-gradient(90deg, var(--amber), var(--amber-glow))", transition: "width 0.4s ease" }} />
          </div>
          <span style={{ color: "var(--ink-faint)", fontSize: "0.7rem", fontWeight: 600 }}>
            {currentPage + 1}<span style={{ color: "var(--paper-deep)" }}>/</span>{pages.length}
          </span>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── Book reader ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>

          {/* Page text */}
          <div className="reader-scroll" style={{ flex: 1, overflowY: "auto", paddingBottom: 120 }}>
            <div key={currentPage} className="page-content" style={{ maxWidth: 640, margin: "0 auto", padding: "3rem clamp(1.5rem,5vw,4rem)" }}>
              <div style={{
                fontFamily: "'Crimson Pro', serif",
                fontSize: "clamp(1.05rem, 1.8vw, 1.22rem)",
                lineHeight: 2.0, color: "var(--ink)",
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>{pages[currentPage]}</div>
              <div style={{ textAlign: "center", margin: "3.5rem 0 1rem", color: "var(--paper-deep)", fontSize: "0.65rem", letterSpacing: "0.35em" }}>◆ ◇ ◆</div>
            </div>
          </div>

          {/* Partner page nudge */}
          {pagesDiff > 0 && (
            <div className="toast-pop" style={{
              position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
              display: "flex", alignItems: "center", gap: "0.5rem",
              background: "#fff", border: "1px solid var(--paper-deep)",
              borderRadius: 100, padding: "5px 14px",
              fontSize: "0.75rem", color: "var(--ink-soft)",
              boxShadow: "var(--shadow-sm)", whiteSpace: "nowrap", zIndex: 10,
            }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: partner?.color }} />
              {partner?.name} is on page {partnerPage + 1}
              <button onClick={syncToPartner} style={{
                color: "var(--amber)", fontWeight: 700, fontSize: "0.72rem",
                background: "none", border: "none", cursor: "pointer",
                borderBottom: "1px dotted var(--amber)", padding: "0 1px", lineHeight: 1,
              }}>{syncFlash ? "✓ Synced!" : "Jump there →"}</button>
            </div>
          )}

          {/* ── Page nav bar ── */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            padding: "1rem 2rem 1.5rem",
            background: "linear-gradient(to top, rgba(247,242,234,1) 55%, rgba(247,242,234,0))",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "1.25rem",
          }}>
            <button className="page-btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 0}
              style={{
                width: 42, height: 42, borderRadius: "50%", border: `1.5px solid ${currentPage === 0 ? "var(--paper-deep)" : "var(--ink)"}`,
                background: currentPage === 0 ? "transparent" : "var(--ink)",
                color: currentPage === 0 ? "var(--paper-deep)" : "#fff",
                fontSize: "1.25rem", display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: currentPage === 0 ? "none" : "0 4px 14px rgba(26,18,8,0.22)",
                cursor: currentPage === 0 ? "not-allowed" : "pointer",
              }}>‹</button>

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {Array.from({ length: Math.min(pages.length, 11) }, (_, i) => {
                const idx = pages.length <= 11 ? i : Math.round(i * (pages.length - 1) / 10);
                const isActive   = pages.length <= 11 ? idx === currentPage : Math.abs(idx - currentPage) < pages.length / 22;
                const isPartnerDot = pages.length <= 11 ? idx === partnerPage : Math.abs(idx - partnerPage) < pages.length / 22;
                return (
                  <button key={i} onClick={() => goToPage(idx)} style={{
                    width: isActive ? 24 : 7, height: 7, padding: 0,
                    borderRadius: 4, border: "none", cursor: "pointer",
                    background: isActive
                      ? "linear-gradient(90deg, var(--amber), var(--amber-glow))"
                      : isPartnerDot ? (partner?.color || "#6b8f71") + "99" : "var(--paper-deep)",
                    transition: "all 0.28s ease",
                    boxShadow: isPartnerDot && !isActive ? `0 0 8px ${(partner?.color || "#6b8f71")}66` : "none",
                  }} title={isPartnerDot ? `${partner?.name} is here` : undefined} />
                );
              })}
            </div>

            <button className="page-btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === pages.length - 1}
              style={{
                width: 42, height: 42, borderRadius: "50%", border: `1.5px solid ${currentPage === pages.length - 1 ? "var(--paper-deep)" : "var(--ink)"}`,
                background: currentPage === pages.length - 1 ? "transparent" : "var(--ink)",
                color: currentPage === pages.length - 1 ? "var(--paper-deep)" : "#fff",
                fontSize: "1.25rem", display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: currentPage === pages.length - 1 ? "none" : "0 4px 14px rgba(26,18,8,0.22)",
                cursor: currentPage === pages.length - 1 ? "not-allowed" : "pointer",
              }}>›</button>
          </div>
        </div>

        {/* ── Chat sidebar ── */}
        {chatOpen && (
          <ChatSidebar
            messages={messages}
            partner={partnerObj}
            me={me}
            currentPage={currentPage}
            onSend={sendMessage}
            onClose={() => setChatOpen(false)}
          />
        )}
      </div>

      {/* ── Floating user bar ── */}
      <FloatingBar
        me={me}
        partner={partnerObj}
        partnerPage={partnerPage}
        currentPage={currentPage}
        unreadCount={unreadCount}
        onOpenChat={() => setChatOpen(v => !v)}
        chatOpen={chatOpen}
        toast={toast}
        onDismissToast={() => setToast(null)}
      />
    </div>
  );
}