"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/shared/Nav";
import { getSession } from "@/lib/auth";
import { ODDS_BONUSES } from "@/types";
import type { MajorId, FieldGolfer, OddsTier, Major, EntryStandings } from "@/types";
import { formatScore } from "@/lib/scoring";

const MAJORS: { id: MajorId; name: string; short: string; dates: string }[] = [
  { id: "masters",      name: "The Masters",           short: "Masters",      dates: "Apr 10–13" },
  { id: "pga",          name: "PGA Championship",      short: "PGA",          dates: "May 15–18" },
  { id: "us-open",      name: "U.S. Open",             short: "US Open",      dates: "Jun 12–15" },
  { id: "british-open", name: "The Open Championship", short: "British Open", dates: "Jul 17–20" }
];

function DeadlineCountdown({ deadline }: { deadline: string }) {
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    function calc() {
      const diff = new Date(deadline).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("Locked"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      if (h > 48) { const d = Math.floor(h / 24); setTimeLeft(`${d}d ${h % 24}h remaining`); }
      else if (h > 0) setTimeLeft(`${h}h ${m}m remaining`);
      else setTimeLeft(`${m}m remaining`);
    }
    calc();
    const iv = setInterval(calc, 60000);
    return () => clearInterval(iv);
  }, [deadline]);
  return <>{timeLeft}</>;
}

export default function PicksPage() {
  const router = useRouter();
  const session = getSession();
  const [activeMajor, setActiveMajor] = useState<MajorId>("us-open");
  const [field, setField] = useState<FieldGolfer[]>([]);
  const [majorInfo, setMajorInfo] = useState<Major | null>(null);
  const [picks, setPicks] = useState<(FieldGolfer | null)[]>([null,null,null,null,null]);
  const [usedInOtherMajors, setUsedInOtherMajors] = useState<string[]>([]);
  const [allMajorPicks, setAllMajorPicks] = useState<Record<string, any[]>>({});
  const [search, setSearch] = useState("");
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [myStandings, setMyStandings] = useState<EntryStandings | null>(null);

  useEffect(() => {
    if (!session) { router.push("/login"); return; }
    loadData(activeMajor);
  }, [activeMajor]);

  async function loadData(majorId: MajorId) {
    setLoading(true); setError(""); setActiveSlot(null);
    try {
      const [fieldRes, entryRes, majorRes, lbRes] = await Promise.all([
        fetch(`/api/picks/field?majorId=${majorId}`),
        fetch(`/api/picks/my-picks?entryId=${session!.entryId}`),
        fetch(`/api/picks/major-info?majorId=${majorId}`),
        fetch("/api/leaderboard")
      ]);

      const fieldData = await fieldRes.json();
      const entryData = await entryRes.json();
      const majorData = await majorRes.json();
      if (lbRes.ok) {
        const lbData = await lbRes.json();
        const myEntry = (lbData.standings ?? []).find((e: EntryStandings) => e.entryId === session!.entryId);
        setMyStandings(myEntry ?? null);
      }

      const golfers: FieldGolfer[] = fieldData.golfers ?? [];
      setField(golfers);
      setMajorInfo(majorData.major ?? null);

      // Store all majors picks for the status ribbon
      const majorsData = entryData.majors ?? {};
      const allPicks: Record<string, any[]> = {};
      Object.keys(majorsData).forEach(mid => {
        allPicks[mid] = majorsData[mid]?.picks ?? [];
      });
      setAllMajorPicks(allPicks);

      // Load picks for this major
      const myMajorPicks: any[] = majorsData[majorId]?.picks ?? [];
      const loadedPicks: (FieldGolfer | null)[] = [null,null,null,null,null];

      myMajorPicks.forEach((p: any, i: number) => {
        if (i >= 5) return;
        // Match by ID, then by name (case-insensitive)
        const match = golfers.find(g =>
          g.id === p.golferId ||
          g.displayName.toLowerCase().trim() === (p.golferName ?? "").toLowerCase().trim()
        );
        loadedPicks[i] = match ?? {
          id: p.golferId ?? p.golferName,
          displayName: p.golferName ?? "Unknown",
          tier: p.tier ?? "field",
          majorId: majorId as MajorId
        };
      });

      setPicks(loadedPicks);
      setSaved(myMajorPicks.length > 0);

      // Track golfer IDs used in other majors
      const used: string[] = [];
      MAJORS.forEach(m => {
        if (m.id !== majorId) {
          (majorsData[m.id]?.picks ?? []).forEach((p: any) => {
            if (p.golferId) used.push(p.golferId);
          });
        }
      });
      setUsedInOtherMajors(used);

      const deadline = majorData.major?.pickDeadline;
      const status = majorData.major?.status;
      setLocked((deadline && new Date(deadline) < new Date()) || status === "locked" || status === "finalized");
    } catch (e) {
      setError("Failed to load picks. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  }

  const currentPickIds = picks.map(p => p?.id).filter(Boolean) as string[];

  function selectGolfer(g: FieldGolfer) {
    if (activeSlot === null || locked) return;
    if (usedInOtherMajors.includes(g.id)) return;
    const already = picks.findIndex(p => p?.id === g.id);
    if (already !== -1 && already !== activeSlot) return;
    const next = [...picks]; next[activeSlot] = g;
    setPicks(next); setActiveSlot(null); setSearch(""); setSaved(false);
  }

  function clearSlot(i: number) {
    const next = [...picks]; next[i] = null; setPicks(next); setSaved(false);
  }

  async function handleSubmit() {
    if (!picks.every(Boolean)) { setError("Please fill all 5 slots before submitting."); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/picks/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: session!.entryId, majorId: activeMajor,
          picks: picks.map((p, i) => ({ golferId: p!.id, golferName: p!.displayName, isTopPick: i === 0, tier: p!.tier }))
        })
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Submission failed."); return; }
      setSaved(true);
      // Refresh to confirm picks are stored
      loadData(activeMajor);
    } catch { setError("Submission failed. Please try again."); }
    finally { setSaving(false); }
  }

  const topPick = picks[0];
  const filteredField = field.filter(g => !search || g.displayName.toLowerCase().includes(search.toLowerCase()));
  const allFilled = picks.every(Boolean);
  const mastersPicks = allMajorPicks["masters"] ?? [];
  const hasSubmittedThisMajor = (allMajorPicks[activeMajor] ?? []).length > 0;

  function scoreColor(score: number | null): string {
    if (score === null) return "var(--border)";
    if (score < 0) return "#e8c96a";
    if (score === 0) return "#f5f0e8";
    return "#6b7280";
  }

  const isFinalized = majorInfo?.status === "finalized";
  const finalizedMs = isFinalized ? myStandings?.majorScores[activeMajor] : null;
  const finalizedSortedPicks = finalizedMs?.pickResults
    ? [...finalizedMs.pickResults].sort((a, b) => a.score - b.score)
    : [];
  const finalizedCounting = finalizedSortedPicks.slice(0, 3);
  const finalizedNotCounting = finalizedSortedPicks.slice(3);

  const deadline = majorInfo?.pickDeadline;
  const deadlineFormatted = deadline
    ? new Date(deadline).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}>
      <Nav />
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "32px 20px" }}>

        {/* ── STATUS RIBBON ── */}
        <div style={{
          borderRadius: 12, padding: "20px 24px", marginBottom: 28,
          background: hasSubmittedThisMajor
            ? "linear-gradient(135deg, rgba(26,66,41,0.9) 0%, rgba(17,45,28,0.9) 100%)"
            : "linear-gradient(135deg, rgba(60,20,20,0.9) 0%, rgba(40,15,15,0.9) 100%)",
          border: `1px solid ${hasSubmittedThisMajor ? "rgba(77,189,136,0.4)" : "rgba(239,68,68,0.4)"}`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 4 }}>
                Your Entry
              </div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.4rem", color: "#f0faf4", fontWeight: 700, marginBottom: 4 }}>
                {session?.entrantName}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                {MAJORS.find(m => m.id === activeMajor)?.name}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              {locked ? (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 20, padding: "6px 14px" }}>
                  <span style={{ color: "#f87171", fontSize: "0.85rem", fontWeight: 600 }}>🔒 Picks Locked</span>
                </div>
              ) : hasSubmittedThisMajor ? (
                <>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(77,189,136,0.15)", border: "1px solid rgba(77,189,136,0.4)", borderRadius: 20, padding: "6px 14px", marginBottom: 8 }}>
                    <span style={{ color: "var(--green-400)", fontSize: "0.85rem", fontWeight: 600 }}>✓ Picks Submitted</span>
                  </div>
                  {deadlineFormatted && (
                    <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4 }}>
                      Modify by {deadlineFormatted}
                    </div>
                  )}
                  {deadline && !locked && (
                    <div style={{ color: "#facc15", fontSize: "0.75rem", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
                      <DeadlineCountdown deadline={deadline} />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 20, padding: "6px 14px", marginBottom: 8 }}>
                    <span style={{ color: "#f87171", fontSize: "0.85rem", fontWeight: 600 }}>⚠ Picks Not Submitted</span>
                  </div>
                  {deadlineFormatted && (
                    <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4 }}>
                      Due by {deadlineFormatted}
                    </div>
                  )}
                  {deadline && !locked && (
                    <div style={{ color: "#f87171", fontSize: "0.75rem", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
                      <DeadlineCountdown deadline={deadline} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Pick status dots for all 4 majors */}
          <div style={{ display: "flex", gap: 8, marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)", flexWrap: "wrap" }}>
            {MAJORS.map(m => {
              const hasPicks = (allMajorPicks[m.id] ?? []).length > 0;
              const isActive = m.id === activeMajor;
              return (
                <button key={m.id} onClick={() => setActiveMajor(m.id)} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 12px", borderRadius: 16,
                  border: `1px solid ${isActive ? (hasPicks ? "rgba(77,189,136,0.5)" : "rgba(239,68,68,0.5)") : "rgba(255,255,255,0.1)"}`,
                  background: isActive ? (hasPicks ? "rgba(77,189,136,0.1)" : "rgba(239,68,68,0.1)") : "transparent",
                  cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "0.78rem",
                  color: isActive ? (hasPicks ? "var(--green-400)" : "#f87171") : "var(--text-muted)"
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: hasPicks ? "var(--green-400)" : "rgba(239,68,68,0.5)", display: "inline-block", flexShrink: 0 }} />
                  {m.short}
                  {hasPicks && <span style={{ fontSize: "0.68rem", opacity: 0.7 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
            <div style={{ fontSize: "2rem", marginBottom: 12 }}>⛳</div>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85rem" }}>Loading field…</p>
          </div>
        ) : isFinalized ? (
          /* ── FINALIZED MAJOR: picks-only results view ── */
          <div className="card" style={{ padding: "24px 28px" }}>
            <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20, fontWeight: 600 }}>
              {MAJORS.find(m => m.id === activeMajor)?.name} — Final Results
            </div>
            {!finalizedMs || finalizedSortedPicks.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", fontStyle: "italic", margin: 0 }}>
                No picks submitted — penalty applied
              </p>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Final Score</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.8rem", fontWeight: 700, color: scoreColor(finalizedMs.finalScore) }}>
                      {formatScore(finalizedMs.finalScore)}
                    </div>
                  </div>
                  {finalizedMs.bonus !== 0 && (
                    <div style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)", borderRadius: 8, padding: "10px 16px" }}>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Bonus</div>
                      <div style={{ color: "#c9a84c", fontSize: "0.88rem", fontWeight: 600 }}>{finalizedMs.bonusReason}</div>
                    </div>
                  )}
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, fontWeight: 600 }}>Best 3 Count</div>
                {finalizedCounting.map((pr, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ color: "#c9a84c", fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", width: 20 }}>#{i+1}</span>
                      {pr.pick.isTopPick && <span style={{ fontSize: "0.78rem" }}>⭐</span>}
                      <span style={{ color: "#f0faf4", fontSize: "0.93rem", fontWeight: 600 }}>{pr.pick.golferName}</span>
                      {pr.status === "winner" && <span style={{ fontSize: "0.78rem" }}>🏆</span>}
                    </div>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9rem", fontWeight: 700, color: scoreColor(pr.score) }}>
                      {pr.status === "cut" ? "CUT" : pr.status === "wd" ? "WD" : pr.status === "missing" ? "--" : formatScore(pr.score)}
                    </span>
                  </div>
                ))}
                {finalizedNotCounting.length > 0 && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
                      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
                      <span style={{ color: "var(--text-muted)", fontSize: "0.62rem", fontFamily: "'DM Mono', monospace" }}>NOT COUNTING</span>
                      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
                    </div>
                    {finalizedNotCounting.map((pr, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", opacity: 0.45 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {pr.pick.isTopPick && <span style={{ color: "#facc15", fontSize: "0.7rem" }}>*</span>}
                          <span style={{ color: "#f0faf4", fontSize: "0.88rem", fontStyle: "italic" }}>{pr.pick.golferName}</span>
                        </div>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85rem", color: "#6b7280", fontStyle: "italic" }}>
                          {pr.status === "cut" ? "CUT" : pr.status === "wd" ? "WD" : pr.status === "missing" ? "--" : formatScore(pr.score)}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        ) : field.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>📋</div>
            <p style={{ color: "var(--text-muted)" }}>Field not published yet. Check back soon.</p>
          </div>
        ) : (
          <>
            {/* Bonus chart */}
            <div className="card" style={{ padding: "14px 18px", marginBottom: 24 }}>
              <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, fontWeight: 600 }}>Bonus Chart — {MAJORS.find(m => m.id === activeMajor)?.name}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px", gap: "4px 0", fontSize: "0.78rem" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>Odds Tier</span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.68rem", textAlign: "center" }}>Any Pick Wins</span>
                <span style={{ color: "#facc15", fontSize: "0.68rem", textAlign: "center" }}>Top Pick Wins ⭐</span>
                {Object.values(ODDS_BONUSES).map(b => (
                  <><span key={b.tier+"-l"} style={{ color: b.tier==="even-999"?"#facc15":b.tier==="1000-2499"?"#86d8b0":b.tier==="2500-4999"?"#4dbd88":b.tier==="5000plus"?"#28a06a":"#6b7280", padding: "3px 0" }}>{b.label}</span>
                  <span key={b.tier+"-s"} style={{ color: "#f87171", textAlign: "center", fontFamily: "'DM Mono', monospace" }}>{b.standardBonus}</span>
                  <span key={b.tier+"-t"} style={{ color: "#facc15", textAlign: "center", fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{b.topPickBonus}</span></>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {/* LEFT: Pick slots */}
              <div>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, fontWeight: 600 }}>Your Picks</div>
                {picks.map((pick, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ color: i===0?"#facc15":"var(--text-muted)", fontSize: "0.68rem", fontFamily: "'DM Mono', monospace", marginBottom: 3 }}>
                      {i===0?"⭐ SLOT 1 — TOP PICK":`SLOT ${i+1}`}
                    </div>
                    <div
                      onClick={() => { if (!locked) { setActiveSlot(activeSlot===i?null:i); setSearch(""); } }}
                      style={{
                        padding: "10px 14px", borderRadius: 8, cursor: locked?"default":"pointer",
                        border: `1px solid ${activeSlot===i?"var(--green-400)":pick?(i===0?"rgba(250,204,21,0.35)":"var(--border)"):"rgba(255,255,255,0.08)"}`,
                        background: activeSlot===i?"rgba(77,189,136,0.07)":pick?"rgba(17,45,28,0.8)":"rgba(10,31,20,0.3)",
                        display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 48
                      }}>
                      {pick ? (
                        <>
                          <div>
                            <div style={{ color: "#f0faf4", fontSize: "0.87rem", fontWeight: 500 }}>{pick.displayName}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                              <span className={`tier-badge tier-${pick.tier}`}>{ODDS_BONUSES[pick.tier]?.label}</span>
                              {i===0 && <span style={{ color: "#facc15", fontSize: "0.66rem" }}>Win bonus: {ODDS_BONUSES[pick.tier]?.topPickBonus}</span>}
                            </div>
                          </div>
                          {!locked && (
                            <button onClick={e => { e.stopPropagation(); clearSlot(i); }}
                              style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "1.1rem", padding: "0 4px" }}>×</button>
                          )}
                        </>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.83rem" }}>
                          {locked?"—":activeSlot===i?"Choose from field →":"Click to select"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {topPick && (
                  <div style={{ marginTop: 14, background: "rgba(250,204,21,0.05)", border: "1px solid rgba(250,204,21,0.18)", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ color: "#facc15", fontSize: "0.72rem", fontWeight: 600, marginBottom: 3 }}>If {topPick.displayName} wins</div>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                      Top Pick bonus: <strong style={{ color: "#facc15" }}>{ODDS_BONUSES[topPick.tier]?.topPickBonus} strokes</strong>
                    </div>
                  </div>
                )}

                {!locked && (
                  <div style={{ marginTop: 18 }}>
                    {error && <div style={{ color: "#f87171", fontSize: "0.8rem", marginBottom: 8 }}>{error}</div>}
                    <button className="btn-primary" style={{ width: "100%", padding: "13px" }}
                      onClick={handleSubmit} disabled={!allFilled || saving}>
                      {saving ? "Saving…" : hasSubmittedThisMajor ? "✓ Update My Picks" : "Submit Picks"}
                    </button>
                    {hasSubmittedThisMajor && (
                      <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", textAlign: "center", marginTop: 6 }}>
                        Your picks are saved — update any time before the deadline.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* RIGHT: Field list */}
              <div>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, fontWeight: 600 }}>
                  Field {activeSlot!==null && <span style={{ color: "var(--green-400)", textTransform: "none", letterSpacing: 0 }}>· selecting slot {activeSlot+1}{activeSlot===0?" (Top Pick)":""}</span>}
                </div>
                <input className="input" placeholder="Search golfers…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 8 }} />
                <div style={{ maxHeight: 500, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                  {filteredField.map(g => {
                    const usedOther = usedInOtherMajors.includes(g.id);
                    const usedCurr = currentPickIds.includes(g.id) && picks[activeSlot??-1]?.id !== g.id;
                    const unavail = usedOther || usedCurr;
                    const isSel = picks.some(p => p?.id === g.id);
                    return (
                      <div key={g.id}
                        onClick={() => !unavail && !locked && activeSlot!==null && selectGolfer(g)}
                        style={{
                          padding: "8px 12px", borderRadius: 7,
                          border: `1px solid ${isSel?"rgba(77,189,136,0.4)":"var(--border)"}`,
                          background: isSel?"rgba(77,189,136,0.07)":unavail?"transparent":"rgba(17,45,28,0.4)",
                          opacity: unavail?0.35:1,
                          cursor: unavail||locked||activeSlot===null?"default":"pointer",
                          display: "flex", alignItems: "center", justifyContent: "space-between"
                        }}>
                        <span style={{ color: unavail?"#6b7280":"#f0faf4", fontSize: "0.83rem" }}>
                          {g.displayName}
                          {usedOther && <span style={{ color: "#6b7280", fontSize: "0.68rem", marginLeft: 6 }}>(used in another major)</span>}
                          {isSel && !usedOther && <span style={{ color: "var(--green-400)", fontSize: "0.68rem", marginLeft: 6 }}>✓</span>}
                        </span>
                        <span className={`tier-badge tier-${g.tier}`}>{ODDS_BONUSES[g.tier]?.label}</span>
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