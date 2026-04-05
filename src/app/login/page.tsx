"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { setSession, verifyPin } from "@/lib/auth";
import { getEntryByEmail } from "@/lib/db";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(""); setLoading(true);
    try {
      const entry = await getEntryByEmail(email.trim().toLowerCase());
      if (!entry) { setError("No account found with that email. Try registering."); return; }
      if (!verifyPin(pin, entry.pinHash)) { setError("Incorrect PIN."); return; }
      setSession({ entryId: entry.id, entrantName: entry.entrantName, email: entry.email }, remember);
      router.push("/leaderboard");
    } catch { setError("Something went wrong. Please try again."); }
    finally { setLoading(false); }
  }

  async function handleRegister() {
    setError("");
    if (!name.trim()) { setError("Please enter your name."); return; }
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { setError("PIN must be exactly 4 digits."); return; }
    setLoading(true);
    try {
      const existing = await getEntryByEmail(email.trim().toLowerCase());
      if (existing) { setError("An account already exists for that email. Please log in."); return; }
      const res = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), name: name.trim(), pin })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Registration failed."); return; }
      setSession({ entryId: data.entryId, entrantName: name.trim(), email: email.trim().toLowerCase() }, remember);
      router.push("/leaderboard");
    } catch { setError("Something went wrong. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px", background: "var(--fairway-dark)" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(26,66,41,0.5) 0%, transparent 70%)" }} />
      <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 420 }}>

        {/* Header with logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <Image
              src="/federation-logo.png"
              alt="Federation Golf Majors"
              width={100}
              height={100}
              style={{ objectFit: "contain" }}
            />
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.9rem", color: "#f0faf4", fontWeight: 700, marginBottom: 6 }}>
            Fed Golf Majors
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", fontFamily: "'DM Mono', monospace" }}>
            2026 Season · Masters · PGA · US Open · British Open
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 32 }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: 4, marginBottom: 24 }}>
            {(["login", "register"] as const).map(tab => (
              <button key={tab} onClick={() => { setMode(tab); setError(""); }} style={{
                flex: 1, padding: "8px", borderRadius: 6, border: "none",
                background: mode === tab ? "var(--fairway-light)" : "transparent",
                color: mode === tab ? "#f0faf4" : "var(--text-muted)",
                fontFamily: "'DM Sans', sans-serif", fontWeight: 500, cursor: "pointer", fontSize: "0.9rem", transition: "all 0.15s"
              }}>
                {tab === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {mode === "register" && (
              <div>
                <label style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.8rem", marginBottom: 6, fontWeight: 500 }}>Full Name</label>
                <input className="input" placeholder="First and last name" value={name} onChange={e => setName(e.target.value)} />
              </div>
            )}
            <div>
              <label style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.8rem", marginBottom: 6, fontWeight: 500 }}>Email Address</label>
              <input className="input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.8rem", marginBottom: 6, fontWeight: 500 }}>4-Digit PIN</label>
              <input className="input" type="password" inputMode="numeric" maxLength={4} placeholder="••••"
                value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                style={{ letterSpacing: "0.3em", fontSize: "1.2rem" }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ accentColor: "var(--green-400)" }} />
              <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Remember me for 90 days</span>
            </label>
            {error && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", color: "#f87171", fontSize: "0.85rem" }}>
                {error}
              </div>
            )}
            <button className="btn-primary" style={{ padding: "12px", fontSize: "1rem", marginTop: 4 }}
              onClick={mode === "login" ? handleLogin : handleRegister}
              disabled={loading || !email || !pin}>
              {loading ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account & Continue"}
            </button>
          </div>
        </div>
        <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 20 }}>Questions? Contact your pool commissioner.</p>
      </div>
    </div>
  );
}