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

function abbrevName(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length < 2) return name;
  return parts[0][0] + ". " + parts.slice(1).join(" ");
}

function formatDeadline(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short"
  });
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
  const [myPicksSubmitted, setMyPicksSubmitted] = useState(false);
  const [masterDeadline, setMasterDeadline] = useState<string | undefined>(undefined);
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
        const masters = (d.majors ?? []).find((m: any) => m.id === "masters");
        if (masters?.pickDeadline) setMasterDeadline(masters.pickDeadline);
      }
      if (session?.entryId) {
        const picksRes = await fetch(`/api/picks/my-picks?entryId=${session.entryId}`);
        if (picksRes.ok) {
          const pd = await picksRes.json();
          setMyPicksSubmitted((pd.majors?.masters?.picks ?? []).length === 5);
        }
      }
    } catch {}
    finally { setLoading(false); }
  }, [session?.entryId]);

  useEffect(() => {
    if (!session) { router.push("/login"); return; }
    fetchData();
    const iv = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  // Countdown tick every minute
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(iv);
  }, []);

  const visibleMajors = ALL_MAJORS.filter(m => activeMajorIds.includes(m.id));
  const tournamentStarted = activeMajorIds.length > 0;
  const myEntry = standings.find(e => e.entryId === session?.entryId);

  const displayed = viewMajor === "overall"
    ? standings
    : [...standings].sort((a, b) =>
        (a.majorScores[viewMajor as MajorId]?.finalScore ?? 999) -
        (b.majorScores[viewMajor as MajorId]?.finalScore ?? 999)
      );

  function getScore(e: EntryStandings) {
    if (viewMajor === "overall") return e.totalScore;
    return e.majorScores[viewMajor as MajorId]?.finalScore ?? null;
  }

  function scoreColor(score: number | null): string {
    if (score === null) return "var(--border)";
    if (score < 0) return "#f87171";
    if (score === 0) return "#f0faf4";
    return "#6b7280";
  }

  const gridCols = tournamentStarted
    ? `36px 1fr ${visibleMajors.map(() => "64px").join(" ")} 72px 36px`
    : "44px 1fr 160px";

  const deadlineFormatted = formatDeadline(masterDeadline);
  const countdown = formatCountdown(masterDeadline);

  // Pre-tournament personal ribbon
  function PreTournamentRibbon() {
    if (!session || tournamentStarted) return null;
    const submitted = myPicksSubmitted;
    return (
      <div style={{
        background: submitted ? "rgba(17,45,28,0.85)" : "rgba(40,15,15,0.85)",
        border: `1px solid ${submitted ? "rgba(77,189,136,0.35)" : "rgba(239,68,68,0.35)"}`,
        borderRadius: 12, padding: "20px 24px", marginBottom: 20
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 4 }}>Your Entry</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.25rem", color: "#f0faf4", fontWeight: 700, marginBottom: 8 }}>
              {session.entrantName}
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: submitted ? "rgba(77,189,136,0.15)" : "rgba(239,68,68,0.15)", border: `1px solid ${submitted ? "rgba(77,189,136,0.35)" : "rgba(239,68,68,0.35)"}`, borderRadius: 6, padding: "3px 10px", marginBottom: 8 }}>
              <span style={{ color: submitted ? "var(--green-400)" : "#f87171", fontSize: "0.78rem", fontWeight: 700 }}>
                {submitted ? "Picks Submitted" : "Picks Not Submitted"}
              </span>
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.83rem", marginBottom: 8 }}>
              {submitted
                ? "You're all set for The Masters. Update picks any time before the deadline."
                : "You still owe picks for The Masters."}
            </div>
            {deadlineFormatted && (
              <div style={{ color: "#facc15", fontSize: "0.78rem", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
                Deadline: {deadlineFormatted}
              </div>
            )}
            {countdown && (
              <div style={{ color: submitted ? "var(--green-400)" : "#f87171", fontSize: "0.76rem", fontFamily: "'DM Mono', monospace" }}>
                {countdown}
              </div>
            )}
          </div>
          <div>
            {submitted ? (
              <button className="btn-secondary" style={{ fontSize: "0.85rem", padding: "9px 18px" }} onClick={() => router.push("/picks")}>Edit picks</button>
            ) : (
              <button className="btn-primary" style={{ fontSize: "0.9rem", padding: "11px 22px" }} onClick={() => router.push("/picks")}>Submit My Picks</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Active tournament personal entry tracker
  function EntryTracker() {
    if (!myEntry || !tournamentStarted) return null;
    const majorId = visibleMajors[0]?.id;
    if (!majorId) return null;
    const ms = myEntry.majorScores[majorId];
    if (!ms) return null;
    const sortedPicks = [...ms.pickResults].sort((a, b) => a.score - b.score);
    const counting = sortedPicks.slice(0, 3);
    const notCounting = sortedPicks.slice(3);

    return (
      <div style={{
        background: "linear-gradient(135deg, rgba(26,66,41,0.9) 0%, rgba(17,45,28,0.95) 100%)",
        border: "1px solid rgba(77,189,136,0.35)", borderRadius: 12, padding: "20px 24px", marginBottom: 20
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 4 }}>Your Entry</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.2rem", color: "#f0faf4", fontWeight: 700 }}>{myEntry.entrantName}</div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: 2 }}>{visibleMajors[0]?.name}</div>
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: "var(--text-muted)", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Score</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.5rem", fontWeight: 700, color: scoreColor(ms.finalScore) }}>
                {formatScore(ms.finalScore)}
              </div>
              {ms.bonus !== 0 && <div style={{ color: "#facc15", fontSize: "0.7rem", marginTop: 2 }}>{ms.bonusReason}</div>}
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: "var(--text-muted)", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Rank</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.5rem", fontWeight: 700, color: "#facc15" }}>
                #{myEntry.rank}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>of {standings.length}</div>
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 14 }}>
          <div style={{ color: "var(--text-muted)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            Your Picks — Best 3 Count
          </div>
          {counting.map((pr, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--green-400)", fontSize: "0.68rem", fontFamily: "'DM Mono', monospace", width: 18 }}>#{i+1}</span>
                {pr.pick.isTopPick && <span style={{ fontSize: "0.7rem" }}>⭐</span>}
                <span style={{ color: "#f0faf4", fontSize: "0.88rem", fontWeight: 500 }}>{pr.pick.golferName}</span>
                {pr.status === "winner" && <span style={{ fontSize: "0.72rem" }}>🏆</span>}
              </div>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85rem", fontWeight: 700, color: scoreColor(pr.score) }}>
                {pr.status === "cut" ? "CUT" : pr.status === "wd" ? "WD" : pr.status === "missing" ? "--" : formatScore(pr.score)}
              </span>
            </div>
          ))}

          {notCounting.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
                <span style={{ color: "var(--text-muted)", fontSize: "0.62rem", fontFamily: "'DM Mono', monospace" }}>NOT COUNTING</span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
              </div>
              {notCounting.map((pr, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", opacity: 0.4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {pr.pick.isTopPick && <span style={{ color: "#facc15", fontSize: "0.68rem" }}>*</span>}
                    <span style={{ color: "#f0faf4", fontSize: "0.83rem", fontStyle: "italic" }}>{pr.pick.golferName}</span>
                  </div>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.8rem", color: "#6b7280", fontStyle: "italic" }}>
                    {pr.status === "cut" ? "CUT" : pr.status === "wd" ? "WD" : pr.status === "missing" ? "--" : formatScore(pr.score)}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}>
      <Nav />
      <div style={{ maxWidth: 1060, margin: "0 auto", padding: "32px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "2rem", color: "#f0faf4", margin: 0 }}>Leaderboard</h1>
            {lastUpdated && (
              <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                Updated {lastUpdated} · auto-refreshes every 5 min
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-secondary" style={{ fontSize: "0.82rem", padding: "7px 14px" }} onClick={() => router.push("/analysis")}>Analysis</button>
            <button className="btn-secondary" style={{ fontSize: "0.82rem", padding: "7px 14px" }} onClick={fetchData}>Refresh</button>
          </div>
        </div>

        {/* Personal ribbons */}
        {!loading && <PreTournamentRibbon />}
        {!loading && <EntryTracker />}

        {/* Pre-tournament banner */}
        {!tournamentStarted && !loading && (
          <div style={{ background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 10, padding: "12px 20px", marginBottom: 20, display: "flex", alignItems: "center" }}>
            <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
              <span style={{ color: "#facc15", fontWeight: 600 }}>The Masters begins Thursday, April 10. </span>
              Scores appear here once the tournament starts.
            </div>
          </div>
        )}

        {/* Major tabs */}
        {tournamentStarted && visibleMajors.length > 1 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
            {[{ id: "overall", short: "Overall" }, ...visibleMajors].map(t => (
              <button key={t.id} onClick={() => setViewMajor(t.id as any)} style={{
                padding: "6px 16px", borderRadius: 20,
                border: `1px solid ${viewMajor === t.id ? "var(--green-400)" : "var(--border)"}`,
                background: viewMajor === t.id ? "rgba(77,189,136,0.12)" : "transparent",
                color: viewMajor === t.id ? "var(--green-400)" : "var(--text-muted)",
                fontFamily: "'DM Sans', sans-serif", fontSize: "0.83rem",
                fontWeight: viewMajor === t.id ? 600 : 400, cursor: "pointer"
              }}>{t.short}</button>
            ))}
          </div>
        )}

        {/* Legend */}
        {tournamentStarted && (
          <div style={{ background: "rgba(17,45,28,0.5)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 16px", marginBottom: 14, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Key</span>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.76rem" }}>Lower = better · Best 3-of-5 count</span>
            <span style={{ color: "#facc15", fontSize: "0.76rem" }}>🏆 = winner in your picks · ⭐ = top pick leading · Tap row for picks</span>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>o</div>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85rem" }}>Loading standings...</p>
          </div>
        ) : standings.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <p style={{ color: "var(--text-muted)" }}>No entries yet.</p>
          </div>
        ) : tournamentStarted ? (

          /* SCORED LEADERBOARD */
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "grid", gridTemplateColumns: gridCols, padding: "5px 10px", color: "var(--text-muted)", fontSize: "0.62rem", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
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
                <div key={entry.entryId} className="leaderboard-row" style={{ animationDelay: `${idx * 0.02}s` }}>
                  <div
                    onClick={() => setExpandedEntry(isExpanded ? null : entry.entryId)}
                    style={{
                      display: "grid", gridTemplateColumns: gridCols,
                      padding: "7px 10px", minHeight: 40, alignItems: "center", cursor: "pointer",
                      background: isMe ? "rgba(77,189,136,0.08)" : "rgba(17,45,28,0.5)",
                      border: `1px solid ${isMe ? "rgba(77,189,136,0.3)" : "var(--border)"}`,
                      borderRadius: isExpanded ? "10px 10px 0 0" : 10
                    }}
                  >
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: "0.75rem", color: idx === 0 ? "#facc15" : idx === 1 ? "#d1d5db" : idx === 2 ? "#cd7c2f" : "var(--text-muted)" }}>
                      {entry.rank}
                    </span>
                    <span style={{ color: isMe ? "var(--green-400)" : "#f0faf4", fontSize: "0.78rem", fontWeight: isMe ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.entrantName}
                      {isMe && <span style={{ fontSize: "0.58rem", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>(you)</span>}
                    </span>
                    {visibleMajors.map(m => {
                      const ms = entry.majorScores[m.id];
                      return (
                        <span key={m.id} style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: "0.72rem" }}>
                          {ms
                            ? <span style={{ color: scoreColor(ms.finalScore), fontWeight: 700 }}>
                                {formatScore(ms.finalScore)}
                                {ms.winnersHit > 0 ? " 🏆" : ""}
                                {ms.topPickWon ? " ⭐" : ""}
                              </span>
                            : <span style={{ color: "var(--border)" }}>--</span>}
                        </span>
                      );
                    })}
                    <span style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: "0.78rem", color: scoreColor(score) }}>
                      {score !== null ? formatScore(score) : "--"}
                    </span>
                    <span style={{ textAlign: "center", color: entry.totalWinnersHit > 0 ? "#facc15" : "var(--border)", fontFamily: "'DM Mono', monospace", fontSize: "0.72rem" }}>
                      {entry.totalWinnersHit > 0 ? entry.totalWinnersHit : "--"}
                    </span>
                  </div>

                  {/* Expanded picks */}
                  {isExpanded && (
                    <div style={{ background: "rgba(10,31,20,0.95)", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "14px 18px" }}>
                      {visibleMajors.map(m => {
                        const ms = entry.majorScores[m.id];
                        if (!ms) return null;
                        const sortedPicks = [...ms.pickResults].sort((a, b) => a.score - b.score);
                        const counting = sortedPicks.slice(0, 3);
                        const notCounting = sortedPicks.slice(3);
                        return (
                          <div key={m.id} style={{ marginBottom: 10 }}>
                            {visibleMajors.length > 1 && (
                              <div style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                                {m.name}{ms.bonus !== 0 && <span style={{ color: "#facc15", marginLeft: 8 }}>{ms.bonusReason}</span>}
                              </div>
                            )}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                              {counting.map((pr, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(77,189,136,0.1)", border: "1px solid rgba(77,189,136,0.25)", borderRadius: 6, padding: "3px 7px" }}>
                                  {pr.pick.isTopPick && <span style={{ color: "#facc15", fontSize: "0.62rem" }}>⭐</span>}
                                  <span style={{ color: "#f0faf4", fontSize: "0.78rem" }}>{abbrevName(pr.pick.golferName)}</span>
                                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.72rem", color: scoreColor(pr.score) }}>
                                    {pr.status === "cut" ? "CUT" : pr.status === "wd" ? "WD" : pr.status === "missing" ? "--" : formatScore(pr.score)}
                                  </span>
                                  {pr.status === "winner" && <span style={{ fontSize: "0.62rem" }}>🏆</span>}
                                </div>
                              ))}
                              <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.15)", margin: "0 2px" }} />
                              {notCounting.map((pr, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.15)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, padding: "3px 7px", opacity: 0.5 }}>
                                  {pr.pick.isTopPick && <span style={{ color: "#facc15", fontSize: "0.62rem" }}>*</span>}
                                  <span style={{ color: "#f0faf4", fontSize: "0.78rem", fontStyle: "italic" }}>{abbrevName(pr.pick.golferName)}</span>
                                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.72rem", color: "#6b7280", fontStyle: "italic" }}>
                                    {pr.status === "cut" ? "CUT" : pr.status === "wd" ? "WD" : pr.status === "missing" ? "--" : formatScore(pr.score)}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {ms.bonus !== 0 && (
                              <div style={{ color: "#facc15", fontSize: "0.72rem", marginTop: 5 }}>{ms.bonusReason}</div>
                            )}
                          </div>
                        );
                      })}
                      {!isMe && (
                        <button className="btn-secondary" style={{ fontSize: "0.75rem", padding: "4px 10px", marginTop: 6 }}
                          onClick={e => { e.stopPropagation(); router.push(`/head-to-head?a=${session?.entryId}&b=${entry.entryId}`); }}>
                          H2H vs me
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        ) : (

          /* PRE-TOURNAMENT ROSTER */
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "grid", gridTemplateColumns: gridCols, padding: "6px 16px", color: "var(--text-muted)", fontSize: "0.68rem", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <span>#</span><span>Entrant</span><span style={{ textAlign: "center" }}>Masters Picks</span>
            </div>
            {standings.map((entry, idx) => {
              const isMe = entry.entryId === session?.entryId;
              const hasPicks = isMe ? myPicksSubmitted : entry.completedMajors > 0;
              return (
                <div key={entry.entryId} className="leaderboard-row" style={{ animationDelay: `${idx * 0.02}s`, display: "grid", gridTemplateColumns: gridCols, padding: "11px 16px", alignItems: "center", background: isMe ? "rgba(77,189,136,0.08)" : "rgba(17,45,28,0.5)", border: `1px solid ${isMe ? "rgba(77,189,136,0.3)" : "var(--border)"}`, borderRadius: 10 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", color: "var(--text-muted)", fontSize: "0.88rem" }}>{idx + 1}</span>
                  <span style={{ color: isMe ? "var(--green-400)" : "#f0faf4", fontSize: "0.9rem", fontWeight: isMe ? 600 : 400, display: "flex", alignItems: "center", gap: 5 }}>
                    {entry.entrantName}
                    {isMe && <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>(you)</span>}
                  </span>
                  <div style={{ textAlign: "center" }}>
                    <span style={{ color: hasPicks ? "var(--green-400)" : "#f87171", fontSize: "0.78rem", fontWeight: hasPicks ? 600 : 400 }}>
                      {hasPicks ? "Submitted" : "Pending"}
                    </span>
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
