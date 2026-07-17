"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/shared/Nav";
import { getSession } from "@/lib/auth";
import { formatScore } from "@/lib/scoring";
import type { EntryStandings, MajorId } from "@/types";

const ALL_MAJORS: { id: MajorId; name: string; short: string; abbr: string }[] = [
  { id: "masters",      name: "The Masters",           short: "Masters",     abbr: "MST" },
  { id: "pga",          name: "PGA Championship",      short: "PGA",         abbr: "PGA" },
  { id: "us-open",      name: "U.S. Open",             short: "US Open",     abbr: "USO" },
  { id: "british-open", name: "The Open Championship", short: "British",     abbr: "BOC" }
];

const EXPANDED_MAJOR_ORDER: MajorId[] = ["british-open", "us-open", "pga", "masters"];

function abbrevName(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length < 2) return name;
  return parts[0][0] + ". " + parts.slice(1).join(" ");
}

// Mobile-only entrant abbreviation: first initial + title-cased last name
function abbreviateName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const titleCased = last.length ? last[0].toUpperCase() + last.slice(1).toLowerCase() : last;
  return `${first[0].toUpperCase()}. ${titleCased}`;
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
  const [currentMajorId, setCurrentMajorId] = useState<MajorId | null>(null);
  const [finalizedMajorIds, setFinalizedMajorIds] = useState<MajorId[]>([]);

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
        const currentMajor = (d.majors ?? []).find((m: any) =>
          m.status === "active" || m.status === "locked"
        );
        if (currentMajor) setCurrentMajorId(currentMajor.id as MajorId);
        const masters = (d.majors ?? []).find((m: any) => m.id === "masters");
        if (masters?.pickDeadline) setMasterDeadline(masters.pickDeadline);
        const finalized = (d.majors ?? [])
          .filter((m: any) => m.status === "finalized")
          .map((m: any) => m.id as MajorId);
        setFinalizedMajorIds(finalized);
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

  const visibleMajors = ALL_MAJORS.filter(m =>
    activeMajorIds.includes(m.id) ||
    standings.some(e => e.majorScores[m.id] !== undefined)
  );
  const tournamentStarted = activeMajorIds.length > 0;
  const myEntry = standings.find(e => e.entryId === session?.entryId);

  const displayed = viewMajor === "overall"
    ? standings
    : [...standings].sort((a, b) =>
        (a.majorScores[viewMajor as MajorId]?.finalScore ?? 999) -
        (b.majorScores[viewMajor as MajorId]?.finalScore ?? 999)
      );

  // on a specific major tab → only that major; on Overall → all active+finalized in reverse-chron order
  const expandedMajors = (() => {
    const majors = (finalizedMajorIds.includes(viewMajor as MajorId) || viewMajor === currentMajorId)
      ? visibleMajors.filter(m => m.id === viewMajor)
      : visibleMajors.filter(m => finalizedMajorIds.includes(m.id) || m.id === currentMajorId);
    return [...majors].sort((a, b) => {
      const ai = EXPANDED_MAJOR_ORDER.indexOf(a.id);
      const bi = EXPANDED_MAJOR_ORDER.indexOf(b.id);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    });
  })();

  function getScore(e: EntryStandings) {
    if (viewMajor === "overall") return e.totalScore;
    return e.majorScores[viewMajor as MajorId]?.finalScore ?? null;
  }

  function scoreColor(score: number | null): string {
    if (score === null) return "var(--border)";
    if (score < 0) return "#e8c96a";
    if (score === 0) return "#f5f0e8";
    return "#6b7280";
  }

  const activeTabMajor = viewMajor === "overall" ? null : ALL_MAJORS.find(m => m.id === viewMajor);
  const overallScoreCols = visibleMajors.map(() => "52px").join(" ");
  const gridCols = !tournamentStarted
    ? "44px 1fr 160px"
    : viewMajor !== "overall"
      ? "32px 1fr 60px 64px 28px 28px"
      : `32px 1fr ${overallScoreCols} 60px 28px 28px`;

  const deadlineFormatted = formatDeadline(masterDeadline);
  const countdown = formatCountdown(masterDeadline);

  // Pre-tournament personal ribbon
  function PreTournamentRibbon() {
    if (!session || tournamentStarted) return null;
    const submitted = myPicksSubmitted;
    return (
      <div style={{
        background: submitted ? "rgba(15,32,64,0.85)" : "rgba(40,15,15,0.85)",
        border: `1px solid ${submitted ? "rgba(240,192,64,0.35)" : "rgba(239,68,68,0.35)"}`,
        borderRadius: 12, padding: "20px 24px", marginBottom: 20
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 4 }}>Your Entry</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.25rem", color: "#f0faf4", fontWeight: 700, marginBottom: 8 }}>
              {session.entrantName}
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: submitted ? "rgba(240,192,64,0.15)" : "rgba(239,68,68,0.15)", border: `1px solid ${submitted ? "rgba(240,192,64,0.35)" : "rgba(239,68,68,0.35)"}`, borderRadius: 6, padding: "3px 10px", marginBottom: 8 }}>
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
    const activeMajorId = currentMajorId; // null when all majors are finalized
    const ms = activeMajorId ? myEntry.majorScores[activeMajorId] ?? null : null;
    const sortedPicks = ms?.pickResults ? [...ms.pickResults].sort((a, b) => a.score - b.score) : [];
    const counting = sortedPicks.slice(0, 3);
    const notCounting = sortedPicks.slice(3);
    const trackerMajorName = activeMajorId ? ALL_MAJORS.find(m => m.id === activeMajorId)?.name ?? "" : "";

    const majorLabelMap: Record<string, string> = {
      "us-open": "US OPEN", "british-open": "THE OPEN",
      "masters": "MASTERS", "pga": "PGA"
    };
    const activeMajorLabel = activeMajorId
      ? (majorLabelMap[activeMajorId] ?? activeMajorId.replace(/-/g, " ").toUpperCase())
      : null;

    return (
      <div style={{
        background: "linear-gradient(135deg, rgba(10,32,64,0.9) 0%, rgba(15,32,64,0.95) 100%)",
        border: "1px solid rgba(240,192,64,0.35)", borderRadius: 12, padding: "16px", marginBottom: 20
      }}>
        <div style={{ marginBottom: ms && sortedPicks.length > 0 ? 12 : 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.15rem", color: "#f0faf4", fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {myEntry.entrantName}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexShrink: 0 }}>
              {activeMajorLabel && ms && (
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.15rem", fontWeight: 700, color: scoreColor(ms.finalScore) }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.62rem", fontWeight: 600, marginRight: 4 }}>OPEN</span>
                  {formatScore(ms.finalScore)}
                </div>
              )}
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.15rem", fontWeight: 700, color: scoreColor(myEntry.totalScore) }}>
                <span style={{ color: "var(--text-muted)", fontSize: "0.62rem", fontWeight: 600, marginRight: 4 }}>TOTAL</span>
                {formatScore(myEntry.totalScore)}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.15rem", fontWeight: 700, color: "#facc15" }}>#{myEntry.rank}</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.62rem" }}>of {standings.length}</div>
              </div>
            </div>
          </div>
          {ms?.bonus !== 0 && ms && <div style={{ color: "#facc15", fontSize: "0.7rem", marginTop: 2, textAlign: "right" }}>{ms.bonusReason}</div>}

          {/* All major scores summary */}
          <div style={{ display: "flex", flexWrap: "wrap", marginTop: 6, opacity: 0.65 }}>
            {[
              { id: "masters" as const, abbr: "MST" },
              { id: "pga" as const, abbr: "PGA" },
              { id: "us-open" as const, abbr: "USO" },
              { id: "british-open" as const, abbr: "OPEN" },
            ].map(({ id, abbr }, i) => {
              const mScore = myEntry.majorScores[id];
              const val = mScore?.finalScore;
              return (
                <span key={id} style={{ fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", color: "var(--text-muted)" }}>
                  {i > 0 && " | "}
                  {abbr}:{" "}
                  <span style={{ color: val !== undefined ? scoreColor(val) : "var(--border)", fontWeight: 600 }}>
                    {val !== undefined ? formatScore(val) : "--"}
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        {ms && sortedPicks.length > 0 && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 14 }}>
            <div style={{ color: "var(--text-muted)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              {trackerMajorName} Picks — Best 3 Count
            </div>
            {/* TODO: render "(Thru N)" next to the golfer once PickResult/GolferScore expose a thru/currentHole field — not present on the current data shape */}
            {counting.map((pr, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#c9a84c", fontSize: "0.68rem", fontFamily: "'DM Mono', monospace", width: 18 }}>#{i+1}</span>
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
        )}
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
            {[{ id: "overall", short: "Overall" }, ...[...visibleMajors].reverse()].map(t => (
              <button key={t.id} onClick={() => setViewMajor(t.id as any)} style={{
                padding: "6px 16px", borderRadius: 20,
                border: `1px solid ${viewMajor === t.id ? "var(--green-400)" : "var(--border)"}`,
                background: viewMajor === t.id ? "rgba(240,192,64,0.12)" : "transparent",
                color: viewMajor === t.id ? "var(--green-400)" : "var(--text-muted)",
                fontFamily: "'DM Sans', sans-serif", fontSize: "0.83rem",
                fontWeight: viewMajor === t.id ? 600 : 400, cursor: "pointer"
              }}>{t.short}</button>
            ))}
          </div>
        )}

        {/* Legend */}
        {tournamentStarted && (
          <div style={{ background: "rgba(15,32,64,0.5)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 16px", marginBottom: 14, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Key</span>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.76rem" }}>Lower = better · Best 3-of-5 count</span>
            {viewMajor === "overall"
              ? <span style={{ color: "#facc15", fontSize: "0.76rem" }}>🏆 = top 3 includes leader · ⭐ = top pick leading · Tap row for picks</span>
              : <span style={{ color: "#facc15", fontSize: "0.76rem" }}>⭐ = your Slot 1 pick won this major · 🏆 = one of your top 3 picks won this major · Tap row for picks</span>
            }
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
            <div className="lb-scored-grid" style={{ display: "grid", gridTemplateColumns: gridCols, columnGap: 0, padding: "5px 6px", color: "var(--text-muted)", fontSize: "0.62rem", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <span style={{ textAlign: "center" }}>#</span>
              <span style={{ paddingLeft: 4 }}>Entrant</span>
              {viewMajor === "overall"
                ? visibleMajors.map(m => (
                    <span key={m.id} className={m.id !== "british-open" ? "lb-hide-mobile" : undefined} style={{ textAlign: "center" }}>
                      {m.id === "british-open"
                        ? <>
                            <span className="lb-label-desktop">{m.abbr}</span>
                            <span className="lb-label-mobile">OPEN</span>
                          </>
                        : m.abbr}
                    </span>
                  ))
                : <span style={{ textAlign: "center" }}>
                    {ALL_MAJORS.find(m => m.id === viewMajor)?.short ?? "Score"}
                  </span>
              }
              <span style={{ textAlign: "center", background: "rgba(255,255,255,0.03)" }}>
                <span className="lb-label-desktop">Season</span>
                <span className="lb-label-mobile">Total</span>
              </span>
              <span className="lb-hide-mobile" style={{ textAlign: "center" }}>TP</span>
              <span className="lb-hide-mobile" style={{ textAlign: "center", background: "rgba(255,255,255,0.03)" }}>W</span>
            </div>

            {displayed.map((entry, idx) => {
              const isMe = entry.entryId === session?.entryId;
              const isExpanded = expandedEntry === entry.entryId;
              const score = getScore(entry);
              const latestMs = viewMajor !== "overall"
                ? entry.majorScores[viewMajor as MajorId]
                : currentMajorId
                  ? entry.majorScores[currentMajorId]
                  : visibleMajors.length > 0 ? entry.majorScores[visibleMajors[visibleMajors.length - 1].id] : null;
              // Score cell suffix: on overall tab show live-leader indicator for active major only.
              // TODO: when currentLeader / liveLeaderName exists on MajorScore or standings,
              //       compare entry picks case-insensitively against it:
              //         topPick match → " ⭐" (priority), any top-3 match → " 🏆"
              const scoreSuffix = latestMs
                ? viewMajor !== "overall"
                  ? (latestMs.topPickWon ? " ⭐" : latestMs.winnersHit > 0 ? " 🏆" : "")
                  : !latestMs.finalized
                    ? (latestMs.topPickWon ? " ⭐" : latestMs.winnersHit > 0 ? " 🏆" : "")
                    : ""
                : "";

              return (
                <div key={entry.entryId} className="leaderboard-row" style={{ animationDelay: `${idx * 0.02}s` }}>
                  <div
                    onClick={() => setExpandedEntry(isExpanded ? null : entry.entryId)}
                    className="lb-scored-grid"
                    style={{
                      display: "grid", gridTemplateColumns: gridCols, columnGap: 0,
                      padding: "7px 6px", minHeight: 40, alignItems: "center", cursor: "pointer",
                      background: isMe ? "rgba(201,168,76,0.08)" : "rgba(15,32,64,0.5)",
                      border: `1px solid ${isMe ? "rgba(201,168,76,0.3)" : "var(--border)"}`,
                      borderRadius: isExpanded ? "10px 10px 0 0" : 10
                    }}
                  >
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: "0.75rem", color: idx === 0 ? "#facc15" : idx === 1 ? "#d1d5db" : idx === 2 ? "#cd7c2f" : "var(--text-muted)", textAlign: "center" }}>
                      {entry.rank}
                    </span>
                    <span style={{ color: isMe ? "var(--green-400)" : "#f0faf4", fontSize: "0.78rem", fontWeight: isMe ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, paddingLeft: 4, paddingRight: 4 }}>
                      <span className="lb-name-full">{entry.entrantName}</span>
                      <span className="lb-name-abbr">{abbreviateName(entry.entrantName)}</span>
                      {isMe && <span style={{ fontSize: "0.58rem", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>(you)</span>}
                    </span>
                    {viewMajor === "overall"
                      ? visibleMajors.map(m => {
                          const ms = entry.majorScores[m.id];
                          return (
                            <span key={m.id} className={m.id !== "british-open" ? "lb-hide-mobile" : undefined} style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: "0.72rem" }}>
                              {ms
                                ? <span style={{ color: scoreColor(ms.finalScore), fontWeight: 700 }}>
                                    {formatScore(ms.finalScore)}
                                  </span>
                                : <span style={{ color: "var(--border)" }}>--</span>}
                            </span>
                          );
                        })
                      : <span style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: "0.72rem" }}>
                          {latestMs
                            ? <span style={{ color: scoreColor(latestMs.finalScore), fontWeight: 700 }}>
                                {formatScore(latestMs.finalScore)}{scoreSuffix}
                              </span>
                            : <span style={{ color: "var(--border)" }}>--</span>}
                        </span>
                    }
                    <span style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: "0.78rem", color: scoreColor(entry.totalScore), background: "rgba(255,255,255,0.03)" }}>
                      {entry.totalScore !== null ? formatScore(entry.totalScore) : "--"}
                    </span>
                    <span className="lb-hide-mobile" style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: "0.72rem", color: entry.totalTopPickWins > 0 ? "#c9a84c" : "var(--border)" }}>
                      {viewMajor === "overall"
                        ? (entry.totalTopPickWins > 0 ? entry.totalTopPickWins : "--")
                        : (entry.majorScores[viewMajor as MajorId]?.topPickWon ? "⭐" : "--")}
                    </span>
                    <span className="lb-hide-mobile" style={{ textAlign: "center", color: entry.totalWinnersHit > 0 ? "#c9a84c" : "var(--border)", fontFamily: "'DM Mono', monospace", fontSize: "0.72rem", background: "rgba(255,255,255,0.03)" }}>
                      {viewMajor === "overall"
                        ? (entry.totalWinnersHit > 0 ? entry.totalWinnersHit : "--")
                        : ((entry.majorScores[viewMajor as MajorId]?.winnersHit ?? 0) >= 1 ? "🏆" : "--")}
                    </span>
                  </div>

                  {/* Expanded picks — finalized majors only, list format */}
                  {isExpanded && (
                    <div style={{ background: "rgba(10,22,40,0.95)", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "14px 18px" }}>
                      {expandedMajors.map((m, i) => {
                        const ms = entry.majorScores[m.id];
                        const sectionStyle = { marginTop: i > 0 ? 14 : 0, paddingTop: i > 0 ? 14 : 0, borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : "none" };
                        const headerStyle = { color: "var(--text-muted)" as const, fontSize: "0.65rem", textTransform: "uppercase" as const, letterSpacing: "0.1em", fontWeight: 700, marginBottom: 6 };

                        if (!ms || !ms.pickResults || ms.pickResults.length === 0) {
                          return (
                            <div key={m.id} style={sectionStyle}>
                              <div style={headerStyle}>{m.name} Picks — Best 3 Count</div>
                              <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontStyle: "italic", margin: 0 }}>
                                No picks submitted — penalty applied
                              </p>
                            </div>
                          );
                        }

                        const sortedPicks = [...ms.pickResults].sort((a, b) => a.score - b.score);
                        const counting = sortedPicks.slice(0, 3);
                        const notCounting = sortedPicks.slice(3);

                        return (
                          <div key={m.id} style={sectionStyle}>
                            <div style={headerStyle}>{m.name} Picks — Best 3 Count</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.0rem", fontWeight: 700, color: ms.finalScore < 0 ? "#e8c96a" : ms.finalScore === 0 ? "#f5f0e8" : "#6b7280" }}>
                                {ms.finalScore === 0 ? "E" : ms.finalScore > 0 ? `+${ms.finalScore}` : `${ms.finalScore}`}
                              </span>
                              {ms.bonus !== 0 && <span style={{ color: "#c9a84c", fontSize: "0.72rem" }}>{ms.bonusReason}</span>}
                            </div>
                            {/* TODO: render "(Thru N)" next to the golfer once PickResult/GolferScore expose a thru/currentHole field — not present on the current data shape */}
                            {counting.map((pr, j) => (
                              <div key={j} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: j < 2 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ color: "#c9a84c", fontSize: "0.68rem", fontFamily: "'DM Mono', monospace", width: 20 }}>#{j+1}</span>
                                  {pr.pick.isTopPick && <span style={{ fontSize: "0.68rem" }}>⭐</span>}
                                  <span style={{ color: "#f0faf4", fontSize: "0.83rem", fontWeight: 500 }}>{pr.pick.golferName}</span>
                                  {pr.status === "winner" && <span style={{ fontSize: "0.68rem" }}>🏆</span>}
                                </div>
                                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.8rem", fontWeight: 700, color: scoreColor(pr.score) }}>
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
                                {notCounting.map((pr, j) => (
                                  <div key={j} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", opacity: 0.45 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      {pr.pick.isTopPick && <span style={{ color: "#facc15", fontSize: "0.66rem" }}>*</span>}
                                      <span style={{ color: "#f0faf4", fontSize: "0.78rem", fontStyle: "italic" }}>{pr.pick.golferName}</span>
                                    </div>
                                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.75rem", color: "#6b7280", fontStyle: "italic" }}>
                                      {pr.status === "cut" ? "CUT" : pr.status === "wd" ? "WD" : pr.status === "missing" ? "--" : formatScore(pr.score)}
                                    </span>
                                  </div>
                                ))}
                              </>
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
                <div key={entry.entryId} className="leaderboard-row" style={{ animationDelay: `${idx * 0.02}s`, display: "grid", gridTemplateColumns: gridCols, padding: "11px 16px", alignItems: "center", background: isMe ? "rgba(201,168,76,0.08)" : "rgba(15,32,64,0.5)", border: `1px solid ${isMe ? "rgba(201,168,76,0.3)" : "var(--border)"}`, borderRadius: 10 }}>
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
