// src/screens/ProfilePage.jsx
import { useState } from "react";
import { useApp } from "../App";
import { useAuth } from "../UseAuth";

const COLORS = ["#c2783a","#6b8f71","#7a6fa0","#b5804a","#4f7fa3","#a05a6b","#c2785a","#4a8fa0"];

function Label({ children }) {
  return <p style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: "0.4rem" }}>{children}</p>;
}

function Field({ label, value, onChange, placeholder, type = "text", disabled }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <Label>{label}</Label>
      <input
        type={type} value={value} onChange={onChange} placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: "100%", padding: "0.75rem 1rem",
          background: disabled ? "var(--paper-mid)" : "var(--paper)", borderRadius: 8,
          border: `1.5px solid ${focused ? "var(--amber)" : "var(--paper-deep)"}`,
          fontSize: "0.95rem", color: disabled ? "var(--ink-faint)" : "var(--ink)",
          transition: "border-color 0.2s", outline: "none",
          fontFamily: "'Lora', serif", cursor: disabled ? "not-allowed" : "text",
        }}
      />
    </div>
  );
}

export default function ProfilePage() {
  const { navigate, profile, user } = useApp();
  const { updateUserProfile, signOut } = useAuth();

  const [displayName, setDisplayName] = useState(profile?.displayName || user?.displayName || "");
  const [color,       setColor]       = useState(profile?.color || "#c2783a");
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [error,       setError]       = useState("");

  const handleSave = async () => {
    if (!displayName.trim()) return setError("Name cannot be empty.");
    setError(""); setSaving(true);
    try {
      await updateUserProfile({ displayName: displayName.trim(), color });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error(err);
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    // Auth state change in useAuth will redirect to AuthScreen via App.jsx
  };

  const initials = (displayName || "?")[0]?.toUpperCase();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", padding: "2rem", display: "flex", flexDirection: "column", alignItems: "center" }}>

      {/* Top nav */}
      <div style={{ width: "100%", maxWidth: 480, display: "flex", alignItems: "center", marginBottom: "2.5rem" }}>
        <button onClick={() => navigate("home")} style={{ color: "var(--ink-faint)", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.3rem", background: "none", border: "none", cursor: "pointer" }}
          onMouseOver={e => e.currentTarget.style.color = "var(--amber)"}
          onMouseOut={e => e.currentTarget.style.color = "var(--ink-faint)"}
        >← Back to Home</button>
        <div style={{ flex: 1 }} />
        <h1 style={{ fontFamily: "'Lora', serif", fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)" }}>
          Page<em style={{ fontStyle: "italic", color: "var(--amber)" }}>Turn</em>
        </h1>
      </div>

      <div style={{ width: "100%", maxWidth: 480 }}>

        {/* Avatar preview */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "2rem" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "2rem", color: "#fff", boxShadow: `0 0 0 4px #fff, 0 0 0 6px ${color}55, 0 8px 32px rgba(26,18,8,0.12)`, transition: "background 0.2s" }}>
            {initials}
          </div>
        </div>

        {/* Card */}
        <div style={{ background: "#fff", border: "1px solid var(--paper-deep)", borderRadius: 20, padding: "2rem", boxShadow: "0 8px 40px rgba(26,18,8,0.1)" }}>

          <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.4rem", fontWeight: 700, color: "var(--ink)", marginBottom: "1.5rem" }}>Your Profile</h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

            <Field
              label="Display name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. Maya"
            />

            <Field
              label="Email"
              value={user?.email || ""}
              disabled
              placeholder="your@email.com"
            />

            {/* Color picker */}
            <div>
              <Label>Avatar colour</Label>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)} style={{
                    width: 32, height: 32, borderRadius: "50%", background: c,
                    border: "none", cursor: "pointer",
                    transform: color === c ? "scale(1.25)" : "scale(1)",
                    boxShadow: color === c ? `0 0 0 3px #fff, 0 0 0 5px ${c}` : "0 1px 4px rgba(0,0,0,0.15)",
                    transition: "all 0.15s",
                  }} />
                ))}
              </div>
            </div>

            {error && (
              <div style={{ background: "#fdf0ee", border: "1px solid #e8a090", borderRadius: 8, padding: "0.6rem 0.9rem", color: "#c0392b", fontSize: "0.82rem" }}>
                ⚠️ {error}
              </div>
            )}

            <button onClick={handleSave} disabled={saving} style={{
              padding: "0.875rem",
              background: saved ? "var(--sage)" : saving ? "var(--paper-deep)" : "linear-gradient(135deg, #c2783a, #e8a060)",
              color: saving ? "var(--ink-faint)" : "#fff",
              borderRadius: 12, fontWeight: 600, fontSize: "0.95rem",
              border: "none", cursor: saving ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
              boxShadow: saved || saving ? "none" : "0 4px 20px rgba(194,120,58,0.35)",
              transition: "all 0.3s", fontFamily: "'Lora', serif",
            }}>
              {saving && <span style={{ width: 15, height: 15, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />}
              {saved ? "✓ Saved!" : saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Danger zone */}
        <div style={{ marginTop: "1.5rem", background: "#fff", border: "1px solid var(--paper-deep)", borderRadius: 16, padding: "1.5rem", boxShadow: "var(--shadow-sm)" }}>
          <h3 style={{ fontFamily: "'Lora', serif", fontSize: "0.95rem", fontWeight: 700, color: "var(--ink)", marginBottom: "0.75rem" }}>Account</h3>
          <p style={{ fontSize: "0.82rem", color: "var(--ink-faint)", marginBottom: "1rem" }}>
            Signed in as <strong style={{ color: "var(--ink-soft)" }}>{user?.email}</strong>
          </p>
          <button onClick={handleSignOut} style={{
            padding: "0.65rem 1.25rem", border: "1.5px solid #e0c0bc", borderRadius: 10,
            color: "#c0392b", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer",
            background: "#fdf8f7", transition: "all 0.15s", fontFamily: "'Lora', serif",
          }}
            onMouseOver={e => { e.currentTarget.style.background = "#fdf0ee"; e.currentTarget.style.borderColor = "#c0392b"; }}
            onMouseOut={e => { e.currentTarget.style.background = "#fdf8f7"; e.currentTarget.style.borderColor = "#e0c0bc"; }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}