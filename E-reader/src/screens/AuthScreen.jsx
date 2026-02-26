// src/screens/AuthScreen.jsx
import { useState, useEffect } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { auth } from "../firebase/config";
import { useAuth } from "../firebase/useAuth";

const COLORS = ["#c2783a","#6b8f71","#7a6fa0","#b5804a","#4f7fa3","#a05a6b"];

// ─── Shared primitives (same design language as HomePage) ─────────────────────
function Field({ label, type = "text", value, onChange, placeholder, autoFocus }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <p style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: "0.4rem" }}>{label}</p>
      <input
        type={type} value={value} onChange={onChange} placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: "100%", padding: "0.75rem 1rem",
          background: "var(--paper)", borderRadius: 8,
          border: `1.5px solid ${focused ? "var(--amber)" : "var(--paper-deep)"}`,
          fontSize: "0.95rem", color: "var(--ink)",
          transition: "border-color 0.2s", outline: "none",
          fontFamily: "'Lora', serif",
        }}
      />
    </div>
  );
}

function PrimaryBtn({ children, onClick, loading, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      width: "100%", padding: "0.875rem",
      background: disabled || loading ? "var(--paper-deep)" : "linear-gradient(135deg, #c2783a, #e8a060)",
      color: disabled || loading ? "var(--ink-faint)" : "#fff",
      borderRadius: 12, fontWeight: 600, fontSize: "0.95rem",
      border: "none", cursor: disabled || loading ? "not-allowed" : "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
      boxShadow: disabled || loading ? "none" : "0 4px 20px rgba(194,120,58,0.35)",
      transition: "all 0.2s", fontFamily: "'Lora', serif",
    }}>
      {loading && <span style={{ width: 15, height: 15, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />}
      {children}
    </button>
  );
}

function Divider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "0.25rem 0" }}>
      <div style={{ flex: 1, height: 1, background: "var(--paper-deep)" }} />
      <span style={{ color: "var(--ink-faint)", fontSize: "0.75rem" }}>or</span>
      <div style={{ flex: 1, height: 1, background: "var(--paper-deep)" }} />
    </div>
  );
}

// ─── Google button ─────────────────────────────────────────────────────────────
function GoogleBtn({ onClick, loading }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick} disabled={loading}
      onMouseOver={() => setHovered(true)} onMouseOut={() => setHovered(false)}
      style={{
        width: "100%", padding: "0.8rem",
        background: hovered ? "var(--paper-mid)" : "#fff",
        border: "1.5px solid var(--paper-deep)", borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center", gap: "0.65rem",
        fontWeight: 600, fontSize: "0.9rem", color: "var(--ink)",
        cursor: loading ? "not-allowed" : "pointer",
        transition: "background 0.15s", fontFamily: "'Lora', serif",
        boxShadow: "0 1px 4px rgba(26,18,8,0.06)",
      }}>
      {/* Google "G" SVG */}
      <svg width="18" height="18" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.6 2.2 30.2 0 24 0 14.8 0 6.9 5.4 3 13.3l7.8 6C12.7 13 17.9 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17z"/>
        <path fill="#FBBC05" d="M10.8 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l8.3-6z"/>
        <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2 1.4-4.6 2.2-7.7 2.2-6.1 0-11.3-4.1-13.2-9.7l-8.3 6C6.9 42.6 14.8 48 24 48z"/>
      </svg>
      Continue with Google
    </button>
  );
}

// ─── AuthScreen ───────────────────────────────────────────────────────────────
export default function AuthScreen() {
  const { signInWithGoogle } = useAuth();

  const [mode, setMode]           = useState("signin"); // "signin" | "signup"
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [displayName, setDisplayName] = useState("");
  const [color, setColor]         = useState(COLORS[0]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  const handleGoogle = async () => {
    setLoading(true); setError("");
    try { await signInWithGoogle(); }
    catch { setError("Google sign-in failed. Please try again."); }
    finally { setLoading(false); }
  };

  const handleEmail = async () => {
    setError("");
    if (!email.trim() || !password.trim()) return setError("Please fill in all fields.");
    if (mode === "signup" && !displayName.trim()) return setError("Please enter your name.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");

    setLoading(true);
    try {
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: displayName.trim() });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      const msgs = {
        "auth/email-already-in-use":  "That email is already registered. Try signing in.",
        "auth/user-not-found":        "No account with that email. Try signing up.",
        "auth/wrong-password":        "Incorrect password.",
        "auth/invalid-email":         "Please enter a valid email address.",
        "auth/invalid-credential":    "Incorrect email or password.",
      };
      setError(msgs[err.code] || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = email.trim() && password.trim() && (mode === "signin" || displayName.trim());

  return (
    <div style={{
      minHeight: "100vh", background: "var(--paper)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "2rem", position: "relative", overflow: "hidden",
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Warm glow */}
      <div style={{ position: "fixed", top: "10%", left: "50%", transform: "translateX(-50%)", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(194,120,58,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: 400, position: "relative" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1 style={{ fontFamily: "'Lora', serif", fontSize: "2.2rem", fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>
            Page<em style={{ fontStyle: "italic", color: "var(--amber)" }}>Turn</em>
          </h1>
          <p style={{ fontFamily: "'Crimson Pro', serif", fontStyle: "italic", color: "var(--ink-faint)", fontSize: "0.95rem", marginTop: "0.3rem" }}>
            {mode === "signin" ? "Welcome back, reader." : "Create your reading account."}
          </p>
        </div>

        {/* Card */}
        <div style={{ background: "#fff", border: "1px solid var(--paper-deep)", borderRadius: 20, padding: "2rem", boxShadow: "0 8px 40px rgba(26,18,8,0.1)" }}>

          {/* Tab switcher */}
          <div style={{ display: "flex", background: "var(--paper)", borderRadius: 10, padding: 3, marginBottom: "1.5rem" }}>
            {["signin","signup"].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); }} style={{
                flex: 1, padding: "0.5rem",
                background: mode === m ? "#fff" : "transparent",
                border: "none", borderRadius: 8,
                fontWeight: mode === m ? 700 : 400,
                color: mode === m ? "var(--ink)" : "var(--ink-faint)",
                fontSize: "0.85rem", cursor: "pointer",
                boxShadow: mode === m ? "0 1px 4px rgba(26,18,8,0.08)" : "none",
                transition: "all 0.2s", fontFamily: "'Lora', serif",
              }}>{m === "signin" ? "Sign in" : "Sign up"}</button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            {/* Google */}
            <GoogleBtn onClick={handleGoogle} loading={loading} />
            <Divider />

            {/* Name (signup only) */}
            {mode === "signup" && (
              <div>
                <Field label="Your name" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Maya" autoFocus />
                {/* Color picker */}
                <div style={{ marginTop: "0.6rem" }}>
                  <p style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: "0.4rem" }}>Avatar colour</p>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setColor(c)} style={{
                        width: 24, height: 24, borderRadius: "50%", background: c,
                        border: "none", cursor: "pointer",
                        transform: color === c ? "scale(1.3)" : "scale(1)",
                        boxShadow: color === c ? `0 0 0 2px #fff, 0 0 0 3.5px ${c}` : "none",
                        transition: "all 0.15s",
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <Field label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus={mode === "signin"} />
            <Field label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
            />

            {/* Error */}
            {error && (
              <div style={{ background: "#fdf0ee", border: "1px solid #e8a090", borderRadius: 8, padding: "0.6rem 0.9rem", color: "#c0392b", fontSize: "0.8rem", display: "flex", gap: "0.4rem", alignItems: "center" }}>
                <span>⚠️</span> {error}
              </div>
            )}

            <PrimaryBtn onClick={handleEmail} loading={loading} disabled={!canSubmit}>
              {mode === "signin" ? "Sign in →" : "Create account →"}
            </PrimaryBtn>

          </div>
        </div>

        {/* Footer note */}
        <p style={{ textAlign: "center", color: "var(--ink-faint)", fontSize: "0.75rem", marginTop: "1.25rem", lineHeight: 1.6 }}>
          By continuing you agree to reading books with a friend ✦
        </p>
      </div>
    </div>
  );
}