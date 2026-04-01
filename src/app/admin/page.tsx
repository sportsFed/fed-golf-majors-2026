"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/shared/Nav";
import { getSession, getAdminSession, setAdminSession } from "@/lib/auth";
import { ODDS_BONUSES } from "@/types";
import type { MajorId, FieldGolfer, OddsTier, AdminOverride, NameMapping, Major } from "@/types";

const MAJORS: { id: MajorId; name: string; dates: string }[] = [
  { id: "masters", name: "The Masters", dates: "Apr 10–13, 2026" },
  { id: "pga", name: "PGA Championship", dates: "May 15–18, 2026" },
  { id: "us-open", name: "U.S. Open", dates: "Jun 12–15, 2026" },
  { id: "british-open", name: "The Open Championship", dates: "Jul 17–20, 2026" }
];

type AdminTab = "field" | "deadline" | "namematch" | "overrides" | "finalize" | "entries";

export default function AdminPage() {
  const router = useRouter();
  const session = getSession();
  const [authed, setAuthed] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState<AdminTab>("field");
  const [activeMajor, setActiveMajor] = useState<MajorId>("masters");

  // Field import state
  const [fieldText, setFieldText] = useState("");
  const [parsedField, setParsedField] = useState<FieldGolfer[]>([]);
  const [fieldSaving, setFieldSaving] = useState(false);
  const [fieldMsg, setFieldMsg] = useState("");

  // Deadline state
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineTime, setDeadlineTime] = useState("08:15");
  const [majorStatus, setMajorStatus] = useState<Major["status"]>("upcoming");
  const [sheetUrl, setSheetUrl] = useState("");
  const [deadlineSaving, setDeadlineSaving] = useState(false);
  const [deadlineMsg, setDeadlineMsg] = useState("");

  // Name match state
  const [liveNames, setLiveNames] = useState<string[]>([]);
  const [fieldNames, setFieldNames] = useState<string[]>([]);
  const [mappings, setMappings] = useState<NameMapping[]>([]);
  const [mapFrom, setMapFrom] = useState("");
  const [mapTo, setMapTo] = useState("");

  // Overrides state
  const [overrides, setOverrides] = useState<AdminOverride[]>([]);
  const [ovGolfer, setOvGolfer] = useState("");
  const [ovStatus, setOvStatus] = useState<"CUT"|"WD"|"CUSTOM">("CUT");
  const [ovScore, setOvScore] = useState("");

  // Entries state
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    if (!session) { router.push("/login"); return; }
    if (getAdminSession()) setAuthed(true);
  }, []);

  useEffect(() => {
    if (authed) loadTabData();
  }, [authed, tab, activeMajor]);

  async function loadTabData() {
    if (tab === "field") {
      const res = await fetch(`/api/admin/field?majorId=${activeMajor}`);
      const d = await res.json();
      if (d.golfers?.length) setParsedField(d.golfers);
    }
    if (tab === "deadline") {
      const res = await fetch(`/api/admin/major-settings?majorId=${activeMajor}`);
      const d = await res.json();
      if (d.major) {
        const dl = d.major.pickDeadline ? new Date(d.major.pickDeadline) : null;
        if (dl) {
          setDeadlineDate(dl.toISOString().split("T")[0]);
          setDeadlineTime(dl.toTimeString().slice(0,5));
        }
        setMajorStatus(d.major.status ?? "upcoming");
        setSheetUrl(d.major.sheetCsvUrl ?? "");
      }
    }
    if (tab === "namematch") {
      const [liveRes, fieldRes, mapRes] = await Promise.all([
        fetch(`/api/admin/live-names?majorId=${activeMajor}`),
        fetch(`/api/admin/field?majorId=${activeMajor}`),
        fetch(`/api/admin/name-mappings?majorId=${activeMajor}`)
      ]);
      const liveData = await liveRes.json();
      const fieldData = await fieldRes.json();
      const mapData = await mapRes.json();
      setLiveNames(liveData.names ?? []);
      setFieldNames((fieldData.golfers ?? []).map((g: FieldGolfer) => g.displayName));
      setMappings(mapData.mappings ?? []);
    }
    if (tab === "overrides") {
      const res = await fetch(`/api/admin/overrides?majorId=${activeMajor}`);
      const d = await res.json();
      setOverrides(d.overrides ?? []);
    }
    if (tab === "entries") {
      const res = await fetch("/api/admin/entries");
      const d = await res.json();
      setEntries(d.entries ?? []);
    }
  }

  function handleAdminAuth() {
    fetch("/api/auth/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: adminPin }) })
      .then(r => r.json()).then(d => {
        if (d.ok) { setAdminSession(); setAuthed(true); }
        else setAuthError("Incorrect admin PIN.");
      });
  }

  function parseFieldText() {
    const lines = fieldText.trim().split("\n").filter(l => l.trim());
    const golfers: FieldGolfer[] = lines.map(line => {
      const parts = line.trim().split(/\t|,/);
      const name = parts[0]?.trim() ?? "";
      const oddsRaw = parts[1]?.trim().replace(/[+$,\s]/g, "") ?? "";
      const odds = oddsRaw ? parseInt(oddsRaw) : undefined;
      const manualTier = (parts[2]?.trim().toLowerCase() as OddsTier) || undefined;

      let tier: OddsTier;
      if (manualTier && Object.keys(ODDS_BONUSES).includes(manualTier)) {
        tier = manualTier;
      } else if (!odds || isNaN(odds)) {
        tier = "field";
      } else if (odds <= 999) { tier = "even-999"; }
      else if (odds <= 2499) { tier = "1000-2499"; }
      else if (odds <= 4999) { tier = "2500-4999"; }
      else { tier = "5000plus"; }

      return {
        id: name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
        displayName: name, espnName: undefined,
        odds: isNaN(odds!) ? undefined : odds, tier, majorId: activeMajor
      };
    }).filter(g => g.displayName);
    setParsedField(golfers);
  }

  async function saveField() {
    setFieldSaving(true); setFieldMsg("");
    try {
      const res = await fetch("/api/admin/field", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ majorId: activeMajor, golfers: parsedField })
      });
      setFieldMsg(res.ok ? "✓ Field saved!" : "Error saving field.");
    } catch { setFieldMsg("Error saving field."); }
    finally { setFieldSaving(false); }
  }

  async function saveDeadline() {
    setDeadlineSaving(true); setDeadlineMsg("");
    const deadline = deadlineDate && deadlineTime ? new Date(`${deadlineDate}T${deadlineTime}:00-05:00`).toISOString() : undefined;
    try {
      const res = await fetch("/api/admin/major-settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ majorId: activeMajor, pickDeadline: deadline, status: majorStatus, sheetCsvUrl: sheetUrl })
      });
      setDeadlineMsg(res.ok ? "✓ Settings saved!" : "Error saving.");
    } catch { setDeadlineMsg("Error saving."); }
    finally { setDeadlineSaving(false); }
  }

  async function saveMapping() {
    if (!mapFrom || !mapTo) return;
    await fetch("/api/admin/name-mappings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ majorId: activeMajor, adminName: mapFrom, espnName: mapTo })
    });
    setMapFrom(""); setMapTo("");
    loadTabData();
  }

  async function deleteMapping(adminName: string) {
    await fetch("/api/admin/name-mappings", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ majorId: activeMajor, adminName })
    });
    loadTabData();
  }

  async function saveOverride() {
    if (!ovGolfer) return;
    await fetch("/api/admin/overrides", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ majorId: activeMajor, golferName: ovGolfer, overrideStatus: ovStatus, customScore: ovStatus === "CUSTOM" ? parseFloat(ovScore) : undefined, setAt: new Date().toISOString() })
    });
    setOvGolfer(""); setOvScore("");
    loadTabData();
  }

  async function deleteOverride(golferName: string) {
    await fetch("/api/admin/overrides", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ majorId: activeMajor, golferName })
    });
    loadTabData();
  }

  async function finalizeMajor() {
    if (!confirm(`Finalize scores for ${MAJORS.find(m => m.id === activeMajor)?.name}? This will lock in all scores permanently.`)) return;
    const res = await fetch("/api/admin/finalize", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ majorId: activeMajor })
    });
    const d = await res.json();
    alert(d.message ?? (res.ok ? "Major finalized!" : "Error finalizing."));
  }

  const TABS: { id: AdminTab; label: string }[] = [
    { id: "field", label: "Field Import" },
    { id: "deadline", label: "Settings & Deadline" },
    { id: "namematch", label: "Name Matching" },
    { id: "overrides", label: "Score Overrides" },
    { id: "finalize", label: "Finalize Major" },
    { id: "entries", label: "All Entries" }
  ];

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}>
        <Nav />
        <div style={{ maxWidth: 400, margin: "80px auto", padding: "0 20px" }}>
          <div className="card" style={{ padding: 32 }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", color: "#f0faf4", marginBottom: 20 }}>Admin Access</h2>
            <input className="input" type="password" placeholder="Admin PIN" value={adminPin}
              onChange={e => setAdminPin(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdminAuth()}
              style={{ marginBottom: 12 }} />
            {authError && <p style={{ color: "#f87171", fontSize: "0.82rem", marginBottom: 10 }}>{authError}</p>}
            <button className="btn-primary" style={{ width: "100%" }} onClick={handleAdminAuth}>Enter Admin</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}>
      <Nav />
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.8rem", color: "#f0faf4", margin: 0 }}>⚙ Admin Panel</h1>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {MAJORS.map(m => (
              <button key={m.id} onClick={() => setActiveMajor(m.id)} style={{
                padding: "6px 14px", borderRadius: 20, border: `1px solid ${activeMajor === m.id ? "#facc15" : "var(--border)"}`,
                background: activeMajor === m.id ? "rgba(250,204,21,0.1)" : "transparent",
                color: activeMajor === m.id ? "#facc15" : "var(--text-muted)",
                fontSize: "0.8rem", cursor: "pointer", fontFamily: "'DM Sans', sans-serif"
              }}>{m.name.replace("The ", "").replace("Championship", "Champ.")}</button>
            ))}
          </div>
        </div>

        {/* Tab nav */}
        <div style={{ display: "flex", gap: 2, marginBottom: 28, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "9px 16px", background: "none", border: "none",
              borderBottom: tab === t.id ? "2px solid var(--green-400)" : "2px solid transparent",
              color: tab === t.id ? "var(--green-400)" : "var(--text-muted)",
              fontFamily: "'DM Sans', sans-serif", fontSize: "0.85rem",
              fontWeight: tab === t.id ? 600 : 400, cursor: "pointer", marginBottom: -1, transition: "all 0.15s"
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── FIELD IMPORT ── */}
        {tab === "field" && (
          <div>
            <h2 style={{ color: "#f0faf4", fontSize: "1.1rem", marginBottom: 8 }}>Field Import — {MAJORS.find(m => m.id === activeMajor)?.name}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: 16 }}>
              Paste one golfer per line. Format: <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 5px", borderRadius: 3 }}>Golfer Name [tab or comma] odds</code><br/>
              Example: <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 5px", borderRadius: 3 }}>Scottie Scheffler{"\t"}+350</code><br/>
              Golfers without odds will be assigned to the "Field" tier. You can override individual tiers after parsing.
            </p>
            <textarea className="input" rows={12}
              placeholder={"Scottie Scheffler\t+350\nRory McIlroy\t+800\nJon Rahm\t+1400\nSam Burns\t(no odds — goes to Field tier)"}
              value={fieldText} onChange={e => setFieldText(e.target.value)}
              style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.82rem", marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <button className="btn-secondary" onClick={parseFieldText}>Parse Field</button>
              {parsedField.length > 0 && <button className="btn-primary" onClick={saveField} disabled={fieldSaving}>{fieldSaving ? "Saving…" : `Save ${parsedField.length} golfers`}</button>}
              {fieldMsg && <span style={{ color: fieldMsg.includes("✓") ? "var(--green-400)" : "#f87171", fontSize: "0.85rem", alignSelf: "center" }}>{fieldMsg}</span>}
            </div>

            {parsedField.length > 0 && (
              <div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                  Parsed — {parsedField.length} golfers
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 6 }}>
                  {parsedField.map((g, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(17,45,28,0.5)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 12px" }}>
                      <span style={{ color: "#f0faf4", fontSize: "0.83rem" }}>{g.displayName}</span>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {g.odds && <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", fontFamily: "'DM Mono', monospace" }}>+{g.odds}</span>}
                        <select value={g.tier} onChange={e => {
                          const next = [...parsedField]; next[i] = { ...g, tier: e.target.value as OddsTier }; setParsedField(next);
                        }} style={{ background: "rgba(0,0,0,0.4)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-secondary)", fontSize: "0.72rem", padding: "2px 4px" }}>
                          {Object.keys(ODDS_BONUSES).map(t => <option key={t} value={t}>{ODDS_BONUSES[t as OddsTier].label}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS & DEADLINE ── */}
        {tab === "deadline" && (
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ color: "#f0faf4", fontSize: "1.1rem", marginBottom: 20 }}>Settings — {MAJORS.find(m => m.id === activeMajor)?.name}</h2>

            <div style={{ marginBottom: 20 }}>
              <label style={{ color: "var(--text-secondary)", fontSize: "0.78rem", display: "block", marginBottom: 6, fontWeight: 600 }}>Pick Deadline (Central Time)</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
                <input className="input" type="date" value={deadlineDate} onChange={e => setDeadlineDate(e.target.value)} />
                <input className="input" type="time" value={deadlineTime} onChange={e => setDeadlineTime(e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ color: "var(--text-secondary)", fontSize: "0.78rem", display: "block", marginBottom: 6, fontWeight: 600 }}>Major Status</label>
              <select className="input" value={majorStatus} onChange={e => setMajorStatus(e.target.value as Major["status"])}>
                <option value="upcoming">Upcoming (picks not yet open)</option>
                <option value="open">Open (picks accepted)</option>
                <option value="locked">Locked (picks closed, tournament not started)</option>
                <option value="active">Active (tournament in progress)</option>
                <option value="finalized">Finalized (scores locked)</option>
              </select>
              <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 6 }}>
                Setting status to "Open" publishes the pick form. "Locked" closes submissions. The deadline time auto-locks picks regardless of status.
              </p>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ color: "var(--text-secondary)", fontSize: "0.78rem", display: "block", marginBottom: 6, fontWeight: 600 }}>Google Sheet CSV URL</label>
              <input className="input" placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?gid=…&output=csv" value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} />
              <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 6 }}>
                Paste your published CSV URL here. The app fetches this to pull live scores during the tournament.
              </p>
            </div>

            <button className="btn-primary" onClick={saveDeadline} disabled={deadlineSaving}>{deadlineSaving ? "Saving…" : "Save Settings"}</button>
            {deadlineMsg && <span style={{ color: deadlineMsg.includes("✓") ? "var(--green-400)" : "#f87171", fontSize: "0.85rem", marginLeft: 12 }}>{deadlineMsg}</span>}
          </div>
        )}

        {/* ── NAME MATCHING ── */}
        {tab === "namematch" && (
          <div>
            <h2 style={{ color: "#f0faf4", fontSize: "1.1rem", marginBottom: 8 }}>Name Matching — {MAJORS.find(m => m.id === activeMajor)?.name}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: 20 }}>
              When a golfer name in your field list doesn't exactly match ESPN's spelling, map them here.
              The app will automatically normalize accents and common variants — only add mappings for names that still don't match.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, marginBottom: 20, alignItems: "end" }}>
              <div>
                <label style={{ color: "var(--text-muted)", fontSize: "0.72rem", display: "block", marginBottom: 6 }}>Your Field Name</label>
                <select className="input" value={mapFrom} onChange={e => setMapFrom(e.target.value)}>
                  <option value="">Select…</option>
                  {fieldNames.filter(n => !mappings.some(m => m.adminName === n)).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color: "var(--text-muted)", fontSize: "0.72rem", display: "block", marginBottom: 6 }}>ESPN Name (from live sheet)</label>
                <select className="input" value={mapTo} onChange={e => setMapTo(e.target.value)}>
                  <option value="">Select…</option>
                  {liveNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button className="btn-primary" onClick={saveMapping} disabled={!mapFrom || !mapTo} style={{ padding: "10px 18px" }}>Add</button>
            </div>

            {mappings.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No manual mappings yet for this major.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {mappings.map((m, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, background: "rgba(17,45,28,0.5)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
                    <span style={{ color: "#f0faf4", fontSize: "0.88rem", flex: 1 }}>{m.adminName}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>→</span>
                    <span style={{ color: "var(--green-400)", fontSize: "0.88rem", flex: 1 }}>{m.espnName}</span>
                    <button onClick={() => deleteMapping(m.adminName)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "0.85rem" }}>Remove</button>
                  </div>
                ))}
              </div>
            )}

            {liveNames.length === 0 && (
              <div style={{ marginTop: 20, background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 8, padding: "12px 16px", color: "#facc15", fontSize: "0.82rem" }}>
                ⚠️ No live sheet data yet — the name list will populate once the tournament starts and your Google Sheet has data.
              </div>
            )}
          </div>
        )}

        {/* ── OVERRIDES ── */}
        {tab === "overrides" && (
          <div>
            <h2 style={{ color: "#f0faf4", fontSize: "1.1rem", marginBottom: 8 }}>Score Overrides — {MAJORS.find(m => m.id === activeMajor)?.name}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: 20 }}>
              Force a golfer to CUT or WD status, or set a custom score. Overrides take priority over the live sheet data.
              Use when the sheet has an error or a golfer's status isn't updating correctly.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 140px auto", gap: 10, marginBottom: 20, alignItems: "end" }}>
              <div>
                <label style={{ color: "var(--text-muted)", fontSize: "0.72rem", display: "block", marginBottom: 6 }}>Golfer Name (ESPN name)</label>
                <input className="input" placeholder="Exact name from live sheet" value={ovGolfer} onChange={e => setOvGolfer(e.target.value)} />
              </div>
              <div>
                <label style={{ color: "var(--text-muted)", fontSize: "0.72rem", display: "block", marginBottom: 6 }}>Status</label>
                <select className="input" value={ovStatus} onChange={e => setOvStatus(e.target.value as any)}>
                  <option value="CUT">CUT (+penalty)</option>
                  <option value="WD">WD (no penalty)</option>
                  <option value="CUSTOM">Custom score</option>
                </select>
              </div>
              {ovStatus === "CUSTOM" && (
                <div>
                  <label style={{ color: "var(--text-muted)", fontSize: "0.72rem", display: "block", marginBottom: 6 }}>Score (vs par)</label>
                  <input className="input" type="number" placeholder="-5" value={ovScore} onChange={e => setOvScore(e.target.value)} />
                </div>
              )}
              <button className="btn-primary" onClick={saveOverride} disabled={!ovGolfer} style={{ padding: "10px 18px" }}>Add Override</button>
            </div>

            {overrides.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No overrides set for this major.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {overrides.map((o, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, background: "rgba(17,45,28,0.5)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
                    <span style={{ color: "#f0faf4", fontSize: "0.88rem", flex: 1 }}>{o.golferName}</span>
                    <span style={{
                      padding: "2px 10px", borderRadius: 20, fontSize: "0.75rem", fontFamily: "'DM Mono', monospace",
                      background: o.overrideStatus === "CUT" ? "rgba(239,68,68,0.15)" : o.overrideStatus === "WD" ? "rgba(245,158,11,0.15)" : "rgba(77,189,136,0.15)",
                      color: o.overrideStatus === "CUT" ? "#f87171" : o.overrideStatus === "WD" ? "#fbbf24" : "var(--green-400)"
                    }}>{o.overrideStatus}{o.overrideStatus === "CUSTOM" ? `: ${o.customScore}` : ""}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>{new Date(o.setAt).toLocaleString()}</span>
                    <button onClick={() => deleteOverride(o.golferName)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "0.85rem" }}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── FINALIZE ── */}
        {tab === "finalize" && (
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ color: "#f0faf4", fontSize: "1.1rem", marginBottom: 8 }}>Finalize Major — {MAJORS.find(m => m.id === activeMajor)?.name}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: 20 }}>
              Click this after the tournament ends. The app will take one final snapshot of all scores from your Google Sheet,
              calculate every entrant's result with bonuses applied, and lock those scores permanently into the database.
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: 20 }}>
              After finalizing:
            </p>
            <ul style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: 28, paddingLeft: 20, lineHeight: 1.8 }}>
              <li>Scores for this major are frozen — sheet changes won't affect them</li>
              <li>The major is marked complete on the leaderboard</li>
              <li>Cumulative standings update to include this major</li>
              <li>Your sheet can safely move to the next tournament's data</li>
              <li>This action cannot be easily undone — double check overrides and name mappings before finalizing</li>
            </ul>
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "14px 18px", marginBottom: 24 }}>
              <p style={{ color: "#f87171", fontSize: "0.85rem", margin: 0 }}>
                ⚠️ Make sure all name mappings and overrides are set correctly before finalizing.
              </p>
            </div>
            <button className="btn-gold" style={{ fontSize: "1rem", padding: "13px 28px" }} onClick={finalizeMajor}>
              🏁 Finalize {MAJORS.find(m => m.id === activeMajor)?.name}
            </button>
          </div>
        )}

        {/* ── ENTRIES ── */}
        {tab === "entries" && (
          <div>
            <h2 style={{ color: "#f0faf4", fontSize: "1.1rem", marginBottom: 16 }}>All Entries ({entries.length})</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {entries.map((e, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, background: "rgba(17,45,28,0.5)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px" }}>
                  <span style={{ color: "#f0faf4", fontSize: "0.88rem", fontWeight: 500, flex: 1 }}>{e.entrantName}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", flex: 1 }}>{e.email}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontFamily: "'DM Mono', monospace" }}>
                    {Object.keys(e.majors ?? {}).length}/4 majors submitted
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>Joined {new Date(e.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
