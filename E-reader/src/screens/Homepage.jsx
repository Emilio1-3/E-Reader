// src/screens/Homepage.jsx
import { useState, useRef, useEffect } from "react";
import { useApp } from "../App";
import { createRoom, joinRoom, getRoom, uploadPdfChunked } from "../Db";

const randomId    = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const randomColor = () => ["#c2783a","#6b8f71","#7a6fa0","#b5804a","#4f7fa3","#a05a6b"][Math.floor(Math.random()*6)];

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Label({ children, style }) {
  return (
    <p style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: "0.45rem", fontFamily: "'Lora', serif", ...style }}>{children}</p>
  );
}

function Card({ children, style, className }) {
  return (
    <div className={className} style={{ background: "#fff", border: "1px solid var(--paper-deep)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", ...style }}>
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, loading, style }) {
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      padding: "0.85rem 2rem",
      background: disabled || loading ? "var(--paper-deep)" : "linear-gradient(135deg, #c2783a 0%, #e8a060 100%)",
      color: disabled || loading ? "var(--ink-faint)" : "#fff",
      borderRadius: "var(--radius-md)", fontSize: "0.95rem", fontWeight: 600, letterSpacing: "0.02em",
      boxShadow: disabled || loading ? "none" : "0 4px 20px rgba(194,120,58,0.35)",
      transition: "var(--transition)", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
      cursor: disabled || loading ? "not-allowed" : "pointer", width: "100%", border: "none", ...style,
    }}>
      {loading && <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />}
      {children}
    </button>
  );
}

function GhostButton({ children, onClick, style }) {
  return (
    <button onClick={onClick} style={{
      padding: "0.75rem 1.5rem", border: "1.5px solid var(--paper-deep)",
      borderRadius: "var(--radius-md)", color: "var(--ink-soft)", fontSize: "0.9rem", fontWeight: 500,
      transition: "var(--transition)", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
      width: "100%", background: "none", ...style,
    }}
    onMouseOver={e => { e.currentTarget.style.borderColor = "var(--amber)"; e.currentTarget.style.color = "var(--amber)"; }}
    onMouseOut={e => { e.currentTarget.style.borderColor = "var(--paper-deep)"; e.currentTarget.style.color = "var(--ink-soft)"; }}>
      {children}
    </button>
  );
}

function StyledInput({ value, onChange, placeholder, onKeyDown, autoFocus, style, type = "text" }) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      onKeyDown={onKeyDown} autoFocus={autoFocus}
      style={{ width: "100%", padding: "0.75rem 1rem", background: "var(--paper)", border: "1.5px solid var(--paper-deep)", borderRadius: "var(--radius-sm)", fontSize: "0.95rem", color: "var(--ink)", transition: "var(--transition)", outline: "none", ...style }}
      onFocus={e => e.target.style.borderColor = "var(--amber)"}
      onBlur={e => e.target.style.borderColor = "var(--paper-deep)"}
    />
  );
}

function StepDots({ current, total = 3 }) {
  return (
    <div style={{ display: "flex", gap: "0.35rem", marginBottom: "2rem" }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ height: 3, flex: 1, borderRadius: 3, background: i < current ? "var(--amber)" : "var(--paper-deep)", transition: "background 0.3s" }} />
      ))}
    </div>
  );
}

// ─── Welcome screen ───────────────────────────────────────────────────────────
function WelcomeStep({ onStartReading, onJoinRoom, pendingRoomCode, user, profile, onNavigateProfile }) {
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
      {/* Floating books */}
      {books.map((b, i) => (
        <div key={i} style={{ position: "fixed", top: b.top, left: b.left, right: b.right, width: b.w, height: b.h, background: b.color, borderRadius: "2px 4px 4px 2px", opacity: 0.18, transform: `rotate(${b.rot})`, animation: `floatY ${5 + i * 0.7}s ${b.delay} ease-in-out infinite`, zIndex: 0 }}>
          <div style={{ position: "absolute", left: 4, top: 0, bottom: 0, width: 3, background: "rgba(0,0,0,0.12)" }} />
        </div>
      ))}

      {/* Profile button top-right */}
      <button onClick={onNavigateProfile} style={{
        position: "fixed", top: 20, right: 20, zIndex: 10,
        display: "flex", alignItems: "center", gap: "0.5rem",
        background: "#fff", border: "1px solid var(--paper-deep)",
        borderRadius: 100, padding: "0.4rem 0.9rem 0.4rem 0.5rem",
        boxShadow: "var(--shadow-sm)", cursor: "pointer",
        transition: "var(--transition)",
      }}
        onMouseOver={e => e.currentTarget.style.boxShadow = "var(--shadow-md)"}
        onMouseOut={e => e.currentTarget.style.boxShadow = "var(--shadow-sm)"}
      >
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: profile?.color || "#c2783a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.75rem", color: "#fff" }}>
          {(profile?.displayName || user?.displayName || "?")[0]?.toUpperCase()}
        </div>
        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--ink-soft)" }}>{profile?.displayName || user?.displayName || "Profile"}</span>
      </button>

      <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 560 }}>
        <div className="fade-up" style={{ marginBottom: "2rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem", color: "var(--amber)", fontSize: "0.75rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>
            <span style={{ width: 40, height: 1, background: "var(--amber)", display: "inline-block", opacity: 0.6 }} />
            A place for shared stories
            <span style={{ width: 40, height: 1, background: "var(--amber)", display: "inline-block", opacity: 0.6 }} />
          </div>
        </div>

        <h1 className="fade-up-1" style={{ fontFamily: "'Lora', serif", fontSize: "clamp(3.2rem, 8vw, 5.5rem)", fontWeight: 700, lineHeight: 1.05, color: "var(--ink)", letterSpacing: "-0.02em", marginBottom: "1.5rem" }}>
          Page<em style={{ fontStyle: "italic", color: "var(--amber)" }}>Turn</em>
        </h1>

        <p className="fade-up-2" style={{ fontFamily: "'Crimson Pro', serif", fontSize: "clamp(1.1rem, 2.5vw, 1.35rem)", color: "var(--ink-soft)", lineHeight: 1.7, marginBottom: "2.5rem", fontStyle: "italic", maxWidth: 400, margin: "0 auto 2.5rem" }}>
          Upload a book, invite a friend,<br />and read together — live.
        </p>

        {pendingRoomCode ? (
          // Auto-prompt to join when coming from link
          <div className="fade-up-3" style={{ maxWidth: 320, margin: "0 auto" }}>
            <div style={{ background: "rgba(194,120,58,0.1)", border: "1px solid rgba(194,120,58,0.3)", borderRadius: 12, padding: "1rem", marginBottom: "1rem" }}>
              <p style={{ fontWeight: 700, color: "var(--amber)", fontSize: "0.9rem", marginBottom: "0.25rem" }}>📖 You were invited!</p>
              <p style={{ fontSize: "0.82rem", color: "var(--ink-soft)" }}>Room code: <strong>{pendingRoomCode}</strong></p>
            </div>
            <PrimaryButton onClick={() => onJoinRoom(pendingRoomCode)}>
              Join this Room →
            </PrimaryButton>
            <div style={{ marginTop: "0.75rem" }}>
              <GhostButton onClick={onStartReading}>Or start a new room</GhostButton>
            </div>
          </div>
        ) : (
          <div className="fade-up-3" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", maxWidth: 300, margin: "0 auto" }}>
            <PrimaryButton onClick={onStartReading} style={{ fontSize: "1.05rem", padding: "1rem 2.5rem" }}>
              <span>Start a New Room</span>
              <span style={{ fontSize: "1.1rem" }}>→</span>
            </PrimaryButton>
            <GhostButton onClick={() => onJoinRoom(null)}>
              Join with a Room Code
            </GhostButton>
            <p style={{ color: "var(--ink-faint)", fontSize: "0.8rem", lineHeight: 1.5 }}>
              No setup needed · Just you and one friend
            </p>
          </div>
        )}

        <div className="fade-up-4" style={{ marginTop: "4rem", display: "flex", justifyContent: "center", gap: "0.5rem", color: "var(--paper-deep)" }}>
          {["◆","◇","◆"].map((s,i) => <span key={i} style={{ fontSize: "0.6rem" }}>{s}</span>)}
        </div>
      </div>
    </div>
  );
}

// ─── Join by code screen ──────────────────────────────────────────────────────
function JoinStep({ prefillCode, onJoin, onBack, loading, error }) {
  const [code, setCode] = useState(prefillCode || "");

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", background: "var(--paper)" }}>
      <Card className="pop-in" style={{ width: "100%", maxWidth: 420, padding: "2.5rem" }}>
        <button onClick={onBack} style={{ color: "var(--ink-faint)", fontSize: "0.82rem", marginBottom: "1.75rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
          onMouseOver={e => e.currentTarget.style.color = "var(--amber)"}
          onMouseOut={e => e.currentTarget.style.color = "var(--ink-faint)"}
        >← Back</button>

        <Label>Join a Room</Label>
        <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.65rem", fontWeight: 700, color: "var(--ink)", marginBottom: "0.5rem" }}>Enter room code</h2>
        <p style={{ fontFamily: "'Crimson Pro', serif", color: "var(--ink-faint)", fontSize: "1rem", marginBottom: "1.75rem", fontStyle: "italic" }}>
          Your friend should have shared a 6-character code with you.
        </p>

        <StyledInput
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="e.g. AB12CD"
          autoFocus
          onKeyDown={e => e.key === "Enter" && code.length === 6 && onJoin(code)}
          style={{ letterSpacing: "0.2em", fontSize: "1.3rem", fontWeight: 700, textAlign: "center" }}
        />

        {error && (
          <div style={{ marginTop: "0.75rem", background: "#fdf0ee", border: "1px solid #e8a090", borderRadius: 8, padding: "0.6rem 0.9rem", color: "#c0392b", fontSize: "0.82rem" }}>
            ⚠️ {error}
          </div>
        )}

        <PrimaryButton
          onClick={() => onJoin(code)}
          disabled={code.length < 4}
          loading={loading}
          style={{ marginTop: "1.25rem" }}
        >
          Join Room →
        </PrimaryButton>
      </Card>
    </div>
  );
}

// ─── Upload screen ────────────────────────────────────────────────────────────
function UploadStep({ onNext, onBack }) {
  const [dragging, setDragging] = useState(false);
  const [book, setBook]         = useState(null); // { title, file }
  const [error, setError]       = useState("");
  const fileRef                 = useRef();

  const handleFile = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a PDF file."); return;
    }
    setError("");
    const title = file.name.replace(/\.pdf$/i, "");
    setBook({ title, file });
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", background: "var(--paper)" }}>
      <Card className="pop-in" style={{ width: "100%", maxWidth: 460, padding: "2.5rem" }}>
        <button onClick={onBack} style={{ color: "var(--ink-faint)", fontSize: "0.82rem", marginBottom: "1.75rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
          onMouseOver={e => e.currentTarget.style.color = "var(--amber)"}
          onMouseOut={e => e.currentTarget.style.color = "var(--ink-faint)"}
        >← Back</button>

        <StepDots current={1} />
        <Label>Step 1 of 2</Label>
        <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.65rem", fontWeight: 700, color: "var(--ink)", marginBottom: "0.5rem" }}>Upload your book</h2>
        <p style={{ fontFamily: "'Crimson Pro', serif", color: "var(--ink-faint)", fontSize: "1rem", marginBottom: "1.75rem", fontStyle: "italic" }}>
          Upload any PDF — renders exactly as-is. No size limit.
        </p>

        <div
          onClick={() => !book && fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
          style={{
            border: `2px dashed ${dragging ? "var(--amber)" : book ? "var(--sage)" : "var(--paper-deep)"}`,
            borderRadius: "var(--radius-md)", padding: "2.5rem 1.5rem",
            textAlign: "center", cursor: book ? "default" : "pointer",
            background: dragging ? "rgba(194,120,58,0.04)" : book ? "rgba(107,143,113,0.04)" : "var(--paper)",
            transition: "var(--transition)", marginBottom: "1.25rem",
          }}>
          <input ref={fileRef} type="file" accept=".pdf" onChange={e => handleFile(e.target.files[0])} style={{ display: "none" }} />
          {book ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ fontSize: "1.8rem" }}>📗</div>
              <p style={{ fontWeight: 700, color: "var(--ink)", fontSize: "1rem" }}>{book.title}</p>
              <p style={{ color: "var(--ink-faint)", fontSize: "0.78rem" }}>{(book.file.size / 1024 / 1024).toFixed(1)} MB</p>
              <p style={{ color: "var(--sage)", fontSize: "0.8rem" }}>✓ Ready to upload</p>
              <button onClick={e => { e.stopPropagation(); setBook(null); }} style={{ marginTop: "0.25rem", color: "var(--ink-faint)", fontSize: "0.75rem", textDecoration: "underline", cursor: "pointer", background: "none", border: "none" }}>
                Choose a different file
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ fontSize: "2rem", opacity: 0.5 }}>📁</div>
              <p style={{ fontWeight: 600, color: "var(--ink-soft)", fontSize: "0.95rem" }}>Drop your PDF here</p>
              <p style={{ color: "var(--ink-faint)", fontSize: "0.8rem" }}>or click to browse · any size</p>
            </div>
          )}
        </div>

        {error && (
          <div style={{ background: "#fdf0ee", border: "1px solid #e8a090", borderRadius: 8, padding: "0.6rem 0.9rem", color: "#c0392b", fontSize: "0.82rem", marginBottom: "1rem" }}>
            ⚠️ {error}
          </div>
        )}

        <PrimaryButton onClick={() => onNext(book)} disabled={!book}>
          Continue →
        </PrimaryButton>
      </Card>
    </div>
  );
}

// ─── Share room code screen ───────────────────────────────────────────────────
function ShareStep({ roomId, onEnterReader, onBack }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", background: "var(--paper)" }}>
      <Card className="pop-in" style={{ width: "100%", maxWidth: 420, padding: "2.5rem" }}>
        <button onClick={onBack} style={{ color: "var(--ink-faint)", fontSize: "0.82rem", marginBottom: "1.75rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
          onMouseOver={e => e.currentTarget.style.color = "var(--amber)"}
          onMouseOut={e => e.currentTarget.style.color = "var(--ink-faint)"}
        >← Back</button>

        <StepDots current={2} />
        <Label>Step 2 of 2</Label>
        <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.65rem", fontWeight: 700, color: "var(--ink)", marginBottom: "0.5rem" }}>Invite your friend</h2>
        <p style={{ fontFamily: "'Crimson Pro', serif", color: "var(--ink-faint)", fontSize: "1rem", marginBottom: "1.75rem", fontStyle: "italic" }}>
          Share the link or room code below.
        </p>

        {/* Room code big display */}
        <div style={{ background: "var(--paper)", border: "1.5px solid var(--paper-deep)", borderRadius: "var(--radius-md)", padding: "1.25rem", textAlign: "center", marginBottom: "1rem" }}>
          <p style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: "0.5rem" }}>Room Code</p>
          <p style={{ fontFamily: "'Lora', serif", fontSize: "2.5rem", fontWeight: 700, letterSpacing: "0.25em", color: "var(--amber)" }}>{roomId}</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.5rem" }}>
          <button onClick={copyLink} style={{
            padding: "0.7rem 1rem", border: "1.5px solid var(--paper-deep)", borderRadius: "var(--radius-sm)",
            background: "var(--paper)", color: "var(--ink-soft)", fontSize: "0.85rem", cursor: "pointer",
            display: "flex", alignItems: "center", gap: "0.5rem", transition: "var(--transition)",
          }}
            onMouseOver={e => e.currentTarget.style.borderColor = "var(--amber)"}
            onMouseOut={e => e.currentTarget.style.borderColor = "var(--paper-deep)"}
          >
            <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🔗 {shareUrl}</span>
            <span style={{ color: copied ? "var(--sage)" : "var(--amber)", fontWeight: 700, fontSize: "0.78rem", flexShrink: 0 }}>
              {copied ? "Copied!" : "Copy"}
            </span>
          </button>

          <button onClick={copyCode} style={{
            padding: "0.6rem 1rem", border: "1.5px solid var(--paper-deep)", borderRadius: "var(--radius-sm)",
            background: "var(--paper)", color: "var(--ink-faint)", fontSize: "0.8rem", cursor: "pointer",
            transition: "var(--transition)",
          }}
            onMouseOver={e => e.currentTarget.style.borderColor = "var(--amber)"}
            onMouseOut={e => e.currentTarget.style.borderColor = "var(--paper-deep)"}
          >
            Or copy just the code: <strong style={{ color: "var(--ink)" }}>{roomId}</strong>
          </button>
        </div>

        <PrimaryButton onClick={onEnterReader}>
          Start Reading →
        </PrimaryButton>
      </Card>
    </div>
  );
}

// ─── Main HomePage ────────────────────────────────────────────────────────────
export default function HomePage({ pendingRoomCode }) {
  const { navigate, user, profile } = useApp();
  const [step,       setStep]       = useState(pendingRoomCode ? "join" : "welcome");
  const [book,       setBook]       = useState(null);
  const [roomId,     setRoomId]     = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [uploadPct,  setUploadPct]  = useState(0);
  const [joinError,  setJoinError]  = useState("");

  // ── Upload PDF as chunks into Firestore, then create room ──
  const handleBookUploaded = async (uploadedBook) => {
    setBook(uploadedBook);
    setLoading(true);
    setUploadPct(0);
    try {
      const newRoomId = randomId();

      // 1. Split PDF into ~600KB base64 chunks → write each as a Firestore doc
      const totalChunks = await uploadPdfChunked(
        uploadedBook.file,
        newRoomId,
        setUploadPct
      );

      // 2. Create room doc — just stores metadata + chunk count, no PDF data
      await createRoom({
        roomId:       newRoomId,
        hostId:       user.uid,
        hostName:     profile?.displayName || user.displayName || "Reader",
        bookTitle:    uploadedBook.title,
        totalChunks,
      });

      setBook(b => ({ ...b, totalChunks, roomId: newRoomId }));
      setRoomId(newRoomId);
      setStep("share");
    } catch (err) {
      console.error("Failed to create room:", err);
      alert(`Failed to create room: ${err.message}`);
    } finally {
      setLoading(false);
      setUploadPct(0);
    }
  };

  // ── Enter reader as host ──
  const handleEnterReader = () => {
    navigate("reader", {
      session: {
        roomId,
        hostId: user.uid,
        partner: { name: "Waiting…", color: randomColor(), userId: "pending" },
        book: { title: book.title, totalChunks: book.totalChunks },
      },
    });
  };

  // ── Join a room by code ──
  const handleJoinRoom = async (code) => {
    if (!code) return;
    setLoading(true);
    setJoinError("");
    try {
      const roomData = await joinRoom({
        roomId:   code,
        userId:   user.uid,
        userName: profile?.displayName || user.displayName || "Reader",
      });

      if (!roomData.totalChunks) {
        setJoinError("This room has no book loaded yet.");
        setLoading(false);
        return;
      }

      navigate("reader", {
        session: {
          roomId: code,
          hostId: roomData.hostId,
          partner: {
            name:   roomData.hostName || "Host",
            color:  randomColor(),
            userId: roomData.hostId,
          },
          book: {
            title:       roomData.bookTitle,
            totalChunks: roomData.totalChunks,
          },
        },
      });
    } catch (err) {
      console.error("Join failed:", err);
      setJoinError("Room not found. Please check the code and try again.");
      setLoading(false);
    }
  };

  // Show upload progress overlay
  if (loading && step === "upload") return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)", padding: "2rem" }}>
      <div style={{ background: "#fff", border: "1px solid var(--paper-deep)", borderRadius: 20, padding: "2.5rem", width: "100%", maxWidth: 400, textAlign: "center", boxShadow: "var(--shadow-md)" }}>
        <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>📤</div>
        <h3 style={{ fontFamily: "'Lora', serif", fontSize: "1.2rem", fontWeight: 700, color: "var(--ink)", marginBottom: "0.5rem" }}>Uploading your book…</h3>
        <p style={{ color: "var(--ink-faint)", fontSize: "0.85rem", marginBottom: "1.5rem", fontStyle: "italic" }}>This may take a moment for large files.</p>
        <div style={{ height: 8, background: "var(--paper-deep)", borderRadius: 8, overflow: "hidden", marginBottom: "0.5rem" }}>
          <div style={{ height: "100%", width: `${uploadPct}%`, background: "linear-gradient(90deg, var(--amber), var(--amber-glow))", borderRadius: 8, transition: "width 0.3s ease" }} />
        </div>
        <p style={{ color: "var(--amber)", fontSize: "0.85rem", fontWeight: 700 }}>{uploadPct}%</p>
      </div>
    </div>
  );

  if (step === "welcome") return (    <WelcomeStep
      onStartReading={() => setStep("upload")}
      onJoinRoom={(code) => {
        if (code) {
          handleJoinRoom(code);
        } else {
          setStep("join");
        }
      }}
      pendingRoomCode={pendingRoomCode}
      user={user}
      profile={profile}
      onNavigateProfile={() => navigate("profile")}
    />
  );

  if (step === "join") return (
    <JoinStep
      prefillCode={pendingRoomCode || ""}
      onJoin={handleJoinRoom}
      onBack={() => setStep("welcome")}
      loading={loading}
      error={joinError}
    />
  );

  if (step === "upload") return (
    <UploadStep
      onNext={handleBookUploaded}
      onBack={() => setStep("welcome")}
    />
  );

  if (step === "share") return (
    <ShareStep
      roomId={roomId}
      onEnterReader={handleEnterReader}
      onBack={() => setStep("upload")}
    />
  );

  return null;
}