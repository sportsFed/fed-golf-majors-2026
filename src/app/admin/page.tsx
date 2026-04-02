"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/shared/Nav";
import { getSession, getAdminSession, setAdminSession } from "@/lib/auth";
import { ODDS_BONUSES } from "@/types";
import type { MajorId, FieldGolfer, OddsTier, AdminOverride, NameMapping, Major } from "@/types";

const MAJORS: { id: MajorId; name: string; short: string }[] = [
  { id: "masters", name: "The Masters", short: "Masters" },
  { id: "pga", name: "PGA Championship", short: "PGA Champ." },
  { id: "us-open", name: "U.S. Open", short: "U.S. Open" },
  { id: "british-open", name: "The Open Championship", short: "Open Champ." }
];

type AdminTab = "field" | "deadline" | "namematch" | "overrides" | "finalize" | "entries";

function autoAbbrev(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

export default function AdminPage() {
  const router = useRouter();
  const session = getSession();
  const [authed, setAuthed] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState<AdminTab>("field");
  const [activeMajor, setActiveMajor] = useState<MajorId>("masters");

  // Field
  const [fieldText, setFieldText] = useState("");
  const [parsedField, setParsedField] = useState<FieldGolfer[]>([]);
  const [fieldSaving, setFieldSaving] = useState(false);
  const [fieldMsg, setFieldMsg] = useState("");

  // Deadline
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineTime, setDeadlineTime] = useState("08:15");
  const [majorStatus, setMajorStatus] = useState<Major["status"]>("upcoming");
  const [sheetUrl, setSheetUrl] = useState("");
  const [deadlineSaving, setDeadlineSaving] = useState(false);
  const [deadlineMsg, setDeadlineMsg] = useState("");

  // Name match
  const [liveNames, setLiveNames] = useState<string[]>([]);
  const [fieldNames, setFieldNames] = useState<string[]>([]);
  const [mappings, setMappings] = useState<(NameMapping & { displayAs?: string })[]>([]);
  const [mapFrom, setMapFrom] = useState("");
  const [mapTo, setMapTo] = useState("");
  const [mapDisplay, setMapDisplay] = useState("");

  // Overrides
  const [overrides, setOverrides] = useState<AdminOverride[]>([]);
  const [ovGolfer, setOvGolfer] = useState("");
  const [ovStatus, setOvStatus] = useState<"CUT"|"WD"|"CUSTOM">("CUT");
  const [ovScore, setOvScore] = useState("");

  // Entries
  const [entries, setEntries] = useState<any[]>([]);
  const [resetEntryId, setResetEntryId] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");
  const [resetMsg, setResetMsg] = useState<Record<string, string>>({});

  // Snapshot
  const [snapshotMsg, setSnapshotMsg] = useState("");
  const [snapshotting, setSnapshotting] = useState(false);

  useEffect(() => {
    if (!session) { router.push("/login"); return; }
    if (getAdminSession()) setAuthed(true);
  }, []);

  useEffect(() => { if (authed) loadTabData(); }, [authed, tab, activeMajor]);

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
        if (dl) { setDeadlineDate(dl.toISOString().split("T")[0]); setDeadlineTime(dl.toTimeString().slice(0,5)); }
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
      setLiveNames((await liveRes.json()).names ?? []);
      setFieldNames(((await fieldRes.json()).golfers ?? []).map((g: FieldGolfer) => g.displayName));
      setMappings((await mapRes.json()).mappings ?? []);
    }
    if (tab === "overrides") {
      const res = await fetch(`/api/admin/overrides?majorId=${activeMajor}`);
      setOverrides((await res.json()).overrides ?? []);
    }
    if (tab === "entries") {
      const res = await fetch("/api/admin/entries");
      setEntries((await res.json()).entries ?? []);
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
      const manualTier = parts[2]?.trim().toLowerCase() as OddsTier | undefined;
      let tier: OddsTier;
      if (manualTier && Object.keys(ODDS_BONUSES).includes(manualTier)) { tier = manualTier; }
      else if (!odds || isNaN(odds)) { tier = "field"; }
      else if (odds <= 999) { tier = "even-999"; }
      else if (odds <= 2499) { tier = "1000-2499"; }
      else if (odds <= 4999) { tier = "2500-4999"; }
      else { tier = "5000plus"; }
      return { id: name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""), displayName: name, odds: isNaN(odds!) ? undefined : odds, tier, majorId: activeMajor };
    }).filter(g => g.displayName);
    setParsedField(golfers);
  }

  async function saveField() {
    setFieldSaving(true); setFieldMsg("");
    const res = await fetch("/api/admin/field", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ majorId: activeMajor, golfers: parsedField }) });
    setFieldMsg(res.ok ? "✓ Field saved!" : "Error saving field.");
    setFieldSaving(false);
  }

  async function saveDeadline() {
    setDeadlineSaving(true); setDeadlineMsg("");
    const deadline = deadlineDate && deadlineTime ? new Date(`${deadlineDate}T${deadlineTime}:00-05:00`).toISOString() : undefined;
    const res = await fetch("/api/admin/major-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ majorId: activeMajor, pickDeadline: deadline, status: majorStatus, sheetCsvUrl: sheetUrl }) });
    setDeadlineMsg(res.ok ? "✓ Settings saved!" : "Error saving.");
    setDeadlineSaving(false);
  }

  async function saveMapping() {
    if (!mapFrom || !mapTo) return;
    const displayAs = mapDisplay || autoAbbrev(mapFrom);
    await fetch("/api/admin/name-mappings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ majorId: activeMajor, adminName: mapFrom, espnName: mapTo, displayAs }) });
    setMapFrom(""); setMapTo(""); setMapDisplay("");
    loadTabData();
  }

  async function deleteMapping(adminName: string) {
    await fetch("/api/admin/name-mappings", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ majorId: activeMajor, adminName }) });
    loadTabData();
  }

  async function saveOverride() {
    if (!ovGolfer) return;
    await fetch("/api/admin/overrides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ majorId: activeMajor, golferName: ovGolfer, overrideStatus: ovStatus, customScore: ovStatus === "CUSTOM" ? parseFloat(ovScore) : undefined, setAt: new Date().toISOString() }) });
    setOvGolfer(""); setOvScore(""); loadTabData();
  }

  async function deleteOverride(golferName: string) {
    await fetch("/api/admin/overrides", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ majorId: activeMajor, golferName }) });
    loadTabData();
  }

  async function finalizeMajor() {
    if (!confirm(`Finalize ${MAJORS.find(m => m.id === activeMajor)?.name}? This locks all scores permanently.`)) return;
    const res = await fetch("/api/admin/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ majorId: activeMajor }) });
    const d = await res.json();
    alert(d.message ?? (res.ok ? "Major finalized!" : "Error finalizing."));
  }

  async function resetPin(entryId: string) {
    if (!newPin || !/^\d{4}$/.test(newPin)) { setResetMsg({ ...resetMsg, [entryId]: "PIN must be 4 digits." }); return; }
    const res = await fetch("/api/admin/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId, newPin }) });
    if (res.ok) {
      setResetMsg({ ...resetMsg, [entryId]: "✓ PIN updated!" });
      setResetEntryId(null); setNewPin("");
      loadTabData();
    } else { setResetMsg({ ...resetMsg, [entryId]: "Error updating PIN." }); }
  }

  async function takeSnapshot() {
    setSnapshotting(true); setSnapshotMsg("");
    const res = await fetch("/api/admin/snapshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ majorId: activeMajor }) });
    const d = await res.json();
    setSnapshotMsg(res.ok ? `✓ Snapshot saved — ${d.count} entries at ${new Date(d.timestamp).toLocaleTimeString()}` : `Error: ${d.error}`);
    setSnapshotting(false);
  }

  const TABS: { id: AdminTab; label: string }[] = [
    { id: "field", label: "Field Import" },
    { id: "deadline", label: "Settings & Deadline" },
    { id: "namematch", label: "Name Matching" },
    { id: "overrides", label: "Score Overrides" },
    { id: "finalize", label: "Finalize Major" },
    { id: "entries", label: "All Entries" }
  ];

  const S = { color: "var(--text-muted)", fontSize: "0.72rem", display: "block", marginBottom: 6, fontWeight: 600 as const };

  if (!authed) return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}>
      <Nav />
      <div style={{ maxWidth: 400, margin: "80px auto", padding: "0 20px" }}>
        <div className="card" style={{ padding: 32 }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", color: "#f0faf4", marginBottom: 20 }}>Admin Access</h2>
          <input className="input" type="password" placeholder="Admin PIN" value={adminPin}
            onChange={e => setAdminPin(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdminAuth()} style={{ marginBottom: 12 }} />
          {authError && <p style={{ color: "#f87171", fontSize: "0.82rem", marginBottom: 10 }}>{authError}</p>}
          <button className="btn-primary" style={{ width: "100%" }} onClick={handleAdminAuth}>Enter Admin</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}>
      <Nav />
      <div style={{ maxWidth: 1060, margin: "0 auto", padding: "32px 20px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.8rem", color: "#f0faf4", margin: 0 }}>⚙ Admin Panel</h1>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {MAJORS.map(m => (
              <button key={m.id} onClick={() => setActiveMajor(m.id)} style={{
                padding: "6px 14px", borderRadius: 20,
                border: `1px solid ${activeMajor === m.id ? "#facc15" : "var(--border)"}`,
                background: activeMajor === m.id ? "rgba(250,204,21,0.1)" : "transparent",
                color: activeMajor === m.id ? "#facc15" : "var(--text-muted)",
                fontSize: "0.8rem", cursor: "pointer", fontFamily: "'DM Sans', sans-serif"
              }}>{m.short}</button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 28, borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "9px 16px", background: "none", border: "none", whiteSpace: "nowrap",
              borderBottom: tab === t.id ? "2px solid var(--green-400)" : "2px solid transparent",
              color: tab === t.id ? "var(--green-400)" : "var(--text-muted)",
              fontFamily: "'DM Sans', sans-serif", fontSize: "0.85rem",
              fontWeight: tab === t.id ? 600 : 400, cursor: "pointer", marginBottom: -1
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── FIELD IMPORT ── */}
        {tab === "field" && (
          <div>
            <h2 style={{ color: "#f0faf4", fontSize: "1.1rem", marginBottom: 8 }}>Field Import — {MAJORS.find(m => m.id === activeMajor)?.name}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: 16 }}>
              One golfer per line: <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 6px", borderRadius: 3 }}>Name [tab] odds</code> — e.g. <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 6px", borderRadius: 3 }}>Scottie Scheffler	350</code><br/>
              Golfers without odds go to the Field tier automatically.
            </p>
            <textarea className="input" rows={12} placeholder={"Scottie Scheffler\t350\nRory McIlroy\t800\nJon Rahm\t1400\nSam Burns"}
              value={fieldText} onChange={e => setFieldText(e.target.value)} style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.82rem", marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn-secondary" onClick={parseFieldText}>Parse Field</button>
              {parsedField.length > 0 && <button className="btn-primary" onClick={saveField} disabled={fieldSaving}>{fieldSaving ? "Saving…" : `Save ${parsedField.length} golfers`}</button>}
              {fieldMsg && <span style={{ color: fieldMsg.includes("✓") ? "var(--green-400)" : "#f87171", fontSize: "0.85rem" }}>{fieldMsg}</span>}
            </div>
            {parsedField.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 6 }}>
                {parsedField.map((g, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(17,45,28,0.5)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 12px" }}>
                    <span style={{ color: "#f0faf4", fontSize: "0.83rem" }}>{g.displayName}</span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {g.odds && <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", fontFamily: "'DM Mono', monospace" }}>+{g.odds}</span>}
                      <select value={g.tier} onChange={e => { const next = [...parsedField]; next[i] = { ...g, tier: e.target.value as OddsTier }; setParsedField(next); }}
                        style={{ background: "rgba(0,0,0,0.4)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-secondary)", fontSize: "0.72rem", padding: "2px 4px" }}>
                        {Object.keys(ODDS_BONUSES).map(t => <option key={t} value={t}>{ODDS_BONUSES[t as OddsTier].label}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS & DEADLINE ── */}
        {tab === "deadline" && (
          <div style={{ maxWidth: 580 }}>
            <h2 style={{ color: "#f0faf4", fontSize: "1.1rem", marginBottom: 20 }}>Settings — {MAJORS.find(m => m.id === activeMajor)?.name}</h2>
            <div style={{ marginBottom: 20 }}>
              <label style={S}>Pick Deadline (Central Time)</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
                <input className="input" type="date" value={deadlineDate} onChange={e => setDeadlineDate(e.target.value)} />
                <input className="input" type="time" value={deadlineTime} onChange={e => setDeadlineTime(e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={S}>Major Status</label>
              <select className="input" value={majorStatus} onChange={e => setMajorStatus(e.target.value as Major["status"])}>
                <option value="upcoming">Upcoming (picks not open)</option>
                <option value="open">Open (picks accepted)</option>
                <option value="locked">Locked (picks closed)</option>
                <option value="active">Active (tournament in progress)</option>
                <option value="finalized">Finalized (scores locked)</option>
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={S}>Google Sheet CSV URL</label>
              <input className="input" placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?output=csv" value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} />
              <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 6 }}>File → Share → Publish to web → CSV → copy URL</p>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn-primary" onClick={saveDeadline} disabled={deadlineSaving}>{deadlineSaving ? "Saving…" : "Save Settings"}</button>
              {deadlineMsg && <span style={{ color: deadlineMsg.includes("✓") ? "var(--green-400)" : "#f87171", fontSize: "0.85rem" }}>{deadlineMsg}</span>}
            </div>

            {/* Manual snapshot */}
            <div style={{ marginTop: 32, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
              <label style={S}>Manual Score Snapshot</label>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: 12 }}>
                Force an immediate score snapshot for this major. Happens automatically every 30 min during active tournaments.
              </p>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button className="btn-secondary" onClick={takeSnapshot} disabled={snapshotting}>{snapshotting ? "Taking snapshot…" : "📸 Take Snapshot Now"}</button>
                {snapshotMsg && <span style={{ color: snapshotMsg.includes("✓") ? "var(--green-400)" : "#f87171", fontSize: "0.82rem" }}>{snapshotMsg}</span>}
              </div>
            </div>
          </div>
        )}

        {/* ── NAME MATCHING ── */}
        {tab === "namematch" && (
          <div>
            <h2 style={{ color: "#f0faf4", fontSize: "1.1rem", marginBottom: 8 }}>Name Matching — {MAJORS.find(m => m.id === activeMajor)?.name}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: 20 }}>
              Map your field names to ESPN's exact spelling. Also set the <strong style={{ color: "#f0faf4" }}>Display As</strong> abbreviation used in tight spaces on the leaderboard (e.g. "S. Scheffler"). Auto-suggested from the first name initial.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px auto", gap: 10, marginBottom: 20, alignItems: "end" }}>
              <div>
                <label style={S}>Your Field Name</label>
                <select className="input" value={mapFrom} onChange={e => { setMapFrom(e.target.value); setMapDisplay(autoAbbrev(e.target.value)); }}>
                  <option value="">Select…</option>
                  {fieldNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label style={S}>ESPN Name</label>
                <select className="input" value={mapTo} onChange={e => setMapTo(e.target.value)}>
                  <option value="">Select…</option>
                  {liveNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label style={S}>Display As</label>
                <input className="input" placeholder="S. Scheffler" value={mapDisplay} onChange={e => setMapDisplay(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={saveMapping} disabled={!mapFrom || !mapTo} style={{ padding: "10px 18px" }}>Add</button>
            </div>
            {mappings.length === 0
              ? <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No mappings yet for this major.</p>
              : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {mappings.map((m, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr 120px auto", gap: 12, alignItems: "center", background: "rgba(17,45,28,0.5)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
                      <span style={{ color: "#f0faf4", fontSize: "0.85rem" }}>{m.adminName}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>→</span>
                      <span style={{ color: "var(--green-400)", fontSize: "0.85rem" }}>{m.espnName}</span>
                      <span style={{ color: "#facc15", fontSize: "0.82rem", fontFamily: "'DM Mono', monospace" }}>{(m as any).displayAs ?? autoAbbrev(m.adminName)}</span>
                      <button onClick={() => deleteMapping(m.adminName)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "0.85rem" }}>Remove</button>
                    </div>
                  ))}
                </div>
            }
            {liveNames.length === 0 && (
              <div style={{ marginTop: 20, background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 8, padding: "12px 16px", color: "#facc15", fontSize: "0.82rem" }}>
                ⚠️ No live sheet data yet — name list populates once your Google Sheet has tournament data.
              </div>
            )}
          </div>
        )}

        {/* ── OVERRIDES ── */}
        {tab === "overrides" && (
          <div>
            <h2 style={{ color: "#f0faf4", fontSize: "1.1rem", marginBottom: 8 }}>Score Overrides — {MAJORS.find(m => m.id === activeMajor)?.name}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: 20 }}>Force CUT, WD, or a custom score. Overrides take priority over the live sheet.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 140px auto", gap: 10, marginBottom: 20, alignItems: "end" }}>
              <div>
                <label style={S}>Golfer Name (ESPN exact name)</label>
                <input className="input" placeholder="Exact ESPN name" value={ovGolfer} onChange={e => setOvGolfer(e.target.value)} />
              </div>
              <div>
                <label style={S}>Status</label>
                <select className="input" value={ovStatus} onChange={e => setOvStatus(e.target.value as any)}>
                  <option value="CUT">CUT (+penalty)</option>
                  <option value="WD">WD (no penalty)</option>
                  <option value="CUSTOM">Custom score</option>
                </select>
              </div>
              {ovStatus === "CUSTOM" && (
                <div>
                  <label style={S}>Score (vs par)</label>
                  <input className="input" type="number" placeholder="-5" value={ovScore} onChange={e => setOvScore(e.target.value)} />
                </div>
              )}
              <button className="btn-primary" onClick={saveOverride} disabled={!ovGolfer} style={{ padding: "10px 18px" }}>Add Override</button>
            </div>
            {overrides.length === 0
              ? <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No overrides set.</p>
              : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {overrides.map((o, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, background: "rgba(17,45,28,0.5)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
                      <span style={{ color: "#f0faf4", fontSize: "0.88rem", flex: 1 }}>{o.golferName}</span>
                      <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: "0.75rem", fontFamily: "'DM Mono', monospace", background: o.overrideStatus === "CUT" ? "rgba(239,68,68,0.15)" : o.overrideStatus === "WD" ? "rgba(245,158,11,0.15)" : "rgba(77,189,136,0.15)", color: o.overrideStatus === "CUT" ? "#f87171" : o.overrideStatus === "WD" ? "#fbbf24" : "var(--green-400)" }}>
                        {o.overrideStatus}{o.overrideStatus === "CUSTOM" ? `: ${o.customScore}` : ""}
                      </span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>{new Date(o.setAt).toLocaleString()}</span>
                      <button onClick={() => deleteOverride(o.golferName)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer" }}>Remove</button>
                    </div>
                  ))}
                </div>
            }
          </div>
        )}

        {/* ── FINALIZE ── */}
        {tab === "finalize" && (
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ color: "#f0faf4", fontSize: "1.1rem", marginBottom: 8 }}>Finalize Major — {MAJORS.find(m => m.id === activeMajor)?.name}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: 16 }}>
              Click after the tournament ends. Locks all scores permanently. Your Google Sheet can then safely update to next week's data.
            </p>
            <ul style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: 24, paddingLeft: 20, lineHeight: 1.9 }}>
              <li>Scores frozen — sheet changes won't affect them</li>
              <li>Major marked complete on leaderboard</li>
              <li>Cumulative standings update</li>
              <li>This action cannot be easily undone — verify name mappings and overrides first</li>
            </ul>
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "14px 18px", marginBottom: 24 }}>
              <p style={{ color: "#f87171", fontSize: "0.85rem", margin: 0 }}>⚠️ Double-check all name mappings and overrides before finalizing.</p>
            </div>
            <button className="btn-gold" style={{ fontSize: "1rem", padding: "13px 28px" }} onClick={finalizeMajor}>
              🏁 Finalize {MAJORS.find(m => m.id === activeMajor)?.name}
            </button>
          </div>
        )}

        {/* ── ALL ENTRIES ── */}
        {tab === "entries" && (
          <div>
            <h2 style={{ color: "#f0faf4", fontSize: "1.1rem", marginBottom: 16 }}>All Entries ({entries.length})</h2>
            {entries.length === 0
              ? <p style={{ color: "var(--text-muted)" }}>No entries found. Check Firebase console to confirm data exists.</p>
              : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {entries.map((e) => (
                    <div key={e.id} style={{ background: "rgba(17,45,28,0.5)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 120px auto", gap: 12, alignItems: "center" }}>
                        <span style={{ color: "#f0faf4", fontWeight: 500, fontSize: "0.9rem" }}>{e.entrantName}</span>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{e.email}</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85rem", color: "#facc15", background: "rgba(250,204,21,0.08)", padding: "2px 8px", borderRadius: 6, textAlign: "center" }}>
                          {e.pin ?? "—"}
                        </span>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                          {Object.keys(e.majors ?? {}).length}/4 majors · {e.createdAt ? new Date(e.createdAt).toLocaleDateString() : ""}
                        </span>
                        <button
                          onClick={() => { setResetEntryId(resetEntryId === e.id ? null : e.id); setNewPin(""); }}
                          style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", cursor: "pointer", fontSize: "0.78rem", padding: "4px 10px", fontFamily: "'DM Sans', sans-serif" }}>
                          Reset PIN
                        </button>
                      </div>

                      {/* Inline PIN reset */}
                      {resetEntryId === e.id && (
                        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                          <label style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>New PIN:</label>
                          <input
                            className="input" type="text" inputMode="numeric" maxLength={4}
                            placeholder="4 digits" value={newPin}
                            onChange={e => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                            style={{ width: 100, textAlign: "center", letterSpacing: "0.2em", fontFamily: "'DM Mono', monospace" }}
                          />
                          <button className="btn-primary" style={{ padding: "8px 16px", fontSize: "0.85rem" }} onClick={() => resetPin(e.id)} disabled={newPin.length !== 4}>
                            Confirm Reset
                          </button>
                          <button className="btn-secondary" style={{ padding: "8px 12px", fontSize: "0.85rem" }} onClick={() => { setResetEntryId(null); setNewPin(""); }}>
                            Cancel
                          </button>
                          {resetMsg[e.id] && <span style={{ color: resetMsg[e.id].includes("✓") ? "var(--green-400)" : "#f87171", fontSize: "0.82rem" }}>{resetMsg[e.id]}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
            }
          </div>
        )}
      </div>
    </div>
  );
}