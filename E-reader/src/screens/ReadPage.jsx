// src/screens/ReadPage.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useApp } from "../App";
import { useRoom } from "../Useroom";
import { getRoom, downloadPdfChunked, deleteRoom } from "../Db";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const timeAgo = (ts) => {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 5)    return "just now";
  if (d < 60)   return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  return `${Math.floor(d / 3600)}h ago`;
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const READER_CSS = `
  @keyframes slideRight  { from { opacity:0; transform:translateX(100%); } to { opacity:1; transform:translateX(0); } }
  @keyframes slideLeft   { from { opacity:0; transform:translateX(-100%); } to { opacity:1; transform:translateX(0); } }
  @keyframes floatBob    { 0%,100%{ transform:translateY(0); } 50%{ transform:translateY(-5px); } }
  @keyframes popIn       { from { opacity:0; transform:scale(0.85) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }
  @keyframes pulse       { 0%,100%{ opacity:1; } 50%{ opacity:0.35; } }
  @keyframes ripple      { 0%{ transform:scale(1); opacity:0.6; } 100%{ transform:scale(2.4); opacity:0; } }
  @keyframes bounce      { 0%,100%{ transform:translateY(0); } 40%{ transform:translateY(-4px); } }
  @keyframes slideUp     { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  .chat-sidebar   { animation: slideRight 0.3s cubic-bezier(0.4,0,0.2,1) both; }
  .toc-sidebar    { animation: slideLeft 0.3s cubic-bezier(0.4,0,0.2,1) both; }
  .msg-bubble     { animation: slideUp 0.22s ease both; }
  .toast-pop      { animation: popIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both; }
  .page-btn       { transition: all 0.18s ease; }
  .page-btn:hover:not(:disabled) { opacity:0.8; transform:scale(1.06); }
  .reader-scroll::-webkit-scrollbar { display: none; }
  .reader-scroll  { -ms-overflow-style: none; scrollbar-width: none; }
  .chat-scroll::-webkit-scrollbar { width: 3px; }
  .chat-scroll::-webkit-scrollbar-thumb { background: var(--paper-deep); border-radius: 3px; }
  .toc-scroll::-webkit-scrollbar { width: 3px; }
  .toc-scroll::-webkit-scrollbar-thumb { background: var(--paper-deep); border-radius: 3px; }
  .toc-item { transition: background 0.15s ease, color 0.15s ease; }
  .toc-item:hover { background: var(--paper-mid) !important; }
  .avatar-wrap { position: relative; display: inline-flex; align-items: center; justify-content: center; }
  .avatar-tooltip {
    position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%);
    background: var(--ink); color: #fff; border-radius: 8px; padding: 4px 10px;
    font-size: 0.65rem; font-weight: 600; white-space: nowrap; pointer-events: none;
    opacity: 0; transition: opacity 0.15s ease;
    box-shadow: 0 4px 12px rgba(26,18,8,0.25); z-index: 99;
  }
  .avatar-tooltip::after {
    content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
    border: 4px solid transparent; border-top-color: var(--ink);
  }
  .avatar-wrap:hover .avatar-tooltip { opacity: 1; }
`;

function injectReaderStyles() {
  if (document.getElementById("reader-styles")) return;
  const s = document.createElement("style");
  s.id = "reader-styles"; s.textContent = READER_CSS;
  document.head.appendChild(s);
}

// ─── PDF Canvas Renderer ──────────────────────────────────────────────────────
function PdfPage({ pdfDoc, pageNum }) {
  const canvasRef = useRef(null);
  const renderRef = useRef(null);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    if (renderRef.current) { renderRef.current.cancel(); renderRef.current = null; }

    pdfDoc.getPage(pageNum).then(page => {
      if (cancelled || !canvasRef.current) return;
      const container = canvasRef.current.parentElement;
      const maxWidth  = container ? container.clientWidth - 48 : 680;
      const baseVp    = page.getViewport({ scale: 1 });
      const scale     = Math.min(maxWidth / baseVp.width, 2.0);
      const vp        = page.getViewport({ scale });
      const canvas    = canvasRef.current;
      canvas.width    = vp.width;
      canvas.height   = vp.height;
      const ctx  = canvas.getContext("2d");
      const task = page.render({ canvasContext: ctx, viewport: vp });
      renderRef.current = task;
      task.promise.catch(e => { if (e?.name !== "RenderingCancelledException") console.error(e); });
    });

    return () => {
      cancelled = true;
      if (renderRef.current) { renderRef.current.cancel(); renderRef.current = null; }
    };
  }, [pdfDoc, pageNum]);

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "1.5rem 1rem 7rem" }}>
      <canvas ref={canvasRef} style={{ maxWidth: "100%", boxShadow: "0 4px 32px rgba(26,18,8,0.13)", borderRadius: 4 }} />
    </div>
  );
}

// ─── Table of Contents Sidebar ────────────────────────────────────────────────
function TocSidebar({ chapters, currentPage, totalPages, onNavigate, onClose }) {
  const activeRef = useRef(null);

  useEffect(() => {
    setTimeout(() => activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  }, [currentPage]);

  const activeIdx = chapters.reduce((acc, ch, i) => currentPage >= ch.page ? i : acc, 0);

  return (
    <div className="toc-sidebar" style={{ width: 272, flexShrink: 0, background: "#fff", borderRight: "1px solid var(--paper-deep)", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "0.9rem 1.1rem", borderBottom: "1px solid var(--paper-deep)", display: "flex", alignItems: "center", gap: "0.6rem", background: "rgba(247,242,234,0.6)", flexShrink: 0 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
        <span style={{ flex: 1, fontFamily: "'Lora', serif", fontWeight: 700, fontSize: "0.9rem", color: "var(--ink)" }}>Contents</span>
        <span style={{ fontSize: "0.65rem", color: "var(--ink-faint)", background: "var(--paper-mid)", borderRadius: 6, padding: "2px 7px", fontWeight: 600 }}>{chapters.length} chapters</span>
        <button onClick={onClose}
          style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--paper)", border: "1.5px solid var(--paper-deep)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-faint)", fontSize: "0.8rem", cursor: "pointer", flexShrink: 0 }}
          onMouseOver={e => { e.currentTarget.style.background = "var(--ink)"; e.currentTarget.style.color = "#fff"; }}
          onMouseOut={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.color = "var(--ink-faint)"; }}>✕</button>
      </div>

      {/* Progress bar */}
      <div style={{ padding: "0.6rem 1.1rem 0.5rem", borderBottom: "1px solid var(--paper-deep)", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
          <span style={{ fontSize: "0.62rem", color: "var(--ink-faint)", fontWeight: 600 }}>PROGRESS</span>
          <span style={{ fontSize: "0.62rem", color: "var(--amber)", fontWeight: 700 }}>
            {totalPages > 1 ? Math.round(((currentPage - 1) / (totalPages - 1)) * 100) : 100}%
          </span>
        </div>
        <div style={{ height: 3, background: "var(--paper-deep)", borderRadius: 3 }}>
          <div style={{ height: "100%", borderRadius: 3, background: "linear-gradient(90deg, var(--amber), var(--amber-glow))", width: `${totalPages > 1 ? ((currentPage - 1) / (totalPages - 1)) * 100 : 100}%`, transition: "width 0.4s ease" }} />
        </div>
      </div>

      {/* Chapter list */}
      <div className="toc-scroll" style={{ flex: 1, overflowY: "auto", padding: "0.5rem 0" }}>
        {chapters.length === 0 ? (
          <div style={{ padding: "2.5rem 1.5rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.8rem", marginBottom: "0.6rem" }}>📄</div>
            <p style={{ color: "var(--ink-faint)", fontSize: "0.8rem", fontStyle: "italic", lineHeight: 1.6 }}>No chapters found in this PDF's outline.</p>
          </div>
        ) : (
          chapters.map((ch, i) => {
            const isActive = i === activeIdx;
            const isNested = ch.level > 1;
            return (
              <button
                key={i}
                ref={isActive ? activeRef : null}
                className="toc-item"
                onClick={() => onNavigate(ch.page)}
                style={{
                  width: "100%", textAlign: "left", border: "none", cursor: "pointer",
                  paddingTop: "0.52rem", paddingBottom: "0.52rem",
                  paddingRight: "1rem",
                  paddingLeft: `${0.9 + (ch.level - 1) * 1.0}rem`,
                  background: isActive ? "linear-gradient(90deg, rgba(194,120,58,0.12), transparent)" : "transparent",
                  display: "flex", alignItems: "flex-start", gap: "0.55rem",
                  borderLeft: isActive ? "3px solid var(--amber)" : "3px solid transparent",
                }}
              >
                {!isNested ? (
                  <span style={{
                    flexShrink: 0, marginTop: "0.12rem",
                    width: 18, height: 18, borderRadius: 5,
                    background: isActive ? "var(--amber)" : "var(--paper-mid)",
                    border: isActive ? "none" : "1px solid var(--paper-deep)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.55rem", fontWeight: 800,
                    color: isActive ? "#fff" : "var(--ink-faint)",
                  }}>{i + 1}</span>
                ) : (
                  <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: "50%", background: isActive ? "var(--amber)" : "var(--paper-deep)", marginTop: "0.38rem" }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: isNested ? "0.76rem" : "0.82rem",
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? "var(--amber)" : "var(--ink-soft)",
                    lineHeight: 1.4,
                    overflow: "hidden", textOverflow: "ellipsis",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    fontFamily: isNested ? "inherit" : "'Lora', serif",
                  }}>{ch.title}</p>
                  <p style={{ fontSize: "0.62rem", color: isActive ? "var(--amber)" : "var(--ink-faint)", marginTop: "0.1rem", fontWeight: isActive ? 600 : 400 }}>
                    p. {ch.page}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── End Room Confirm Dialog ──────────────────────────────────────────────────
function EndRoomDialog({ onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,18,8,0.55)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div className="toast-pop" style={{ background: "#fff", borderRadius: 20, padding: "2rem", maxWidth: 360, width: "100%", boxShadow: "0 24px 64px rgba(26,18,8,0.25)", textAlign: "center" }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>📕</div>
        <h3 style={{ fontFamily: "'Lora', serif", fontSize: "1.2rem", fontWeight: 700, color: "var(--ink)", marginBottom: "0.5rem" }}>End this room?</h3>
        <p style={{ color: "var(--ink-faint)", fontSize: "0.88rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
          This will permanently delete the room and the book for both readers. This cannot be undone.
        </p>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "0.75rem", border: "1.5px solid var(--paper-deep)", borderRadius: 12, color: "var(--ink-soft)", fontSize: "0.9rem", fontWeight: 600, background: "none", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{ flex: 1, padding: "0.75rem", background: "linear-gradient(135deg, #c0392b, #e74c3c)", border: "none", borderRadius: 12, color: "#fff", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(192,57,43,0.35)" }}>
            End Room
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Message Toast ────────────────────────────────────────────────────────────
function MessageToast({ msg, onDismiss, onOpen }) {
  useEffect(() => { const t = setTimeout(onDismiss, 4500); return () => clearTimeout(t); }, [onDismiss]);
  return (
    <div className="toast-pop" onClick={() => { onDismiss(); onOpen(); }}
      style={{ position: "absolute", top: "calc(100% + 12px)", right: 0, background: "#fff", borderRadius: 14, border: "1px solid var(--paper-deep)", boxShadow: "0 8px 32px rgba(26,18,8,0.14)", padding: "0.65rem 0.9rem", maxWidth: 265, display: "flex", gap: "0.6rem", alignItems: "flex-start", cursor: "pointer", zIndex: 60 }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: msg.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.7rem", color: "#fff", flexShrink: 0 }}>{msg.name?.[0]?.toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "0.7rem", fontWeight: 700, color: msg.color, marginBottom: "0.15rem" }}>{msg.name}</p>
        <p style={{ fontSize: "0.82rem", color: "var(--ink)", lineHeight: 1.4, wordBreak: "break-word" }}>{msg.text}</p>
      </div>
      <span style={{ color: "var(--ink-faint)", fontSize: "0.65rem", flexShrink: 0, marginTop: 2, opacity: 0.6 }}>tap to reply</span>
    </div>
  );
}

// ─── Floating Bar — fixed top-right, away from page navigation ────────────────
function FloatingBar({ me, partner, partnerPage, currentPage, unreadCount, onOpenChat, onOpenToc, tocOpen, chatOpen, toast, onDismissToast, hasChapters }) {
  const isSamePage = partnerPage === currentPage;

  return (
    <div style={{ position: "fixed", top: 64, right: 18, zIndex: 50, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.45rem" }}>

      {/* "Reading together" pill */}
      {isSamePage && (
        <div className="toast-pop" style={{ background: "var(--ink)", color: "var(--amber-glow)", borderRadius: 100, padding: "4px 12px", fontSize: "0.68rem", fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(26,18,8,0.22)" }}>
          📖 Reading together
        </div>
      )}

      {/* Main pill */}
      <div style={{ position: "relative" }}>
        {toast && <MessageToast msg={toast} onDismiss={onDismissToast} onOpen={onOpenChat} />}

        <div style={{ background: "rgba(247,242,234,0.96)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", border: "1px solid var(--paper-deep)", borderRadius: 100, boxShadow: "0 8px 40px rgba(26,18,8,0.18)", padding: "0.45rem 0.75rem", display: "flex", alignItems: "center", gap: "0.65rem" }}>

          {/* TOC toggle — only when chapters exist */}
          {hasChapters && (
            <>
              <button onClick={onOpenToc} title="Table of Contents"
                style={{ width: 36, height: 36, borderRadius: "50%", background: tocOpen ? "linear-gradient(135deg, var(--amber), var(--amber-glow))" : "var(--paper-mid)", border: tocOpen ? "none" : "1.5px solid var(--paper-deep)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.22s ease", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tocOpen ? "#fff" : "var(--ink-soft)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
              </button>
              <div style={{ width: 1, height: 20, background: "var(--paper-deep)" }} />
            </>
          )}

          {/* Me avatar with tooltip */}
          <div className="avatar-wrap" style={{ animation: "floatBob 3.2s ease-in-out infinite" }}>
            <span className="avatar-tooltip">{me.name || "You"}</span>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: me.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.9rem", color: "#fff", boxShadow: `0 0 0 2px rgba(247,242,234,1), 0 0 0 4px ${me.color}44`, cursor: "default" }}>
              {me.name?.[0]?.toUpperCase()}
            </div>
            <div style={{ position: "absolute", bottom: 1, right: 1, width: 9, height: 9, borderRadius: "50%", background: "var(--sage)", border: "2px solid rgba(247,242,234,1)", boxShadow: "0 0 6px var(--sage)" }} />
          </div>

          <div style={{ width: 1, height: 20, background: "var(--paper-deep)" }} />

          {/* Partner avatar with tooltip */}
          <div className="avatar-wrap" style={{ animation: "floatBob 3.6s 0.4s ease-in-out infinite" }}>
            <span className="avatar-tooltip">{partner.name || "Partner"} · p.{partnerPage + 1}</span>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: partner.color || "#999", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.9rem", color: "#fff", boxShadow: `0 0 0 2px rgba(247,242,234,1), 0 0 0 4px ${(partner.color || "#999")}44`, cursor: "default" }}>
              {(partner.name || "?")[0]?.toUpperCase()}
            </div>
            {/* Page badge */}
            <div style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)", background: "var(--ink)", borderRadius: 8, padding: "1px 5px", fontSize: "0.5rem", color: "var(--amber-glow)", fontWeight: 700, whiteSpace: "nowrap", lineHeight: 1.6, zIndex: 2 }}>p.{partnerPage + 1}</div>
            <div style={{ position: "absolute", bottom: 1, right: 1, width: 9, height: 9, borderRadius: "50%", background: "var(--sage)", border: "2px solid rgba(247,242,234,1)" }}>
              <div style={{ position: "absolute", inset: -1, borderRadius: "50%", background: "var(--sage)", opacity: 0.4, animation: "ripple 2.2s ease-out infinite" }} />
            </div>
          </div>

          <div style={{ width: 1, height: 20, background: "var(--paper-deep)" }} />

          {/* Chat button */}
          <button onClick={onOpenChat}
            style={{ width: 36, height: 36, borderRadius: "50%", background: chatOpen ? "linear-gradient(135deg, var(--amber), var(--amber-glow))" : "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: chatOpen ? "0 4px 18px rgba(194,120,58,0.45)" : "0 4px 16px rgba(26,18,8,0.28)", transition: "all 0.22s ease", border: "none", cursor: "pointer", position: "relative", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            {unreadCount > 0 && !chatOpen && (
              <div style={{ position: "absolute", top: -3, right: -3, background: "#e05c4a", color: "#fff", width: 17, height: 17, borderRadius: "50%", fontSize: "0.58rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid rgba(247,242,234,1)", animation: "bounce 1s ease-in-out infinite" }}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Emoji Picker ─────────────────────────────────────────────────────────────
const EMOJI_CATEGORIES = [
  { label: "😊", title: "Smileys", emojis: ["😀","😂","😍","🥰","😊","😎","🤩","😭","😅","🤔","😬","🙄","😴","🥹","😇","🤣","😆","😋","😛","🥲","🫠","😤","😩","😢","😡","🤯","🥳","😏","🫡","😐"] },
  { label: "📚", title: "Books & Reading", emojis: ["📚","📖","📝","✏️","🖊️","🖋️","📓","📔","📒","📕","📗","📘","📙","🗒️","📄","📃","📑","🔖","🏷️","💡","🧠","👓","🔍","✨","💬","💭","🗨️","💯","⭐","🌟"] },
  { label: "👍", title: "Gestures", emojis: ["👍","👎","👏","🙌","🤝","🫶","❤️","💔","💕","💞","💖","💗","💓","💘","💝","🔥","✅","❌","⚡","🎉","🎊","🎯","💪","🫂","👀","🤦","🤷","💀","🫣","😮"] },
  { label: "🌙", title: "Nature & Time", emojis: ["🌙","☀️","⭐","🌟","✨","🌈","☁️","🌧️","❄️","🍂","🍃","🌸","🌺","🌻","🍀","🌿","🪴","🌱","🌊","🏔️","🌅","🌄","🕐","⏰","📅","🗓️","⌛","⏳","🔮","🪄"] },
  { label: "🎭", title: "Fun & Reactions", emojis: ["💀","😭","💅","👻","🤡","🫠","🥴","🤢","😵","🤮","🫥","😶","🤫","🧐","🤓","👽","🤖","💩","🫶","🙏","🤞","✌️","🤟","🤙","👈","👉","👆","👇","☝️","✋"] },
];

function EmojiPicker({ onSelect, onClose }) {
  const [activeTab, setActiveTab] = useState(0);
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className="toast-pop" style={{ position: "absolute", bottom: "calc(100% + 8px)", right: 0, width: 272, background: "#fff", border: "1px solid var(--paper-deep)", borderRadius: 16, boxShadow: "0 12px 40px rgba(26,18,8,0.18)", overflow: "hidden", zIndex: 80 }}>
      <div style={{ display: "flex", borderBottom: "1px solid var(--paper-deep)", background: "rgba(247,242,234,0.7)" }}>
        {EMOJI_CATEGORIES.map((cat, i) => (
          <button key={i} onClick={() => setActiveTab(i)} title={cat.title}
            style={{ flex: 1, height: 36, fontSize: "0.95rem", background: "none", border: "none", cursor: "pointer", borderBottom: activeTab === i ? "2px solid var(--amber)" : "2px solid transparent", transition: "all 0.15s", opacity: activeTab === i ? 1 : 0.5 }}>
            {cat.label}
          </button>
        ))}
      </div>
      <div style={{ padding: "0.4rem", display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 2, maxHeight: 180, overflowY: "auto" }}>
        {EMOJI_CATEGORIES[activeTab].emojis.map((emoji, i) => (
          <button key={i} onClick={() => onSelect(emoji)}
            style={{ fontSize: "1.15rem", padding: "0.28rem", background: "none", border: "none", cursor: "pointer", borderRadius: 8, lineHeight: 1, transition: "background 0.1s" }}
            onMouseOver={e => e.currentTarget.style.background = "var(--paper-mid)"}
            onMouseOut={e => e.currentTarget.style.background = "none"}>
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Chat Sidebar ─────────────────────────────────────────────────────────────
function ChatSidebar({ messages, partner, currentPage, onSend, onClose }) {
  const [text,      setText]      = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const endRef   = useRef();
  const inputRef = useRef();

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);

  const send = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
    setEmojiOpen(false);
    inputRef.current?.focus();
  };

  const insertEmoji = (emoji) => {
    const el = inputRef.current;
    if (!el) { setText(t => t + emoji); return; }
    const start = el.selectionStart ?? text.length;
    const end   = el.selectionEnd   ?? text.length;
    const next  = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  return (
    <div className="chat-sidebar" style={{ width: 310, flexShrink: 0, background: "#fff", borderLeft: "1px solid var(--paper-deep)", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "0.9rem 1.1rem", borderBottom: "1px solid var(--paper-deep)", display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0, background: "rgba(247,242,234,0.6)" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: partner.color || "#999", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.8rem", color: "#fff" }}>{(partner.name || "?")[0]?.toUpperCase()}</div>
          <div>
            <p style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--ink)", lineHeight: 1.2 }}>{partner.name || "Partner"}</p>
            <p style={{ fontSize: "0.64rem", color: "var(--sage)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--sage)", display: "inline-block", animation: "pulse 2s ease-in-out infinite" }} />
              Online · Page {(partner.page ?? 0) + 1}
            </p>
          </div>
        </div>
        <button onClick={onClose}
          style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--paper)", border: "1.5px solid var(--paper-deep)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-faint)", fontSize: "0.85rem", cursor: "pointer" }}
          onMouseOver={e => { e.currentTarget.style.background = "var(--ink)"; e.currentTarget.style.color = "#fff"; }}
          onMouseOut={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.color = "var(--ink-faint)"; }}>✕</button>
      </div>

      {/* Messages */}
      <div className="chat-scroll" style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.75rem", animation: "floatBob 3s ease-in-out infinite" }}>✍️</div>
            <p style={{ color: "var(--ink-faint)", fontSize: "0.82rem", fontStyle: "italic", fontFamily: "'Crimson Pro', serif", lineHeight: 1.6 }}>Start the conversation…</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.userId !== partner.userId;
          return (
            <div key={msg.id} className="msg-bubble" style={{ display: "flex", gap: "0.4rem", flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end" }}>
              {!isMe && <div style={{ width: 24, height: 24, borderRadius: "50%", background: msg.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.6rem", color: "#fff", flexShrink: 0 }}>{msg.name?.[0]?.toUpperCase()}</div>}
              <div style={{ maxWidth: "76%", display: "flex", flexDirection: "column", gap: 3, alignItems: isMe ? "flex-end" : "flex-start" }}>
                <div style={{ padding: "0.5rem 0.85rem", background: isMe ? "linear-gradient(135deg, var(--amber) 0%, var(--amber-glow) 100%)" : "var(--paper)", borderRadius: isMe ? "14px 14px 3px 14px" : "14px 14px 14px 3px", color: isMe ? "#fff" : "var(--ink)", fontSize: "0.9rem", lineHeight: 1.5, border: isMe ? "none" : "1px solid var(--paper-deep)", wordBreak: "break-word" }}>{msg.text}</div>
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
      <div style={{ padding: "0.75rem", borderTop: "1px solid var(--paper-deep)", flexShrink: 0 }}>
        <div style={{ position: "relative", display: "flex", gap: "0.4rem", alignItems: "flex-end", background: "var(--paper)", border: "1.5px solid var(--paper-deep)", borderRadius: 14, padding: "0.45rem 0.45rem 0.45rem 0.85rem", transition: "border-color 0.2s" }}
          onFocusCapture={e => e.currentTarget.style.borderColor = "var(--amber)"}
          onBlurCapture={e => { if (!emojiOpen) e.currentTarget.style.borderColor = "var(--paper-deep)"; }}
        >
          <textarea ref={inputRef} value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={`Message ${partner.name || "partner"}…`} rows={1}
            style={{ flex: 1, background: "transparent", resize: "none", color: "var(--ink)", fontSize: "0.875rem", lineHeight: 1.5, fontFamily: "'Lora', serif", maxHeight: 100, overflowY: "auto", outline: "none", border: "none" }} />

          {/* Emoji button + picker */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            {emojiOpen && <EmojiPicker onSelect={insertEmoji} onClose={() => setEmojiOpen(false)} />}
            <button onClick={() => setEmojiOpen(v => !v)} title="Emoji"
              style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: emojiOpen ? "var(--paper-deep)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "1rem", transition: "background 0.15s" }}>
              😊
            </button>
          </div>

          {/* Send */}
          <button onClick={send} disabled={!text.trim()}
            style={{ width: 32, height: 32, borderRadius: 10, border: "none", flexShrink: 0, background: text.trim() ? "linear-gradient(135deg, var(--amber), var(--amber-glow))" : "var(--paper-deep)", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.18s", cursor: text.trim() ? "pointer" : "not-allowed" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={text.trim() ? "#fff" : "var(--ink-faint)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(90deg)" }}><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          </button>
        </div>
        <p style={{ color: "var(--ink-faint)", fontSize: "0.62rem", textAlign: "center", marginTop: "0.3rem" }}>Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}

// ─── Recursive chapter outline flattener ─────────────────────────────────────
async function extractChapters(pdfDoc) {
  try {
    const outline = await pdfDoc.getOutline();
    if (!outline || outline.length === 0) return [];

    const chapters = [];

    const resolveItem = async (item, level) => {
      let pageNum = null;
      try {
        if (item.dest) {
          const dest = typeof item.dest === "string"
            ? await pdfDoc.getDestination(item.dest)
            : item.dest;
          if (dest) {
            const ref = dest[0];
            pageNum = await pdfDoc.getPageIndex(ref) + 1; // 1-based
          }
        }
      } catch { /* skip unresolvable items */ }

      if (pageNum !== null && item.title?.trim()) {
        chapters.push({ title: item.title.trim(), page: pageNum, level });
      }

      if (item.items?.length) {
        for (const child of item.items) {
          await resolveItem(child, level + 1);
        }
      }
    };

    for (const item of outline) {
      await resolveItem(item, 1);
    }

    chapters.sort((a, b) => a.page - b.page);
    return chapters;
  } catch (e) {
    console.warn("Could not extract chapters:", e);
    return [];
  }
}

// ─── ReaderPage ───────────────────────────────────────────────────────────────
export default function ReaderPage() {
  useEffect(() => { injectReaderStyles(); }, []);

  const { session, navigate, setSession, user } = useApp();
  const { userId, name, color, roomId, partner } = session || {};

  const [pdfDoc,        setPdfDoc]        = useState(null);
  const [totalPages,    setTotalPages]    = useState(0);
  const [pdfLoading,    setPdfLoading]    = useState(true);
  const [pdfError,      setPdfError]      = useState("");
  const [downloadPct,   setDownloadPct]   = useState(0);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [ending,        setEnding]        = useState(false);
  const [chapters,      setChapters]      = useState([]);
  const [tocOpen,       setTocOpen]       = useState(false);

  // Load PDF + extract chapters
  useEffect(() => {
    if (!roomId) return;
    let alive = true;
    setPdfLoading(true); setPdfError(""); setDownloadPct(0);

    (async () => {
      try {
        let totalChunks = session?.book?.totalChunks;
        let title       = session?.book?.title;

        if (!totalChunks) {
          const room = await getRoom(roomId);
          if (!room?.totalChunks) {
            if (alive) setPdfError("No PDF found for this room.");
            return;
          }
          totalChunks = room.totalChunks;
          title       = room.bookTitle;
          if (alive) setSession(s => ({
            ...s,
            hostId: s.hostId || room.hostId,
            book:   { ...s?.book, totalChunks, title },
          }));
        }

        const base64 = await downloadPdfChunked(roomId, totalChunks, (pct) => {
          if (alive) setDownloadPct(pct);
        });

        const binary = atob(base64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const pdfDocument = await pdfjs.getDocument({ data: bytes }).promise;
        if (alive) {
          setPdfDoc(pdfDocument);
          setTotalPages(pdfDocument.numPages);
          const chs = await extractChapters(pdfDocument);
          if (alive) setChapters(chs);
        }
      } catch (e) {
        console.error(e);
        if (alive) setPdfError(`Failed to load PDF: ${e.message}`);
      } finally {
        if (alive) setPdfLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [roomId]);

  const { myPage, partnerPage, messages, savePage, sendMessage: firebaseSend, loaded, livePartner } = useRoom({
    roomId,
    myUserId:      userId,
    partnerUserId: partner?.userId && partner.userId !== "pending" ? partner.userId : null,
    myName:  name,
    myColor: color,
  });

  const [currentPage,  setCurrentPage]  = useState(1);
  const [chatOpen,     setChatOpen]     = useState(false);
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [toast,        setToast]        = useState(null);
  const [syncFlash,    setSyncFlash]    = useState(false);
  const prevMsgCount = useRef(0);
  const scrollRef    = useRef();
  const restoredRef  = useRef(false);

  useEffect(() => {
    if (loaded && !restoredRef.current) {
      restoredRef.current = true;
      const p = Math.max(1, Math.min(myPage + 1, totalPages || 9999));
      setCurrentPage(p);
    }
  }, [loaded, totalPages]);

  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      const newest = messages[messages.length - 1];
      if (newest && newest.userId !== userId && !chatOpen) {
        setUnreadCount(c => c + 1);
        setToast(newest);
      }
    }
    prevMsgCount.current = messages.length;
  }, [messages, chatOpen, userId]);

  useEffect(() => { if (chatOpen) { setUnreadCount(0); setToast(null); } }, [chatOpen]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }, [currentPage]);

  // Sidebars are mutually exclusive
  const openChat = useCallback(() => { setChatOpen(v => { if (!v) setTocOpen(false); return !v; }); }, []);
  const openToc  = useCallback(() => { setTocOpen(v => { if (!v) setChatOpen(false); return !v; }); }, []);

  const goToPage = useCallback((p) => {
    if (totalPages === 0) return;
    const next = Math.max(1, Math.min(totalPages, p));
    setCurrentPage(next);
    savePage(next - 1);
  }, [totalPages, savePage]);

  const syncToPartner = () => {
    goToPage(partnerPage + 1);
    setSyncFlash(true);
    setTimeout(() => setSyncFlash(false), 2000);
  };

  const handleSend = useCallback((text) => {
    firebaseSend(text, currentPage - 1);
  }, [firebaseSend, currentPage]);

  const handleEndRoom = async () => {
    setEnding(true);
    try {
      await deleteRoom(roomId);
      navigate("home");
    } catch (e) {
      console.error(e);
      alert(`Failed to end room: ${e.message}`);
      setEnding(false);
      setShowEndDialog(false);
    }
  };

  const progress   = totalPages > 1 ? ((currentPage - 1) / (totalPages - 1)) * 100 : 100;
  const pagesDiff  = Math.abs((partnerPage + 1) - currentPage);
  // Merge livePartner (from Firestore room doc) over stale session data.
  // The host gets the partner name the instant they join — no refresh needed.
  const partnerObj = {
    ...(partner || {}),
    ...(livePartner || {}),
    page: partnerPage,
  };
  const me         = { name, color };
  const bookTitle  = session?.book?.title || "Reading…";
  const hostId     = session?.hostId;
  const amHost     = userId && hostId && userId === hostId;

  if (!session) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)", gap: "1rem", flexDirection: "column" }}>
        <p style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>No session found.</p>
        <button onClick={() => navigate("home")} style={{ color: "var(--amber)", fontWeight: 600, border: "1.5px solid var(--amber)", borderRadius: 100, padding: "0.5rem 1.25rem", background: "none", cursor: "pointer" }}>← Go Home</button>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--paper)", overflow: "hidden" }}>

      {showEndDialog && (
        <EndRoomDialog onConfirm={handleEndRoom} onCancel={() => setShowEndDialog(false)} />
      )}

      {/* Top bar */}
      <header style={{ height: 52, flexShrink: 0, zIndex: 20, background: "rgba(247,242,234,0.96)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid var(--paper-deep)", display: "flex", alignItems: "center", gap: "0.9rem", padding: "0 1.25rem" }}>
        {amHost ? (
          <button onClick={() => setShowEndDialog(true)} disabled={ending}
            style={{ color: ending ? "var(--ink-faint)" : "#c0392b", fontSize: "0.78rem", fontWeight: 600, background: "none", border: "1.5px solid currentColor", borderRadius: 100, padding: "3px 10px", cursor: "pointer", opacity: ending ? 0.5 : 1 }}>
            {ending ? "Ending…" : "End Room"}
          </button>
        ) : (
          <button onClick={() => navigate("home")}
            style={{ color: "var(--ink-faint)", fontSize: "0.78rem", fontWeight: 500, background: "none", border: "none", cursor: "pointer" }}
            onMouseOver={e => e.currentTarget.style.color = "var(--amber)"}
            onMouseOut={e => e.currentTarget.style.color = "var(--ink-faint)"}
          >← Leave</button>
        )}

        <span style={{ color: "var(--paper-deep)" }}>·</span>
        <span style={{ fontFamily: "'Lora', serif", fontSize: "1rem", fontWeight: 700, color: "var(--ink)" }}>Page<em style={{ fontStyle: "italic", color: "var(--amber)" }}>Turn</em></span>
        <span style={{ color: "var(--paper-deep)" }}>·</span>
        <span style={{ fontFamily: "'Crimson Pro', serif", fontStyle: "italic", color: "var(--ink-soft)", fontSize: "0.92rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{bookTitle}</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "var(--paper-mid)", border: "1px solid var(--paper-deep)", borderRadius: 100, padding: "3px 10px" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--sage)", display: "inline-block", animation: "pulse 2s ease-in-out infinite" }} />
          <span style={{ color: "var(--ink-faint)", fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.06em" }}>#{roomId}</span>
        </div>
        {totalPages > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div style={{ width: 68, height: 3, background: "var(--paper-deep)", borderRadius: 3 }}>
              <div style={{ width: `${progress}%`, height: "100%", borderRadius: 3, background: "linear-gradient(90deg, var(--amber), var(--amber-glow))", transition: "width 0.4s ease" }} />
            </div>
            <span style={{ color: "var(--ink-faint)", fontSize: "0.7rem", fontWeight: 600 }}>{currentPage}<span style={{ color: "var(--paper-deep)" }}>/</span>{totalPages}</span>
          </div>
        )}
      </header>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* TOC — left */}
        {tocOpen && (
          <TocSidebar
            chapters={chapters}
            currentPage={currentPage}
            totalPages={totalPages}
            onNavigate={(p) => goToPage(p)}
            onClose={() => setTocOpen(false)}
          />
        )}

        {/* Main reading area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
          <div ref={scrollRef} className="reader-scroll" style={{ flex: 1, overflowY: "auto" }}>
            {pdfLoading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "1rem", minHeight: 300, padding: "2rem" }}>
                <div style={{ width: 32, height: 32, border: "3px solid var(--paper-deep)", borderTopColor: "var(--amber)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <p style={{ color: "var(--ink-faint)", fontSize: "0.85rem", fontStyle: "italic" }}>
                  {downloadPct > 0 && downloadPct < 100 ? "Downloading book…" : downloadPct === 100 ? "Rendering PDF…" : "Loading…"}
                </p>
                {downloadPct > 0 && (
                  <div style={{ width: 200 }}>
                    <div style={{ height: 4, background: "var(--paper-deep)", borderRadius: 4 }}>
                      <div style={{ height: "100%", width: `${downloadPct}%`, background: "linear-gradient(90deg, var(--amber), var(--amber-glow))", borderRadius: 4, transition: "width 0.2s ease" }} />
                    </div>
                    <p style={{ color: "var(--amber)", fontSize: "0.75rem", fontWeight: 700, textAlign: "center", marginTop: "0.3rem" }}>{downloadPct}%</p>
                  </div>
                )}
              </div>
            ) : pdfError ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "1rem", padding: "2rem", minHeight: 300 }}>
                <p style={{ color: "#c0392b", fontSize: "0.95rem", textAlign: "center" }}>⚠️ {pdfError}</p>
                <button onClick={() => navigate("home")} style={{ color: "var(--amber)", fontWeight: 600, border: "1.5px solid var(--amber)", borderRadius: 100, padding: "0.5rem 1.25rem", background: "none", cursor: "pointer" }}>← Go Home</button>
              </div>
            ) : pdfDoc ? (
              <PdfPage pdfDoc={pdfDoc} pageNum={currentPage} />
            ) : null}
          </div>

          {/* Partner nudge */}
          {loaded && pagesDiff > 0 && (
            <div className="toast-pop" style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: "0.5rem", background: "#fff", border: "1px solid var(--paper-deep)", borderRadius: 100, padding: "5px 14px", fontSize: "0.75rem", color: "var(--ink-soft)", boxShadow: "var(--shadow-sm)", whiteSpace: "nowrap", zIndex: 10 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: partner?.color }} />
              {partner?.name} is on page {partnerPage + 1}
              <button onClick={syncToPartner} style={{ color: "var(--amber)", fontWeight: 700, fontSize: "0.72rem", background: "none", border: "none", cursor: "pointer", borderBottom: "1px dotted var(--amber)", padding: "0 1px", lineHeight: 1 }}>
                {syncFlash ? "✓ Synced!" : "Jump there →"}
              </button>
            </div>
          )}

          {/* Page nav — centred at bottom, no longer overlapping anything */}
          {totalPages > 0 && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "1rem 2rem 1.5rem", background: "linear-gradient(to top, rgba(247,242,234,1) 60%, rgba(247,242,234,0))", display: "flex", alignItems: "center", justifyContent: "center", gap: "1.25rem" }}>
              <button className="page-btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}
                style={{ width: 42, height: 42, borderRadius: "50%", border: `1.5px solid ${currentPage <= 1 ? "var(--paper-deep)" : "var(--ink)"}`, background: currentPage <= 1 ? "transparent" : "var(--ink)", color: currentPage <= 1 ? "var(--paper-deep)" : "#fff", fontSize: "1.25rem", display: "flex", alignItems: "center", justifyContent: "center", cursor: currentPage <= 1 ? "not-allowed" : "pointer" }}>‹</button>

              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <input type="number" min={1} max={totalPages} value={currentPage}
                  onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) goToPage(v); }}
                  style={{ width: 54, textAlign: "center", padding: "0.3rem 0.2rem", border: "1.5px solid var(--paper-deep)", borderRadius: 8, fontSize: "0.9rem", fontWeight: 700, color: "var(--ink)", background: "var(--paper)", outline: "none", fontFamily: "'Lora', serif" }}
                  onFocus={e => e.target.style.borderColor = "var(--amber)"}
                  onBlur={e => e.target.style.borderColor = "var(--paper-deep)"}
                />
                <span style={{ color: "var(--ink-faint)", fontSize: "0.8rem" }}>/ {totalPages}</span>
              </div>

              <button className="page-btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages}
                style={{ width: 42, height: 42, borderRadius: "50%", border: `1.5px solid ${currentPage >= totalPages ? "var(--paper-deep)" : "var(--ink)"}`, background: currentPage >= totalPages ? "transparent" : "var(--ink)", color: currentPage >= totalPages ? "var(--paper-deep)" : "#fff", fontSize: "1.25rem", display: "flex", alignItems: "center", justifyContent: "center", cursor: currentPage >= totalPages ? "not-allowed" : "pointer" }}>›</button>
            </div>
          )}
        </div>

        {/* Chat — right */}
        {chatOpen && (
          <ChatSidebar messages={messages} partner={partnerObj} currentPage={currentPage - 1} onSend={handleSend} onClose={() => setChatOpen(false)} />
        )}
      </div>

      {/* Floating bar — top-right corner, well away from page nav */}
      <FloatingBar
        me={me} partner={partnerObj}
        partnerPage={partnerPage} currentPage={currentPage - 1}
        unreadCount={unreadCount}
        onOpenChat={openChat}
        onOpenToc={openToc}
        tocOpen={tocOpen}
        chatOpen={chatOpen}
        toast={toast}
        onDismissToast={() => setToast(null)}
        hasChapters={chapters.length > 0}
      />
    </div>
  );
}