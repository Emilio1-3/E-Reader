import { useState, useRef, useEffect } from "react";
import { useApp } from "../App";

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
const randomId   = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const randomColor = () => ["#c2785a","#6b8f71","#7a6fa0","#b5804a","#4f7fa3","#a05a6b"][Math.floor(Math.random()*6)];

// ─── CSS-in-JS base styles (injected once) ───────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }

  :root {
    --ink:       #1a1208;
    --ink-soft:  #3d3020;
    --ink-faint: #7a6a55;
    --paper:     #f7f2ea;
    --paper-mid: #ede4d4;
    --paper-deep:#e0d4be;
    --amber:     #c2783a;
    --amber-glow:#e8a060;
    --sage:      #6b8f71;
    --radius-sm: 6px;
    --radius-md: 14px;
    --radius-lg: 24px;
    --shadow-sm: 0 2px 8px rgba(26,18,8,0.08);
    --shadow-md: 0 8px 32px rgba(26,18,8,0.12);
    --shadow-lg: 0 24px 64px rgba(26,18,8,0.18);
    --transition: 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  }

  body { background: var(--paper); color: var(--ink); }

  @keyframes fadeUp   { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn   { from { opacity:0; } to { opacity:1; } }
  @keyframes floatY   { 0%,100% { transform:translateY(0px) rotate(-1deg); } 50% { transform:translateY(-12px) rotate(1deg); } }
  @keyframes shimmer  { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes spin     { to { transform: rotate(360deg); } }
  @keyframes pulse    { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
  @keyframes slideIn  { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:translateX(0); } }
  @keyframes popIn    { from { opacity:0; transform:scale(0.88); } to { opacity:1; transform:scale(1); } }
  @keyframes bounce   { 0%,100% { transform:translateY(0); } 40% { transform:translateY(-6px); } }

  .fade-up { animation: fadeUp 0.6s cubic-bezier(0.4,0,0.2,1) both; }
  .fade-up-1 { animation: fadeUp 0.6s 0.1s cubic-bezier(0.4,0,0.2,1) both; }
  .fade-up-2 { animation: fadeUp 0.6s 0.22s cubic-bezier(0.4,0,0.2,1) both; }
  .fade-up-3 { animation: fadeUp 0.6s 0.34s cubic-bezier(0.4,0,0.2,1) both; }
  .fade-up-4 { animation: fadeUp 0.6s 0.46s cubic-bezier(0.4,0,0.2,1) both; }
  .pop-in    { animation: popIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both; }
  .slide-in  { animation: slideIn 0.3s ease both; }

  button, input, textarea { font-family: inherit; }
  button { cursor: pointer; border: none; background: none; }
  input, textarea { border: none; outline: none; background: none; }
  input::placeholder, textarea::placeholder { color: var(--ink-faint); }

  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--paper-deep); border-radius: 4px; }
`;

function injectStyles() {
  if (document.getElementById("pageturn-styles")) return;
  const s = document.createElement("style");
  s.id = "pageturn-styles";
  s.textContent = GLOBAL_CSS;
  document.head.appendChild(s);
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function Label({ children, style }) {
  return (
    <p style={{
      fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase", color: "var(--ink-faint)",
      marginBottom: "0.45rem", fontFamily: "'Lora', serif", ...style,
    }}>{children}</p>
  );
}

function Card({ children, style, className }) {
  return (
    <div className={className} style={{
      background: "#fff",
      border: "1px solid var(--paper-deep)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-md)",
      ...style,
    }}>
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, loading, style }) {
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      padding: "0.85rem 2rem",
      background: disabled || loading
        ? "var(--paper-deep)"
        : "linear-gradient(135deg, #c2783a 0%, #e8a060 100%)",
      color: disabled || loading ? "var(--ink-faint)" : "#fff",
      borderRadius: "var(--radius-md)",
      fontSize: "0.95rem", fontWeight: 600, letterSpacing: "0.02em",
      boxShadow: disabled || loading ? "none" : "0 4px 20px rgba(194,120,58,0.35)",
      transition: "var(--transition)",
      display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
      cursor: disabled || loading ? "not-allowed" : "pointer",
      width: "100%",
      ...style,
    }}
    onMouseOver={e => { if (!disabled && !loading) e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(194,120,58,0.45)"; }}
    onMouseOut={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = disabled || loading ? "none" : "0 4px 20px rgba(194,120,58,0.35)"; }}
    >
      {loading && <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />}
      {children}
    </button>
  );
}

function GhostButton({ children, onClick, style }) {
  return (
    <button onClick={onClick} style={{
      padding: "0.75rem 1.5rem",
      border: "1.5px solid var(--paper-deep)",
      borderRadius: "var(--radius-md)",
      color: "var(--ink-soft)", fontSize: "0.9rem", fontWeight: 500,
      transition: "var(--transition)",
      display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
      width: "100%", ...style,
    }}
    onMouseOver={e => { e.currentTarget.style.borderColor = "var(--amber)"; e.currentTarget.style.color = "var(--amber)"; e.currentTarget.style.background = "rgba(194,120,58,0.04)"; }}
    onMouseOut={e => { e.currentTarget.style.borderColor = "var(--paper-deep)"; e.currentTarget.style.color = "var(--ink-soft)"; e.currentTarget.style.background = ""; }}
    >
      {children}
    </button>
  );
}

function StyledInput({ value, onChange, placeholder, onKeyDown, autoFocus, style }) {
  return (
    <input
      value={value} onChange={onChange} placeholder={placeholder}
      onKeyDown={onKeyDown} autoFocus={autoFocus}
      style={{
        width: "100%", padding: "0.75rem 1rem",
        background: "var(--paper)", border: "1.5px solid var(--paper-deep)",
        borderRadius: "var(--radius-sm)", fontSize: "0.95rem", color: "var(--ink)",
        transition: "var(--transition)", ...style,
      }}
      onFocus={e => e.target.style.borderColor = "var(--amber)"}
      onBlur={e => e.target.style.borderColor = "var(--paper-deep)"}
    />
  );
}

// ─── Step 1: Welcome ──────────────────────────────────────────────────────────
function WelcomeStep({ onStartReading }) {
  // Floating book illustrations (pure CSS shapes)
  const books = [
    { color: "#c2783a", top: "12%", left: "8%",  w: 36, h: 52, delay: "0s",   rot: "-8deg" },
    { color: "#6b8f71", top: "20%", right: "10%", w: 28, h: 42, delay: "0.8s", rot: "6deg" },
    { color: "#7a6fa0", top: "65%", left: "6%",  w: 32, h: 48, delay: "1.4s", rot: "4deg" },
    { color: "#4f7fa3", top: "70%", right: "8%",  w: 40, h: 58, delay: "0.4s", rot: "-5deg" },
    { color: "#b5804a", top: "42%", left: "3%",  w: 22, h: 34, delay: "1.1s", rot: "10deg" },
    { color: "#a05a6b", top: "38%", right: "4%", w: 26, h: 38, delay: "0.6s", rot: "-12deg" },
  ];

  return (
    <div style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: "2rem" }}>

      {/* Paper texture overlay */}
      <div style={{ position: "fixed", inset: 0, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E\")", pointerEvents: "none", zIndex: 0 }} />

      {/* Warm radial glow */}
      <div style={{ position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(194,120,58,0.08) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      {/* Floating books */}
      {books.map((b, i) => (
        <div key={i} style={{
          position: "fixed", top: b.top, left: b.left, right: b.right,
          width: b.w, height: b.h,
          background: b.color,
          borderRadius: "2px 4px 4px 2px",
          opacity: 0.18,
          transform: `rotate(${b.rot})`,
          animation: `floatY ${5 + i * 0.7}s ${b.delay} ease-in-out infinite`,
          boxShadow: `2px 2px 8px rgba(0,0,0,0.15)`,
          zIndex: 0,
        }}>
          <div style={{ position: "absolute", left: 4, top: 0, bottom: 0, width: 3, background: "rgba(0,0,0,0.12)", borderRadius: "1px 0 0 1px" }} />
        </div>
      ))}

      {/* Main content */}
      <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 560 }}>

        {/* Ornamental top */}
        <div className="fade-up" style={{ marginBottom: "2rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem", color: "var(--amber)", fontSize: "0.75rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>
            <span style={{ width: 40, height: 1, background: "var(--amber)", display: "inline-block", opacity: 0.6 }} />
            A place for shared stories
            <span style={{ width: 40, height: 1, background: "var(--amber)", display: "inline-block", opacity: 0.6 }} />
          </div>
        </div>

        {/* Title */}
        <h1 className="fade-up-1" style={{
          fontFamily: "'Lora', serif", fontSize: "clamp(3.2rem, 8vw, 5.5rem)",
          fontWeight: 700, lineHeight: 1.05, color: "var(--ink)",
          letterSpacing: "-0.02em", marginBottom: "1.5rem",
        }}>
          Page<em style={{ fontStyle: "italic", color: "var(--amber)" }}>Turn</em>
        </h1>

        {/* Tagline */}
        <p className="fade-up-2" style={{
          fontFamily: "'Crimson Pro', serif",
          fontSize: "clamp(1.1rem, 2.5vw, 1.35rem)",
          color: "var(--ink-soft)", lineHeight: 1.7,
          marginBottom: "2.5rem", fontStyle: "italic",
          maxWidth: 400, margin: "0 auto 2.5rem",
        }}>
          Upload a book, invite a friend,<br />and read together — live.
        </p>

        {/* CTA */}
        <div className="fade-up-3" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", maxWidth: 280, margin: "0 auto" }}>
          <PrimaryButton onClick={onStartReading} style={{ fontSize: "1.05rem", padding: "1rem 2.5rem" }}>
            <span>Start Reading</span>
            <span style={{ fontSize: "1.1rem" }}>→</span>
          </PrimaryButton>

          <p style={{ color: "var(--ink-faint)", fontSize: "0.8rem", lineHeight: 1.5 }}>
            No account needed · Just you and one friend
          </p>
        </div>

        {/* Bottom ornament */}
        <div className="fade-up-4" style={{ marginTop: "4rem", display: "flex", justifyContent: "center", gap: "0.5rem", color: "var(--paper-deep)" }}>
          {["◆","◇","◆"].map((s,i) => <span key={i} style={{ fontSize: "0.6rem" }}>{s}</span>)}
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Name entry ───────────────────────────────────────────────────────
function NameStep({ onNext, onBack }) {
  const [name, setName] = useState("");

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", background: "var(--paper)" }}>
      <Card className="pop-in" style={{ width: "100%", maxWidth: 420, padding: "2.5rem" }}>

        {/* Back */}
        <button onClick={onBack} style={{ color: "var(--ink-faint)", fontSize: "0.82rem", marginBottom: "1.75rem", display: "flex", alignItems: "center", gap: "0.3rem", transition: "color 0.2s" }}
          onMouseOver={e => e.currentTarget.style.color = "var(--amber)"}
          onMouseOut={e => e.currentTarget.style.color = "var(--ink-faint)"}
        >
          ← Back
        </button>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: "0.35rem", marginBottom: "2rem" }}>
          {[1,2,3].map(n => (
            <div key={n} style={{ height: 3, flex: 1, borderRadius: 3, background: n === 1 ? "var(--amber)" : "var(--paper-deep)", transition: "background 0.3s" }} />
          ))}
        </div>

        <Label>Step 1 of 3</Label>
        <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.65rem", fontWeight: 700, color: "var(--ink)", marginBottom: "0.5rem", lineHeight: 1.25 }}>
          What's your name?
        </h2>
        <p style={{ fontFamily: "'Crimson Pro', serif", color: "var(--ink-faint)", fontSize: "1rem", marginBottom: "1.75rem", fontStyle: "italic" }}>
          Your reading partner will see this.
        </p>

        <StyledInput
          value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. Maya"
          autoFocus
          onKeyDown={e => e.key === "Enter" && name.trim() && onNext(name.trim())}
        />

        <PrimaryButton
          onClick={() => onNext(name.trim())}
          disabled={!name.trim()}
          style={{ marginTop: "1.25rem" }}
        >
          Continue →
        </PrimaryButton>
      </Card>
    </div>
  );
}

// ─── PDF text extraction via pdf.js (loaded from CDN lazily) ─────────────────
async function extractPdfText(file) {
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const textParts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    textParts.push(content.items.map(item => item.str).join(" "));
  }
  return textParts.join("\n\n");
}

// ─── Step 3: Upload book ──────────────────────────────────────────────────────
function UploadStep({ userName, onNext, onBack }) {
  const [dragging, setDragging]     = useState(false);
  const [book, setBook]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Reading file…");
  const [error, setError]           = useState("");
  const fileRef                     = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    const isTxt = file.name.toLowerCase().endsWith(".txt");
    const isPdf = file.name.toLowerCase().endsWith(".pdf");
    if (!isTxt && !isPdf) { setError("Please upload a .txt or .pdf file."); return; }
    setError(""); setLoading(true);
    try {
      let content = "";
      const title = file.name.replace(/\.(txt|pdf)$/i, "");
      if (isTxt) {
        setLoadingMsg("Reading text file…");
        content = await file.text();
      } else {
        setLoadingMsg("Extracting text from PDF…");
        content = await extractPdfText(file);
      }
      if (!content.trim()) {
        setError("Couldn\'t extract text. The PDF may be image-only or scanned.");
        setLoading(false); return;
      }
      setBook({ title, content, fileType: isPdf ? "pdf" : "txt" });
    } catch (err) {
      setError("Failed to read file. Please try another."); console.error(err);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", background: "var(--paper)" }}>
      <Card className="pop-in" style={{ width: "100%", maxWidth: 460, padding: "2.5rem" }}>

        <button onClick={onBack} style={{ color: "var(--ink-faint)", fontSize: "0.82rem", marginBottom: "1.75rem", display: "flex", alignItems: "center", gap: "0.3rem", transition: "color 0.2s" }}
          onMouseOver={e => e.currentTarget.style.color = "var(--amber)"}
          onMouseOut={e => e.currentTarget.style.color = "var(--ink-faint)"}
        >
          ← Back
        </button>

        <div style={{ display: "flex", gap: "0.35rem", marginBottom: "2rem" }}>
          {[1,2,3].map(n => (
            <div key={n} style={{ height: 3, flex: 1, borderRadius: 3, background: n <= 2 ? "var(--amber)" : "var(--paper-deep)" }} />
          ))}
        </div>

        <Label>Step 2 of 3</Label>
        <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.65rem", fontWeight: 700, color: "var(--ink)", marginBottom: "0.5rem", lineHeight: 1.25 }}>
          Upload your book
        </h2>
        <p style={{ fontFamily: "'Crimson Pro', serif", color: "var(--ink-faint)", fontSize: "1rem", marginBottom: "1.75rem", fontStyle: "italic" }}>
          .txt or .pdf — your partner will receive it automatically.
        </p>

        {/* Drop zone */}
        {!book ? (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
            onClick={() => fileRef.current.click()}
            style={{
              border: `2px dashed ${dragging ? "var(--amber)" : "var(--paper-deep)"}`,
              borderRadius: "var(--radius-md)",
              padding: "3rem 2rem", textAlign: "center",
              background: dragging ? "rgba(194,120,58,0.04)" : "var(--paper)",
              cursor: "pointer", transition: "var(--transition)",
              boxShadow: dragging ? "0 0 0 4px rgba(194,120,58,0.12)" : "none",
            }}
          >
            <div style={{ fontSize: "2.8rem", marginBottom: "0.75rem", animation: loading ? "none" : "floatY 4s ease-in-out infinite" }}>
              {loading ? "⚙️" : "📄"}
            </div>
            {loading ? (
              <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem" }}>{loadingMsg}</p>
            ) : (
              <>
                <p style={{ color: "var(--ink-soft)", fontSize: "0.95rem", marginBottom: "0.5rem" }}>Drop your book here</p>
                <div style={{ display: "flex", justifyContent: "center", gap: "0.4rem", marginBottom: "0.4rem" }}>
                  {[{ label: ".TXT", color: "var(--sage)" }, { label: ".PDF", color: "#e05c4a" }].map(({ label, color }) => (
                    <span key={label} style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", color, background: color + "18", border: `1px solid ${color}44`, borderRadius: 6, padding: "2px 8px" }}>{label}</span>
                  ))}
                </div>
                <p style={{ color: "var(--ink-faint)", fontSize: "0.8rem" }}>or click to browse</p>
              </>
            )}
            <input ref={fileRef} type="file" accept=".txt,.pdf" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
          </div>
        ) : (
          // Book loaded state
          <div className="slide-in" style={{ border: "1.5px solid var(--sage)", borderRadius: "var(--radius-md)", padding: "1.25rem 1.5rem", background: "rgba(107,143,113,0.06)", display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{ fontSize: "2rem", flexShrink: 0 }}>{book.fileType === "pdf" ? "📕" : "📗"}</div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.15rem" }}>
                <p style={{ fontWeight: 600, color: "var(--ink)", fontSize: "0.95rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{book.title}</p>
                <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.06em", color: book.fileType === "pdf" ? "#e05c4a" : "var(--sage)", background: book.fileType === "pdf" ? "#e05c4a18" : "rgba(107,143,113,0.15)", border: `1px solid ${book.fileType === "pdf" ? "#e05c4a44" : "rgba(107,143,113,0.3)"}`, borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>
                  {book.fileType?.toUpperCase()}
                </span>
              </div>
              <p style={{ color: "var(--ink-faint)", fontSize: "0.78rem" }}>{Math.ceil(book.content.length / 1400)} pages · {(book.content.length / 1024).toFixed(0)} KB extracted</p>
            </div>
            <button onClick={() => { setBook(null); setError(""); }} style={{ color: "var(--ink-faint)", fontSize: "0.8rem", padding: "0.25rem 0.5rem", borderRadius: "var(--radius-sm)", transition: "color 0.15s" }}
              onMouseOver={e => e.currentTarget.style.color = "#c0392b"}
              onMouseOut={e => e.currentTarget.style.color = "var(--ink-faint)"}
            >✕</button>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div style={{ marginTop: "0.75rem", padding: "0.6rem 0.9rem", background: "#fdf0ee", border: "1px solid #e8a090", borderRadius: "var(--radius-sm)", color: "#c0392b", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span>⚠️</span> {error}
          </div>
        )}

        <PrimaryButton
          onClick={() => onNext(book)}
          disabled={!book || loading}
          loading={loading}
          style={{ marginTop: "1.25rem" }}
        >
          Continue →
        </PrimaryButton>
      </Card>
    </div>
  );
}

// ─── Step 4: Create room & invite ─────────────────────────────────────────────
function RoomStep({ userName, userColor, book, onEnterRoom, onBack }) {
  const [roomCode]      = useState(() => randomId());            // e.g. "AX7F2K"
  const [partnerName, setPartnerName] = useState("");
  const [partnerColor]  = useState(() => {
    // pick a color different from the host's
    const all = ["#c2783a","#6b8f71","#7a6fa0","#b5804a","#4f7fa3","#a05a6b"];
    return all.find(c => c !== userColor) || all[0];
  });
  const [copied, setCopied] = useState(false);
  const [waitingForPartner, setWaitingForPartner] = useState(false);
  const [partnerJoined, setPartnerJoined] = useState(false);
  const timerRef = useRef(null);

  // Simulate partner joining after name is entered (frontend-only demo)
  useEffect(() => {
    if (waitingForPartner && partnerName.trim()) {
      timerRef.current = setTimeout(() => {
        setPartnerJoined(true);
        setWaitingForPartner(false);
      }, 2200);
    }
    return () => clearTimeout(timerRef.current);
  }, [waitingForPartner, partnerName]);

  const shareLink = `${window.location.origin}?room=${roomCode}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", background: "var(--paper)" }}>
      <Card className="pop-in" style={{ width: "100%", maxWidth: 480, padding: "2.5rem" }}>

        <button onClick={onBack} style={{ color: "var(--ink-faint)", fontSize: "0.82rem", marginBottom: "1.75rem", display: "flex", alignItems: "center", gap: "0.3rem", transition: "color 0.2s" }}
          onMouseOver={e => e.currentTarget.style.color = "var(--amber)"}
          onMouseOut={e => e.currentTarget.style.color = "var(--ink-faint)"}
        >
          ← Back
        </button>

        <div style={{ display: "flex", gap: "0.35rem", marginBottom: "2rem" }}>
          {[1,2,3].map(n => (
            <div key={n} style={{ height: 3, flex: 1, borderRadius: 3, background: "var(--amber)" }} />
          ))}
        </div>

        <Label>Step 3 of 3</Label>
        <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.65rem", fontWeight: 700, color: "var(--ink)", marginBottom: "0.5rem", lineHeight: 1.25 }}>
          Invite your reading partner
        </h2>
        <p style={{ fontFamily: "'Crimson Pro', serif", color: "var(--ink-faint)", fontSize: "1rem", marginBottom: "1.75rem", fontStyle: "italic" }}>
          Share the room code or link with one friend.
        </p>

        {/* Room code */}
        <div style={{ marginBottom: "1.5rem" }}>
          <Label>Room Code</Label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div style={{
              flex: 1, padding: "0.85rem 1.25rem",
              background: "var(--ink)", borderRadius: "var(--radius-sm)",
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: "0.5rem",
            }}>
              {roomCode.split("").map((ch, i) => (
                <span key={i} style={{
                  fontFamily: "'Lora', serif", fontSize: "1.6rem", fontWeight: 700,
                  color: "var(--amber-glow)", letterSpacing: "0.05em",
                  animation: `fadeIn 0.4s ${i * 0.06}s both`,
                }}>{ch}</span>
              ))}
            </div>
            <button onClick={handleCopy} style={{
              padding: "0.85rem 1.1rem",
              background: copied ? "var(--sage)" : "var(--paper-mid)",
              borderRadius: "var(--radius-sm)",
              color: copied ? "#fff" : "var(--ink-soft)",
              fontWeight: 600, fontSize: "0.82rem",
              transition: "var(--transition)", flexShrink: 0,
              border: "1.5px solid var(--paper-deep)",
            }}>
              {copied ? "✓ Copied" : "Copy link"}
            </button>
          </div>
          <p style={{ color: "var(--ink-faint)", fontSize: "0.73rem", marginTop: "0.4rem" }}>
            {shareLink.length > 50 ? shareLink.slice(0, 50) + "…" : shareLink}
          </p>
        </div>

        {/* Partner name */}
        <div style={{ marginBottom: "1.5rem" }}>
          <Label>Your partner's name (optional)</Label>
          <StyledInput
            value={partnerName}
            onChange={e => { setPartnerName(e.target.value); setPartnerJoined(false); }}
            placeholder="e.g. Amara"
          />
          {partnerName.trim() && !partnerJoined && !waitingForPartner && (
            <button onClick={() => setWaitingForPartner(true)} style={{
              marginTop: "0.6rem", color: "var(--amber)", fontSize: "0.82rem",
              fontWeight: 600, display: "flex", alignItems: "center", gap: "0.35rem",
              transition: "opacity 0.2s",
            }}>
              <span style={{ animation: "bounce 1.2s ease-in-out infinite", display: "inline-block" }}>📨</span>
              Notify {partnerName} they've been invited
            </button>
          )}
        </div>

        {/* Live users panel */}
        <div style={{
          background: "var(--paper)", border: "1.5px solid var(--paper-deep)",
          borderRadius: "var(--radius-md)", padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
        }}>
          <Label style={{ marginBottom: "0.75rem" }}>In the room right now</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>

            {/* Host (you) */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: userColor, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem", color: "#fff", flexShrink: 0, boxShadow: "0 0 0 2.5px var(--paper), 0 0 0 4px " + userColor + "55" }}>
                {userName[0].toUpperCase()}
              </div>
              <div>
                <p style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--ink)" }}>{userName} <span style={{ fontWeight: 400, color: "var(--ink-faint)", fontSize: "0.78rem" }}>(you)</span></p>
                <p style={{ fontSize: "0.72rem", color: "var(--sage)", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--sage)", display: "inline-block", boxShadow: "0 0 6px var(--sage)" }} /> Online · Host
                </p>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <span style={{ fontSize: "0.7rem", background: "rgba(107,143,113,0.15)", color: "var(--sage)", borderRadius: 100, padding: "2px 8px", fontWeight: 700 }}>HOST</span>
              </div>
            </div>

            {/* Partner slot */}
            {!partnerJoined ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", opacity: waitingForPartner ? 1 : 0.55 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", border: "2px dashed var(--paper-deep)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {waitingForPartner
                    ? <span style={{ width: 14, height: 14, border: "2px solid var(--paper-deep)", borderTopColor: "var(--amber)", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
                    : <span style={{ color: "var(--ink-faint)", fontSize: "0.9rem" }}>?</span>
                  }
                </div>
                <div>
                  <p style={{ fontWeight: 500, fontSize: "0.88rem", color: "var(--ink-faint)", fontStyle: "italic" }}>
                    {waitingForPartner ? `Waiting for ${partnerName || "your partner"}…` : "Waiting for partner to join…"}
                  </p>
                  <p style={{ fontSize: "0.72rem", color: "var(--ink-faint)" }}>
                    {waitingForPartner
                      ? <span style={{ animation: "pulse 1.2s ease-in-out infinite", display: "inline-block" }}>Sending invite…</span>
                      : "Share the code above"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="slide-in" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: partnerColor, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem", color: "#fff", flexShrink: 0, boxShadow: "0 0 0 2.5px var(--paper), 0 0 0 4px " + partnerColor + "55" }}>
                  {partnerName[0].toUpperCase()}
                </div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--ink)" }}>{partnerName}</p>
                  <p style={{ fontSize: "0.72rem", color: "var(--sage)", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--sage)", display: "inline-block", boxShadow: "0 0 6px var(--sage)", animation: "pulse 2s ease-in-out infinite" }} /> Just joined!
                  </p>
                </div>
                <div style={{ marginLeft: "auto" }}>
                  <span style={{ fontSize: "0.7rem", background: "rgba(194,120,58,0.12)", color: "var(--amber)", borderRadius: 100, padding: "2px 8px", fontWeight: 700 }}>READER</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Book preview */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.9rem 1.1rem", background: "var(--paper)", border: "1.5px solid var(--paper-deep)", borderRadius: "var(--radius-sm)", marginBottom: "1.5rem" }}>
          <span style={{ fontSize: "1.4rem" }}>📗</span>
          <div>
            <p style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--ink)" }}>{book?.title}</p>
            <p style={{ fontSize: "0.73rem", color: "var(--ink-faint)" }}>{Math.ceil((book?.content?.length || 0) / 1400)} pages ready</p>
          </div>
        </div>

        <PrimaryButton onClick={() => onEnterRoom({ roomCode, partnerName: partnerName || "Your Partner", partnerColor })}>
          {partnerJoined ? `Start reading with ${partnerName} →` : "Enter room →"}
        </PrimaryButton>

        {!partnerJoined && (
          <p style={{ textAlign: "center", color: "var(--ink-faint)", fontSize: "0.78rem", marginTop: "0.75rem" }}>
            You can also enter and wait inside the reader
          </p>
        )}
      </Card>
    </div>
  );
}

// ─── HomePage orchestrator ────────────────────────────────────────────────────
export default function HomePage() {
  useEffect(() => { injectStyles(); }, []);

  const { navigate } = useApp();
  const [step, setStep]           = useState("welcome"); // welcome | name | upload | room
  const [userName, setUserName]   = useState("");
  const [userColor]               = useState(randomColor);
  const [book, setBook]           = useState(null);

  const handleEnterRoom = ({ roomCode, partnerName, partnerColor }) => {
    navigate("reader", {
      session: {
        userId:       randomId(),
        name:         userName,
        color:        userColor,
        roomId:       roomCode,
        partner:      { name: partnerName, color: partnerColor },
        book,
      },
    });
  };

  return (
    <>
      {step === "welcome" && <WelcomeStep onStartReading={() => setStep("name")} />}
      {step === "name"    && <NameStep    onNext={n => { setUserName(n); setStep("upload"); }} onBack={() => setStep("welcome")} />}
      {step === "upload"  && <UploadStep  userName={userName} onNext={b => { setBook(b); setStep("room"); }} onBack={() => setStep("name")} />}
      {step === "room"    && <RoomStep    userName={userName} userColor={userColor} book={book} onEnterRoom={handleEnterRoom} onBack={() => setStep("upload")} />}
    </>
  );
}