"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/shared/Nav";
import { getSession } from "@/lib/auth";
import { ODDS_BONUSES } from "@/types";
import type { MajorId, FieldGolfer, OddsTier, Major } from "@/types";

const MAJORS: { id: MajorId; name: string; short: string; dates: string }[] = [
  { id: "masters", name: "The Masters", short: "Masters", dates: "Apr 10–13" },
  { id: "pga", name: "PGA Championship", short: "PGA", dates: "May 15–18" },
  { id: "us-open", name: "U.S. Open", short: "US Open", dates: "Jun 12–15" },
  { id: "british-open", name: "The Open Championship", short: "British Open", dates: "Jul 17–20" }
];

const TIER_COLORS: Record<OddsTier, string> = {
  "even-999": "#facc15", "1000-2499": "#86d8b0",
  "2500-4999": "#4dbd88", "5000plus": "#28a06a", "field": "#6b7280"
};

export default function PicksPage() {
  const router = useRouter();
  const session = getSession();
  const [activeMajor, setActiveMajor] = useState<MajorId>("masters");
  const [field, setField] = useState<FieldGolfer[]>([]);
  const [majorInfo, setMajorInfo] = useState<Major | null>(null);
  const [picks, setPicks] = useState<(FieldGolfer | null)[]>([null,null,null,null,null]);
  const [usedInOtherMajors, setUsedInOtherMajors] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!session) { router.push("/login"); return; }
    loadData(activeMajor);
  }, [activeMajor]);

  async function loadData(majorId: MajorId) {
    setLoading(true); setError(""); setActiveSlot(null);
    try {
      const [fieldRes, entryRes, majorRes] = await Promise.all([
        fetch(`/api/picks/field?majorId=${majorId}`),
        fetch(`/api/picks/my-picks?entryId=${session!.entryId}`),
        fetch(`/api/picks/major-info?majorId=${majorId}`)
      ]);
      const fieldData = await fieldRes.json();
      const entryData = await entryRes.json();
      const majorData = await majorRes.json();
      setField(fieldData.golfers ?? []);
      setMajorInfo(majorData.major ?? null);

      const myMajorPicks = entryData.majors?.[majorId]?.picks ?? [];
      const loadedPicks: (FieldGolfer | null)[] = [null,null,null,null,null];
      myMajorPicks.forEach((p: any, i: number) => {
        const g = (fieldData.golfers ?? []).find((g: FieldGolfer) => g.id === p.golferId);
        if (g) loadedPicks[i] = g;
      });
      setPicks(loadedPicks);
      setSaved(myMajorPicks.length === 5);

      const used: string[] = [];
      MAJORS.forEach(m => {
        if (m.id !== majorId) {
          (entryData.majors?.[m.id]?.picks ?? []).forEach((p: any) => used.push(p.golferId));
        }
      });
      setUsedInOtherMajors(used);

      const deadline = majorData.major?.pickDeadline;
      const status = majorData.major?.status;
      setLocked((deadline && new Date(deadline) < new Date()) || status === "locked" || status === "finalized");
    } catch { setError("Failed to load. Please refresh."); }
    finally { setLoading(false); }
  }

  const currentPickIds = picks.map(p => p?.id).filter(Boolean) as string[];

  function selectGolfer(golfer: FieldGolfer) {
    if (activeSlot === null || locked) return;
    if (usedInOtherMajors.includes(golfer.id)) return;
    const already = picks.findIndex(p => p?.id === golfer.id);
    if (already !== -1 && already !== activeSlot) return;
    const next = [...picks]; next[activeSlot] = golfer;
    setPicks(next); setActiveSlot(null); setSearch(""); setSaved(false);
  }

  function clearSlot(i: number) {
    const next = [...picks]; next[i] = null; setPicks(next); setSaved(false);
  }

  async function handleSubmit() {
    if (!picks.every(Boolean)) { setError("Please fill all 5 slots."); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/picks/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: session!.entryId, majorId: activeMajor,
          picks: picks.map((p, i) => ({ golferId: p!.id, golferName: p!.displayName, isTopPick: i === 0, tier: p!.tier }))
        })
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Submission failed."); return; }
      setSaved(true);
    } catch { setError("Submission failed."); }
    finally { setSaving(false); }
  }

  const topPick = picks[0];
  const filteredField = field.filter(g => !search || g.displayName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}>
      <Nav />
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "32px 20px" }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "2rem", color: "#f0faf4", marginBottom: 6 }}>My Picks</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: 28 }}>
          Select 5 golfers per major. <strong style={{ color: "#facc15" }}>Slot 1 = Top Pick</strong> — earns bigger bonus if they win. You cannot reuse a golfer across majors.
        </p>

        {/* Major tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 28, flexWrap: "wrap" }}>
          {MAJORS.map(m => (
            <button key={m.id} onClick={() => setActiveMajor(m.id)} style={{
              padding: "7px 16px", borderRadius: 20,
              border: `1px solid ${activeMajor === m.id ? "var(--green-400)" : "var(--border)"}`,
              background: activeMajor === m.id ? "rgba(77,189,136,0.12)" : "transparent",
              color: activeMajor === m.id ? "var(--green-400)" : "var(--text-muted)",
              fontFamily: "'DM Sans', sans-serif", fontSize: "0.83rem",
              fontWeight: activeMajor === m.id ? 600 : 400, cursor: "pointer"
            }}>
              {m.short} <span style={{ opacity: 0.55, fontSize: "0.72rem" }}>{m.dates}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
            <div style={{ fontSize: "2rem", marginBottom: 12 }}>⛳</div>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85rem" }}>Loading field…</p>
          </div>
        ) : field.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>📋</div>
            <p style={{ color: "var(--text-muted)" }}>The field for this major hasn't been published yet. Check back soon.</p>
          </div>
        ) : (
          <>
            {majorInfo?.pickDeadline && (
              <div style={{
                background: locked ? "rgba(239,68,68,0.08)" : "rgba(77,189,136,0.08)",
                border: `1px solid ${locked ? "rgba(239,68,68,0.25)" : "rgba(77,189,136,0.25)"}`,
                borderRadius: 8, padding: "10px 16px", marginBottom: 20,
                color: locked ? "#f87171" : "var(--green-400)", fontSize: "0.82rem", fontFamily: "'DM Mono', monospace"
              }}>
                {locked ? "🔒 Picks are locked for this major" : `⏰ Deadline: ${new Date(majorInfo.pickDeadline).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "full", timeStyle: "short" })} CT`}
              </div>
            )}

            {/* Bonus chart */}
            <div className="card" style={{ padding: "14px 18px", marginBottom: 24 }}>
              <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, fontWeight: 600 }}>Bonus Chart — {MAJORS.find(m => m.id === activeMajor)?.name}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", gap: "4px 0", fontSize: "0.78rem" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>Odds Tier</span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.68rem", textAlign: "center" }}>Any Pick Wins</span>
                <span style={{ color: "#facc15", fontSize: "0.68rem", textAlign: "center" }}>Top Pick Wins ⭐</span>
                {Object.values(ODDS_BONUSES).map(b => (
                  <><span key={b.tier+"-l"} style={{ color: TIER_COLORS[b.tier], padding: "3px 0" }}>{b.label}</span>
                  <span key={b.tier+"-s"} style={{ color: "#f87171", textAlign: "center", fontFamily: "'DM Mono', monospace" }}>{b.standardBonus}</span>
                  <span key={b.tier+"-t"} style={{ color: "#facc15", textAlign: "center", fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{b.topPickBonus}</span></>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {/* Pick slots */}
              <div>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, fontWeight: 600 }}>
                  Your Picks
                </div>
                {picks.map((pick, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ color: i === 0 ? "#facc15" : "var(--text-muted)", fontSize: "0.68rem", fontFamily: "'DM Mono', monospace", marginBottom: 3 }}>
                      {i === 0 ? "⭐ SLOT 1 — TOP PICK" : `SLOT ${i + 1}`}
                    </div>
                    <div onClick={() => { if (!locked) { setActiveSlot(activeSlot === i ? null : i); setSearch(""); } }}
                      style={{
                        padding: "10px 14px", borderRadius: 8, cursor: locked ? "default" : "pointer",
                        border: `1px solid ${activeSlot === i ? "var(--green-400)" : pick ? (i === 0 ? "rgba(250,204,21,0.35)" : "var(--border)") : "rgba(255,255,255,0.08)"}`,
                        background: activeSlot === i ? "rgba(77,189,136,0.07)" : pick ? "rgba(17,45,28,0.8)" : "rgba(10,31,20,0.3)",
                        display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 48, transition: "all 0.12s"
                      }}>
                      {pick ? (
                        <>
                          <div>
                            <div style={{ color: "#f0faf4", fontSize: "0.87rem", fontWeight: 500 }}>{pick.displayName}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                              <span className={`tier-badge tier-${pick.tier}`}>{ODDS_BONUSES[pick.tier].label}</span>
                              {i === 0 && <span style={{ color: "#facc15", fontSize: "0.66rem" }}>Win bonus: {ODDS_BONUSES[pick.tier].topPickBonus}</span>}
                            </div>
                          </div>
                          {!locked && <button onClick={e => { e.stopPropagation(); clearSlot(i); }}
                            style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "1.1rem", padding: "0 4px" }}>×</button>}
                        </>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.83rem" }}>
                          {locked ? "—" : activeSlot === i ? "Choose from field →" : "Click to select"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {topPick && (
                  <div style={{ marginTop: 14, background: "rgba(250,204,21,0.05)", border: "1px solid rgba(250,204,21,0.18)", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ color: "#facc15", fontSize: "0.72rem", fontWeight: 600, marginBottom: 3 }}>If {topPick.displayName} wins</div>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                      Top Pick bonus: <strong style={{ color: "#facc15" }}>{ODDS_BONUSES[topPick.tier].topPickBonus} strokes</strong>
                    </div>
                  </div>
                )}

                {!locked && (
                  <div style={{ marginTop: 18 }}>
                    {error && <div style={{ color: "#f87171", fontSize: "0.8rem", marginBottom: 8 }}>{error}</div>}
                    <button className="btn-primary" style={{ width: "100%", padding: "12px" }}
                      onClick={handleSubmit} disabled={!picks.every(Boolean) || saving}>
                      {saving ? "Saving…" : saved ? "✓ Update Picks" : "Submit Picks"}
                    </button>
                    {saved && <p style={{ color: "var(--green-400)", fontSize: "0.76rem", textAlign: "center", marginTop: 6 }}>
                      Picks saved! You can update them until the deadline.
                    </p>}
                  </div>
                )}
              </div>

              {/* Field list */}
              <div>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, fontWeight: 600 }}>
                  Field {activeSlot !== null && <span style={{ color: "var(--green-400)", textTransform: "none", letterSpacing: 0 }}>· selecting slot {activeSlot + 1}</span>}
                </div>
                <input className="input" placeholder="Search golfers…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 8 }} />
                <div style={{ maxHeight: 480, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                  {filteredField.map(golfer => {
                    const usedOther = usedInOtherMajors.includes(golfer.id);
                    const usedCurrent = currentPickIds.includes(golfer.id) && picks[activeSlot ?? -1]?.id !== golfer.id;
                    const unavail = usedOther || usedCurrent;
                    const isSelected = picks.some(p => p?.id === golfer.id);
                    return (
                      <div key={golfer.id} onClick={() => !unavail && !locked && activeSlot !== null && selectGolfer(golfer)}
                        style={{
                          padding: "8px 12px", borderRadius: 7,
                          border: `1px solid ${isSelected ? "rgba(77,189,136,0.4)" : "var(--border)"}`,
                          background: isSelected ? "rgba(77,189,136,0.07)" : unavail ? "transparent" : "rgba(17,45,28,0.4)",
                          opacity: unavail ? 0.35 : 1,
                          cursor: unavail || locked || activeSlot === null ? "default" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.1s"
                        }}>
                        <span style={{ color: unavail ? "#6b7280" : "#f0faf4", fontSize: "0.83rem" }}>
                          {golfer.displayName}
                          {usedOther && <span style={{ color: "#6b7280", fontSize: "0.68rem", marginLeft: 6 }}>(used in another major)</span>}
                          {isSelected && !usedOther && <span style={{ color: "var(--green-400)", fontSize: "0.68rem", marginLeft: 6 }}>✓</span>}
                        </span>
                        <span className={`tier-badge tier-${golfer.tier}`}>{ODDS_BONUSES[golfer.tier].label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
