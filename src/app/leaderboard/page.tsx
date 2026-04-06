"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/shared/Nav";
import { getSession } from "@/lib/auth";
import { formatScore } from "@/lib/scoring";
import type { EntryStandings, MajorId } from "@/types";

const ALL_MAJORS: { id: MajorId; name: string; short: string }[] = [
  { id: "masters",      name: "The Masters",           short: "Masters" },
  { id: "pga",          name: "PGA Championship",      short: "PGA" },
  { id: "us-open",      name: "U.S. Open",             short: "US Open" },
  { id: "british-open", name: "The Open Championship", short: "British" }
];

interface MajorInfo {
  deadline?: string; // ISO string
  [key: string]: any;
}

function formatDeadline(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const day = days[d.getDay()];
  const month = months[d.getMonth()];
  const date = d.getDate();
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2,"0");
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `Deadline: ${day}, ${month} ${date} · ${hour12}:${m} ${ampm} CT`;
}

function formatCountdown(iso: string | undefined): string {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Deadline passed";
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const session = getSession();
  const [standings, setStandings] = useState<EntryStandings[]>([]);
  const [activeMajorIds, setActiveMajorIds] = useState<MajorId[]>([]);
  const [viewMajor, setViewMajor] = useState<MajorId | "overall">("overall");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [mastersMajorInfo, setMastersMajorInfo] = useState<MajorInfo | null>(null);
  const [myPicksSubmitted, setMyPicksSubmitted] = useState(false);
  const [, setTick] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const [lbRes, majorsRes] = await Promise.all([
        fetch("/api/leaderboard"),
        fetch("/api/majors")
      ]);
      if (lbRes.ok) {
        const d = await lbRes.json();
        setStandings(d.standings ?? []);
        setLastUpdated(new Date().toLocaleTimeString());
      }
      if (majorsRes.ok) {
        const d = await majorsRes.json();
        const active = (d.majors ?? [])
          .filter((m: any) => ["locked","active","finalized"].includes(m.status))
          .map((m: any) => m.id as MajorId);
        setActiveMajorIds(active);
      }
      if (session?.entryId) {
        const picksRes = await fetch(
          `/api/picks/my-picks?entryId=${session.entryId}`
        );
        if (picksRes.ok) {
          const picksData = await picksRes.json();
          const mastersPicks = picksData.majors?.masters?.picks ?? [];
          setMyPicksSubmitted(mastersPicks.length === 5);
        }
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!session) { router.push("/login"); return; }
    fetchData();
    const iv = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  // Fetch Masters major info for deadline display
  useEffect(() => {
    fetch("/api/picks/major-info?majorId=masters")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMastersMajorInfo(d); })
      .catch(() => {});
  }, []);

  // Countdown tick every minute
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  const visibleMajors = ALL_MAJORS.filter(m => activeMajorIds.includes(m.id));
  const tournamentStarted = activeMajorIds.length > 0;

  const displayed = viewMajor === "overall"
    ? standings
    : [...standings].sort((a,b) =>
        (a.majorScores[viewMajor as MajorId]?.finalScore ?? 999) -
        (b.majorScores[viewMajor as MajorId]?.finalScore ?? 999)
      );

  function getScore(e: EntryStandings) {
    if (viewMajor === "overall") return e.totalScore;
    return e.majorScores[viewMajor as MajorId]?.finalScore ?? null;
  }

  function scoreStyle(score: number | null): React.CSSProperties {
    if (score === null) return { color: "var(--border)" };
    if (score < 0) return { color: "#f87171", fontWeight: 700 };
    if (score === 0) return { color: "#f0faf4", fontWeight: 700 };
    return { color: "#6b7280" };
  }

  const gridCols = tournamentStarted
    ? `44px 1fr ${visibleMajors.map(()=>"78px").join(" ")} 88px 48px`
    : "44px 1fr 160px";

  // Personalized status ribbon (pre-tournament only)
  const myEntry = session
    ? standings.find(e => e.entryId === session.entryId) ?? null
    : null;
  const deadline = mastersMajorInfo?.deadline;
  const countdown = formatCountdown(deadline);
  const deadlineLabel = formatDeadline(deadline);

  const PreTournamentRibbon = () => {
    if (!session || !myEntry) return null;

    if (myPicksSubmitted) {
      return (
        <div style={{
          background: "rgba(17,45,28,0.8)",
          border: "1px solid rgba(77,189,136,0.3)",
          borderRadius: 12,
          padding: "20px 24px",
          marginBottom: 24,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.25rem", color: "#f0faf4", fontWeight: 700 }}>
              {session.entrantName}
            </span>
            <span style={{
              background: "rgba(77,189,136,0.18)",
              border: "1px solid rgba(77,189,136,0.4)",
              borderRadius: 20,
              padding: "3px 12px",
              fontSize: "0.78rem",
              fontWeight: 700,
              color: "var(--green-400)",
              letterSpacing: "0.01em",
            }}>
              ✓ Picks Submitted
            </span>
          </div>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: 1.5 }}>
            You're all set for The Masters. You can update your picks any time before the deadline.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            {deadlineLabel && (
              <span style={{ color: "#facc15", fontSize: "0.8rem", fontFamily: "'DM Mono', monospace" }}>
                {deadlineLabel}
              </span>
            )}
            {countdown && (
              <span style={{ color: "var(--green-400)", fontSize: "0.8rem", fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
                {countdown}
              </span>
            )}
          </div>
          <div>
            <button
              className="btn-secondary"
              style={{ fontSize: "0.82rem", padding: "6px 14px" }}
              onClick={() => router.push("/picks")}
            >
              Edit picks →
            </button>
          </div>
        </div>
      );
    }

    // No picks submitted
    return (
      <div style={{
        background: "rgba(40,15,15,0.8)",
        border: "1px solid rgba(239,68,68,0.3)",
        borderRadius: 12,
        padding: "20px 24px",
        marginBottom: 24,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.25rem", color: "#f0faf4", fontWeight: 700 }}>
            {session.entrantName}
          </span>
          <span style={{
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.4)",
            borderRadius: 20,
            padding: "3px 12px",
            fontSize: "0.78rem",
            fontWeight: 700,
            color: "#f87171",
            letterSpacing: "0.01em",
          }}>
            ⚠ Picks Not Submitted
          </span>
        </div>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: 1.5 }}>
          You still owe picks for The Masters.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {deadlineLabel && (
            <span style={{ color: "#facc15", fontSize: "0.8rem", fontFamily: "'DM Mono', monospace" }}>
              {deadlineLabel}
            </span>
          )}
          {countdown && (
            <span style={{ color: "#f87171", fontSize: "0.8rem", fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
              {countdown}
            </span>
          )}
        </div>
        <div>
          <button
            className="btn-primary"
            style={{ fontSize: "0.88rem", padding: "8px 20px" }}
            onClick={() => router.push("/picks")}
          >
            Submit My Picks →
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}>
      <Nav />
      <div style={{ maxWidth: 1060, margin: "0 auto", padding: "32px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>  <div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "2rem", color: "#f0faf4", margin: 0 }}>Leaderboard</h1>
            {lastUpdated && <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
              Updated {lastUpdated} · auto-refreshes every 5 min
            </p>}
          </div>
          <button className="btn-secondary" style={{ fontSize: "0.85rem", padding: "7px 14px" }} onClick={fetchData}>↻ Refresh</button>
        </div>

        {/* Pre-tournament banner */}
        {!tournamentStarted && !loading && (
          <div style={{ background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 10, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "1.2rem" }}>⛳</span>
            <div>
              <div style={{ color: "#facc15", fontWeight: 600, fontSize: "0.88rem" }}>The Masters begins Thursday, April 10</div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 2 }}>Scores will appear here once the tournament starts. All registered entrants are listed below.</div>
            </div>
          </div>
        )}

        {/* Major tabs — only shown when tournament is active */}
        {tournamentStarted && visibleMajors.length > 1 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
            {[{ id: "overall", short: "Overall" }, ...visibleMajors].map(t => (
              <button key={t.id} onClick={() => setViewMajor(t.id as any)} style={{
                padding: "6px 16px", borderRadius: 20,
                border: `1px solid ${viewMajor===t.id?"var(--green-400)":"var(--border)"}`,
                background: viewMajor===t.id?"rgba(77,189,136,0.12)":"transparent",
                color: viewMajor===t.id?"var(--green-400)":"var(--text-muted)",
                fontFamily: "'DM Sans', sans-serif", fontSize: "0.83rem",
                fontWeight: viewMajor===t.id?600:400, cursor: "pointer"
              }}>{t.short}</button>
            ))}
          </div>
        )}

        {/* Legend — only when scoring */}
        {tournamentStarted && (
          <div style={{ background: "rgba(17,45,28,0.5)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", marginBottom: 16, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Key</span>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>Lower score = better · Best 3-of-5 picks per major count</span>
            <span style={{ color: "#facc15", fontSize: "0.78rem" }}>🏆 winner picked · ⭐ top pick won · W = winners total</span>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>⛳</div>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85rem" }}>Loading standings…</p>
          </div>
        ) : standings.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>🏌️</div>
            <p style={{ color: "var(--text-muted)" }}>No entries yet.</p>
          </div>
        ) : tournamentStarted ? (
          /* ── SCORED LEADERBOARD ── */
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "grid", gridTemplateColumns: gridCols, padding: "6px 16px", color: "var(--text-muted)", fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <span>#</span>
              <span>Entrant</span>
              {visibleMajors.map(m => <span key={m.id} style={{ textAlign: "center" }}>{m.short}</span>)}
              <span style={{ textAlign: "center" }}>Score</span>
              <span style={{ textAlign: "center" }}>W</span>
            </div>

            {displayed.map((entry, idx) => {
              const isMe = entry.entryId === session?.entryId;
              const isExpanded = expandedEntry === entry.entryId;
              const score = getScore(entry);
              return (
                <div key={entry.entryId} className="leaderboard-row" style={{ animationDelay: `${idx*0.025}s` }}>
                  <div
                    onClick={() => setExpandedEntry(isExpanded ? null : entry.entryId)}
                    style={{ display: "grid", gridTemplateColumns: gridCols, padding: "12px 16px", alignItems: "center", cursor: "pointer", background: isMe?"rgba(77,189,136,0.08)":"rgba(17,45,28,0.6)", borderRadius: 8, border: `1px solid ${isMe?"rgba(77,189,136,0.25)":"var(--border)"}` }}
                  >
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: "0.9rem", color: idx===0?"#facc15":idx===1?"#d1d5db":idx===2?"#cd7c2f":"var(--text-muted)" }}>{entry.rank}</span>
                    <span style={{ color: isMe?"var(--green-400)":"#f0faf4", fontWeight: isMe?600:400, fontSize: "0.92rem", display: "flex", alignItems: "center", gap: 6 }}>
                      {entry.entrantName}
                      {isMe && <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>(you)</span>}
                    </span>
                    {visibleMajors.map(m => {
                      const ms = entry.majorScores[m.id];
                      return (
                        <span key={m.id} style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: "0.85rem" }}>
                          {ms ? <span style={scoreStyle(ms.finalScore)}>{formatScore(ms.finalScore)}{ms.winnersHit>0?"🏆":""}{ms.topPickWon?"⭐":""}</span> : <span style={{ color: "var(--border)" }}>—</span>}
                        </span>
                      );
                    })}
                    <span style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: "0.95rem", ...scoreStyle(score) }}>
                      {score !== null ? formatScore(score) : "—"}
                    </span>
                    <span style={{ textAlign: "center", color: entry.totalWinnersHit>0?"#facc15":"var(--border)", fontFamily: "'DM Mono', monospace", fontSize: "0.85rem" }}>
                      {entry.totalWinnersHit>0?entry.totalWinnersHit:"—"}
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{ background: "rgba(10,31,20,0.95)", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "16px 20px" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 14 }}>
                        <button className="btn-secondary" style={{ fontSize: "0.78rem", padding: "5px 12px" }} onClick={e => { e.stopPropagation(); router.push(`/entry/${entry.entryId}`); }}>Full Entry</button>
                        {!isMe && <button className="btn-secondary" style={{ fontSize: "0.78rem", padding: "5px 12px" }} onClick={e => { e.stopPropagation(); router.push(`/head-to-head?a=${session?.entryId}&b=${entry.entryId}`); }}>Head-to-Head</button>}
                      </div>
                      {visibleMajors.map(m => {
                        const ms = entry.majorScores[m.id];
                        if (!ms) return null;
                        return (
                          <div key={m.id} style={{ marginBottom: 14 }}>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                              {m.name}{ms.bonus!==0&&<span style={{ color: "#facc15", marginLeft: 8 }}>· {ms.bonusReason}</span>}
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {ms.pickResults.map((pr, i) => (
                                <div key={i} style={{ background: pr.counted?"rgba(77,189,136,0.1)":"rgba(0,0,0,0.2)", border: `1px solid ${pr.counted?"rgba(77,189,136,0.3)":"var(--border)"}`, borderRadius: 6, padding: "4px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                                  {pr.pick.isTopPick && <span style={{ color: "#facc15", fontSize: "0.65rem" }}>⭐</span>}
                                  <span style={{ color: "#f0faf4", fontSize: "0.8rem" }}>{pr.pick.golferName}</span>
                                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.72rem", color: pr.score<0?"#f87171":pr.score===0?"#f0faf4":"#6b7280" }}>
                                    {pr.status==="cut"?"CUT":pr.status==="wd"?"WD":pr.status==="missing"?"?":formatScore(pr.score)}
                                  </span>
                                  {pr.status==="winner"&&<span>🏆</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ── PRE-TOURNAMENT ROSTER ── */
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {/* Personalized status ribbon */}
            <PreTournamentRibbon />

            <div style={{ display: "grid", gridTemplateColumns: gridCols, padding: "6px 16px", color: "var(--text-muted)", fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <span>#</span><span>Entrant</span><span style={{ textAlign: "center" }}>Masters Picks</span>
            </div>
            {standings.map((entry, idx) => {
              const hasPicks = entry.completedMajors > 0;
              const isMe = entry.entryId === session?.entryId;
              return (
                <div key={entry.entryId} className="leaderboard-row" style={{ animationDelay: `${idx*0.02}s`, display: "grid", gridTemplateColumns: gridCols, padding: "12px 16px", alignItems: "center", background: isMe?"rgba(77,189,136,0.08)":"rgba(17,45,28,0.6)", borderRadius: 8, border: `1px solid ${isMe?"rgba(77,189,136,0.25)":"var(--border)"}` }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", color: "var(--text-muted)", fontSize: "0.88rem" }}>{idx+1}</span>
                  <span style={{ color: isMe?"var(--green-400)":"#f0faf4", fontSize: "0.92rem", fontWeight: isMe?600:400, display: "flex", alignItems: "center", gap: 6 }}>
                    {entry.entrantName}
                    {isMe && <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>(you)</span>}
                  </span>
                  <div style={{ textAlign: "center" }}>
                    {hasPicks
                      ? <span style={{ color: "var(--green-400)", fontSize: "0.78rem", fontWeight: 600 }}>✓ Submitted</span>
                      : <span style={{ color: "#f87171", fontSize: "0.78rem" }}>Pending</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}