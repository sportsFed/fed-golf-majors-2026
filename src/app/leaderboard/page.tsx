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

export default function LeaderboardPage() {
  const router = useRouter();
  const session = getSession();
  const [standings, setStandings] = useState<EntryStandings[]>([]);
  const [activeMajors, setActiveMajors] = useState<MajorId[]>([]);
  const [viewMajor, setViewMajor] = useState<MajorId | "overall">("overall");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const fetchStandings = useCallback(async () => {
    try {
      const [lbRes, majorsRes] = await Promise.all([
        fetch("/api/leaderboard"),
        fetch("/api/majors")
      ]);
      if (lbRes.ok) {
        const data = await lbRes.json();
        setStandings(data.standings ?? []);
        setLastUpdated(new Date().toLocaleTimeString());
      }
      if (majorsRes.ok) {
        const data = await majorsRes.json();
        // Only show columns for majors that have started (locked/active/finalized)
        const active = (data.majors ?? [])
          .filter((m: any) => ["locked","active","finalized"].includes(m.status))
          .map((m: any) => m.id as MajorId);
        setActiveMajors(active);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!session) { router.push("/login"); return; }
    fetchStandings();
    const iv = setInterval(fetchStandings, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  const visibleMajors = ALL_MAJORS.filter(m => activeMajors.includes(m.id));

  // For the tab filter — only show tabs for active majors
  const tabs = [
    { id: "overall" as const, short: "Overall" },
    ...visibleMajors
  ];

  const displayed = viewMajor === "overall"
    ? standings
    : [...standings].sort((a, b) =>
        (a.majorScores[viewMajor as MajorId]?.finalScore ?? 999) -
        (b.majorScores[viewMajor as MajorId]?.finalScore ?? 999)
      );

  function getScore(entry: EntryStandings) {
    if (viewMajor === "overall") return entry.totalScore;
    return entry.majorScores[viewMajor as MajorId]?.finalScore ?? null;
  }

  function scoreStyle(score: number | null) {
    if (score === null) return { color: "var(--border)" };
    if (score < 0) return { color: "#f87171", fontWeight: 700 };
    if (score === 0) return { color: "#f0faf4", fontWeight: 700 };
    return { color: "#6b7280" };
  }

  // Dynamic grid: rank + name + one col per active major + total + W
  const colCount = 2 + visibleMajors.length + 2;
  const gridCols = `44px 1fr ${visibleMajors.map(() => "80px").join(" ")} 90px 48px`;

  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}>
      <Nav />
      <div style={{ maxWidth: 1060, margin: "0 auto", padding: "32px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "2rem", color: "#f0faf4", margin: 0 }}>Leaderboard</h1>
            {lastUpdated && <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4, fontFamily: "'DM Mono', monospace" }}>Updated {lastUpdated} · auto-refreshes every 5 min</p>}
          </div>
          <button className="btn-secondary" style={{ fontSize: "0.85rem", padding: "7px 14px" }} onClick={fetchStandings}>↻ Refresh</button>
        </div>

        {/* Tabs — only show active majors */}
        {tabs.length > 1 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setViewMajor(t.id as any)} style={{ padding: "6px 16px", borderRadius: 20, border: `1px solid ${viewMajor===t.id?"var(--green-400)":"var(--border)"}`, background: viewMajor===t.id?"rgba(77,189,136,0.12)":"transparent", color: viewMajor===t.id?"var(--green-400)":"var(--text-muted)", fontFamily: "'DM Sans', sans-serif", fontSize: "0.83rem", fontWeight: viewMajor===t.id?600:400, cursor: "pointer" }}>
                {t.short}
              </button>
            ))}
          </div>
        )}

        {/* Legend */}
        <div style={{ background: "rgba(17,45,28,0.5)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", marginBottom: 16, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Key</span>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>Lower score = better · Best 3-of-5 picks per major count</span>
          <span style={{ color: "#facc15", fontSize: "0.78rem" }}>🏆 = winner picked · ⭐ = top pick won · W = winners total</span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>⛳</div>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85rem" }}>Loading standings…</p>
          </div>
        ) : standings.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>🏌️</div>
            <p style={{ color: "var(--text-muted)", marginBottom: 8 }}>No entries yet — the pool opens soon.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {/* Column headers */}
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
                <div key={entry.entryId} className="leaderboard-row" style={{ animationDelay: `${idx * 0.025}s` }}>
                  <div
                    onClick={() => setExpandedEntry(isExpanded ? null : entry.entryId)}
                    style={{ display: "grid", gridTemplateColumns: gridCols, padding: "12px 16px", alignItems: "center", cursor: "pointer", background: isMe ? "rgba(77,189,136,0.08)" : "rgba(17,45,28,0.5)", border: `1px solid ${isMe ? "rgba(77,189,136,0.3)" : "var(--border)"}`, borderRadius: isExpanded ? "10px 10px 0 0" : 10 }}>

                    {/* Rank */}
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: "0.9rem", color: idx===0?"#facc15":idx===1?"#d1d5db":idx===2?"#cd7c2f":"var(--text-muted)" }}>
                      {entry.rank}
                    </span>

                    {/* Name */}
                    <span style={{ color: isMe ? "var(--green-400)" : "#f0faf4", fontWeight: isMe ? 600 : 400, fontSize: "0.92rem", display: "flex", alignItems: "center", gap: 6 }}>
                      {entry.entrantName}
                      {isMe && <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>(you)</span>}
                    </span>

                    {/* Per-major scores — only active majors */}
                    {visibleMajors.map(m => {
                      const ms = entry.majorScores[m.id];
                      return (
                        <span key={m.id} style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: "0.85rem" }}>
                          {ms ? (
                            <span style={scoreStyle(ms.finalScore)}>
                              {formatScore(ms.finalScore)}
                              {ms.winnersHit > 0 && "🏆"}
                              {ms.topPickWon && "⭐"}
                            </span>
                          ) : <span style={{ color: "var(--border)" }}>—</span>}
                        </span>
                      );
                    })}

                    {/* Total */}
                    <span style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: "0.95rem", ...scoreStyle(score) }}>
                      {score !== null ? formatScore(score) : "—"}
                    </span>

                    {/* Winners */}
                    <span style={{ textAlign: "center", color: entry.totalWinnersHit > 0 ? "#facc15" : "var(--border)", fontFamily: "'DM Mono', monospace", fontSize: "0.85rem" }}>
                      {entry.totalWinnersHit > 0 ? entry.totalWinnersHit : "—"}
                    </span>
                  </div>

                  {/* Expanded pick detail */}
                  {isExpanded && (
                    <div style={{ background: "rgba(10,31,20,0.95)", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "16px 20px" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 14 }}>
                        <button className="btn-secondary" style={{ fontSize: "0.78rem", padding: "5px 12px" }} onClick={e => { e.stopPropagation(); router.push(`/entry/${entry.entryId}`); }}>Full entry →</button>
                        {!isMe && <button className="btn-secondary" style={{ fontSize: "0.78rem", padding: "5px 12px" }} onClick={e => { e.stopPropagation(); router.push(`/head-to-head?a=${session?.entryId}&b=${entry.entryId}`); }}>H2H vs me →</button>}
                      </div>
                      {visibleMajors.map(m => {
                        const ms = entry.majorScores[m.id];
                        if (!ms) return null;
                        return (
                          <div key={m.id} style={{ marginBottom: 14 }}>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                              {m.name}{ms.bonus !== 0 && <span style={{ color: "#facc15", marginLeft: 8 }}>· {ms.bonusReason}</span>}
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {ms.pickResults.map((pr, i) => (
                                <div key={i} style={{ background: pr.counted ? "rgba(77,189,136,0.1)" : "rgba(0,0,0,0.2)", border: `1px solid ${pr.counted ? "rgba(77,189,136,0.3)" : "var(--border)"}`, borderRadius: 6, padding: "4px 10px", opacity: pr.counted ? 1 : 0.45, display: "flex", alignItems: "center", gap: 5 }}>
                                  {pr.pick.isTopPick && <span style={{ color: "#facc15", fontSize: "0.65rem" }}>⭐</span>}
                                  <span style={{ color: "#f0faf4", fontSize: "0.8rem" }}>{pr.pick.golferName}</span>
                                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.72rem", color: pr.score < 0 ? "#f87171" : pr.score === 0 ? "#f0faf4" : "#6b7280" }}>
                                    {pr.status === "cut" ? "CUT" : pr.status === "wd" ? "WD" : pr.status === "missing" ? "?" : formatScore(pr.score)}
                                  </span>
                                  {pr.status === "winner" && <span>🏆</span>}
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
        )}

        {/* Pre-tournament state — show all entrants */}
        {!loading && standings.length > 0 && activeMajors.length === 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", textAlign: "center", marginBottom: 16 }}>
              Scores will appear here once The Masters begins Thursday.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 120px", padding: "6px 16px", color: "var(--text-muted)", fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                <span>#</span><span>Entrant</span><span style={{ textAlign: "center" }}>Picks</span>
              </div>
              {standings.map((entry, idx) => (
                <div key={entry.entryId} className="leaderboard-row" style={{ animationDelay: `${idx * 0.02}s`, display: "grid", gridTemplateColumns: "44px 1fr 120px", padding: "11px 16px", alignItems: "center", background: entry.entryId===session?.entryId?"rgba(77,189,136,0.08)":"rgba(17,45,28,0.5)", border: `1px solid ${entry.entryId===session?.entryId?"rgba(77,189,136,0.3)":"var(--border)"}`, borderRadius: 10 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", color: "var(--text-muted)", fontSize: "0.88rem" }}>{idx+1}</span>
                  <span style={{ color: entry.entryId===session?.entryId?"var(--green-400)":"#f0faf4", fontSize: "0.92rem", fontWeight: entry.entryId===session?.entryId?600:400 }}>
                    {entry.entrantName}
                    {entry.entryId===session?.entryId && <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", marginLeft: 6 }}>(you)</span>}
                  </span>
                  <span style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.78rem" }}>
                    {entry.completedMajors > 0 ? `${entry.completedMajors}/4 submitted` : "picks pending"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}