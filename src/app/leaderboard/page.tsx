"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/shared/Nav";
import { getSession } from "@/lib/auth";
import { formatScore, scoreColor } from "@/lib/scoring";
import type { EntryStandings, MajorId } from "@/types";

const MAJORS: { id: MajorId; name: string; short: string }[] = [
  { id: "masters", name: "The Masters", short: "Masters" },
  { id: "pga", name: "PGA Championship", short: "PGA" },
  { id: "us-open", name: "U.S. Open", short: "US Open" },
  { id: "british-open", name: "The Open Championship", short: "British" }
];

export default function LeaderboardPage() {
  const router = useRouter();
  const [standings, setStandings] = useState<EntryStandings[]>([]);
  const [activeMajor, setActiveMajor] = useState<MajorId | "overall">("overall");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const session = getSession();

  const fetchStandings = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard");
      if (res.ok) {
        const data = await res.json();
        setStandings(data.standings ?? []);
        setLastUpdated(new Date().toLocaleTimeString());
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

  const displayed = activeMajor === "overall"
    ? standings
    : [...standings].sort((a, b) =>
        (a.majorScores[activeMajor as MajorId]?.finalScore ?? 999) -
        (b.majorScores[activeMajor as MajorId]?.finalScore ?? 999)
      );

  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}>
      <Nav />
      <div style={{ maxWidth: 1060, margin: "0 auto", padding: "32px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "2rem", color: "#f0faf4", margin: 0 }}>Leaderboard</h1>
            {lastUpdated && <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
              Updated {lastUpdated} · auto-refreshes every 5 min
            </p>}
          </div>
          <button className="btn-secondary" style={{ fontSize: "0.85rem", padding: "7px 14px" }} onClick={fetchStandings}>↻ Refresh</button>
        </div>

        {/* Major tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {[{ id: "overall", short: "Overall" }, ...MAJORS].map(m => (
            <button key={m.id} onClick={() => setActiveMajor(m.id as any)} style={{
              padding: "6px 16px", borderRadius: 20,
              border: `1px solid ${activeMajor === m.id ? "var(--green-400)" : "var(--border)"}`,
              background: activeMajor === m.id ? "rgba(77,189,136,0.12)" : "transparent",
              color: activeMajor === m.id ? "var(--green-400)" : "var(--text-muted)",
              fontFamily: "'DM Sans', sans-serif", fontSize: "0.83rem",
              fontWeight: activeMajor === m.id ? 600 : 400, cursor: "pointer", transition: "all 0.15s"
            }}>{m.short}</button>
          ))}
        </div>

        {/* Legend */}
        <div style={{
          background: "rgba(17,45,28,0.5)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "10px 16px", marginBottom: 16,
          display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center"
        }}>
          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Scoring</span>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>Lower score = better · Best 3-of-5 picks per major</span>
          <span style={{ color: "#facc15", fontSize: "0.78rem" }}>🏆 winner picked · ⭐ top pick won · W = total winners</span>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>⛳</div>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85rem" }}>Loading standings…</p>
          </div>
        ) : standings.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>🏌️</div>
            <p style={{ color: "var(--text-muted)" }}>No entries yet — the pool opens soon.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {/* Column headers */}
            <div style={{
              display: "grid", gridTemplateColumns: "44px 1fr 72px 72px 72px 72px 90px 50px",
              padding: "6px 16px", color: "var(--text-muted)",
              fontSize: "0.7rem", fontFamily: "'DM Mono', monospace",
              textTransform: "uppercase", letterSpacing: "0.08em"
            }}>
              <span>#</span><span>Entrant</span>
              {MAJORS.map(m => <span key={m.id} style={{ textAlign: "center" }}>{m.short}</span>)}
              <span style={{ textAlign: "center" }}>Total</span>
              <span style={{ textAlign: "center" }}>W</span>
            </div>

            {displayed.map((entry, idx) => {
              const isMe = entry.entryId === session?.entryId;
              const isExpanded = expandedEntry === entry.entryId;
              const majorScore = activeMajor !== "overall" ? entry.majorScores[activeMajor as MajorId] : null;

              return (
                <div key={entry.entryId} className="leaderboard-row" style={{ animationDelay: `${idx * 0.025}s` }}>
                  <div
                    onClick={() => setExpandedEntry(isExpanded ? null : entry.entryId)}
                    style={{
                      display: "grid", gridTemplateColumns: "44px 1fr 72px 72px 72px 72px 90px 50px",
                      padding: "12px 16px", alignItems: "center", cursor: "pointer",
                      background: isMe ? "rgba(77,189,136,0.08)" : "rgba(17,45,28,0.5)",
                      border: `1px solid ${isMe ? "rgba(77,189,136,0.3)" : "var(--border)"}`,
                      borderRadius: isExpanded ? "10px 10px 0 0" : 10,
                      transition: "background 0.15s"
                    }}
                  >
                    <span style={{
                      fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: "0.9rem",
                      color: idx === 0 ? "#facc15" : idx === 1 ? "#d1d5db" : idx === 2 ? "#cd7c2f" : "var(--text-muted)"
                    }}>
                      {entry.rank}
                    </span>

                    <span style={{ color: isMe ? "var(--green-400)" : "#f0faf4", fontWeight: isMe ? 600 : 400, fontSize: "0.92rem", display: "flex", alignItems: "center", gap: 6 }}>
                      {entry.entrantName}
                      {isMe && <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>(you)</span>}
                    </span>

                    {MAJORS.map(m => {
                      const ms = entry.majorScores[m.id];
                      return (
                        <span key={m.id} style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: "0.85rem" }}>
                          {ms ? (
                            <span style={{ color: ms.finalScore < 0 ? "#f87171" : ms.finalScore === 0 ? "#f0faf4" : "#6b7280" }}>
                              {formatScore(ms.finalScore)}
                              {ms.winnersHit > 0 && "🏆"}
                              {ms.topPickWon && "⭐"}
                            </span>
                          ) : <span style={{ color: "var(--border)" }}>—</span>}
                        </span>
                      );
                    })}

                    <span style={{
                      textAlign: "center", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: "0.95rem",
                      color: activeMajor === "overall"
                        ? (entry.totalScore < 0 ? "#f87171" : entry.totalScore === 0 ? "#f0faf4" : "#6b7280")
                        : (majorScore ? (majorScore.finalScore < 0 ? "#f87171" : "#f0faf4") : "var(--border)")
                    }}>
                      {activeMajor === "overall" ? formatScore(entry.totalScore) : majorScore ? formatScore(majorScore.finalScore) : "—"}
                    </span>

                    <span style={{ textAlign: "center", color: entry.totalWinnersHit > 0 ? "#facc15" : "var(--border)", fontFamily: "'DM Mono', monospace", fontSize: "0.85rem" }}>
                      {entry.totalWinnersHit > 0 ? entry.totalWinnersHit : "—"}
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{
                      background: "rgba(10,31,20,0.95)", border: "1px solid var(--border)",
                      borderTop: "none", borderRadius: "0 0 10px 10px", padding: "16px 20px"
                    }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 14 }}>
                        <button className="btn-secondary" style={{ fontSize: "0.78rem", padding: "5px 12px" }}
                          onClick={e => { e.stopPropagation(); router.push(`/entry/${entry.entryId}`); }}>
                          Full entry →
                        </button>
                        {!isMe && (
                          <button className="btn-secondary" style={{ fontSize: "0.78rem", padding: "5px 12px" }}
                            onClick={e => { e.stopPropagation(); router.push(`/head-to-head?a=${session?.entryId}&b=${entry.entryId}`); }}>
                            H2H vs me →
                          </button>
                        )}
                      </div>
                      {MAJORS.map(m => {
                        const ms = entry.majorScores[m.id];
                        if (!ms) return null;
                        return (
                          <div key={m.id} style={{ marginBottom: 14 }}>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                              {m.name}
                              {ms.bonus !== 0 && <span style={{ color: "#facc15", marginLeft: 8 }}>· {ms.bonusReason}</span>}
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {ms.pickResults.map((pr, i) => (
                                <div key={i} style={{
                                  background: pr.counted ? "rgba(77,189,136,0.1)" : "rgba(0,0,0,0.2)",
                                  border: `1px solid ${pr.counted ? "rgba(77,189,136,0.3)" : "var(--border)"}`,
                                  borderRadius: 6, padding: "4px 10px", opacity: pr.counted ? 1 : 0.45,
                                  display: "flex", alignItems: "center", gap: 5
                                }}>
                                  {pr.pick.isTopPick && <span style={{ color: "#facc15", fontSize: "0.68rem" }}>⭐</span>}
                                  <span style={{ color: "#f0faf4", fontSize: "0.8rem" }}>{pr.pick.golferName}</span>
                                  <span style={{
                                    fontFamily: "'DM Mono', monospace", fontSize: "0.75rem",
                                    color: pr.status === "cut" || pr.status === "wd" || pr.status === "missing" ? "#6b7280"
                                      : pr.score < 0 ? "#f87171" : pr.score === 0 ? "#f0faf4" : "#6b7280"
                                  }}>
                                    {pr.status === "cut" ? "CUT" : pr.status === "wd" ? "WD" : pr.status === "missing" ? "?" : formatScore(pr.score)}
                                  </span>
                                  {pr.status === "winner" && <span style={{ fontSize: "0.68rem" }}>🏆</span>}
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
      </div>
    </div>
  );
}
