"use client";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/shared/Nav";
import { getSession } from "@/lib/auth";
import { formatScore } from "@/lib/scoring";
import { ODDS_BONUSES } from "@/types";
import type { EntryStandings, MajorId } from "@/types";

const MAJORS: { id: MajorId; name: string }[] = [
  { id: "masters", name: "The Masters" },
  { id: "pga", name: "PGA Championship" },
  { id: "us-open", name: "U.S. Open" },
  { id: "british-open", name: "The Open Championship" }
];

export default function EntryPage({ params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = use(params);
  const router = useRouter();
  const [standing, setStanding] = useState<EntryStandings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSession();
    if (!session) { router.push("/login"); return; }
    fetch("/api/leaderboard").then(r => r.json()).then(d => {
      const found = d.standings?.find((s: EntryStandings) => s.entryId === entryId);
      setStanding(found ?? null);
      setLoading(false);
    });
  }, [entryId, router]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}><Nav />
      <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-muted)" }}>Loading…</div>
    </div>
  );

  if (!standing) return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}><Nav />
      <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-muted)" }}>Entry not found.</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}>
      <Nav />
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 20px" }}>
        <button onClick={() => router.push("/leaderboard")} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.85rem", marginBottom: 16, fontFamily: "'DM Sans', sans-serif" }}>
          ← Back to Leaderboard
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "2rem", color: "#f0faf4", marginBottom: 4 }}>{standing.entrantName}</h1>
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontFamily: "'DM Mono', monospace" }}>Rank #{standing.rank} · {standing.totalWinnersHit} winner{standing.totalWinnersHit !== 1 ? "s" : ""} hit</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "2.5rem", fontWeight: 700, color: standing.totalScore < 0 ? "#f87171" : standing.totalScore === 0 ? "#f0faf4" : "#6b7280" }}>
              {formatScore(standing.totalScore)}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>cumulative total</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {MAJORS.map(m => {
            const ms = standing.majorScores?.[m.id];
            return (
              <div key={m.id} className="card" style={{ padding: "24px 28px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.2rem", color: "#f0faf4" }}>{m.name}</div>
                  {ms ? (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.3rem", fontWeight: 700, color: ms.finalScore < 0 ? "#f87171" : ms.finalScore === 0 ? "#f0faf4" : "#6b7280" }}>
                        {formatScore(ms.finalScore)}
                      </div>
                      {ms.bonus !== 0 && (
                        <div style={{ fontSize: "0.75rem", color: "#facc15", fontFamily: "'DM Mono', monospace" }}>
                          incl. {formatScore(ms.bonus)} bonus
                        </div>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No picks</span>
                  )}
                </div>

                {ms?.pickResults ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {ms.pickResults.map((pr, i) => (
                      <div key={i} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 14px", borderRadius: 8,
                        background: pr.counted ? "rgba(77,189,136,0.06)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${pr.counted ? "rgba(77,189,136,0.2)" : "rgba(255,255,255,0.05)"}`
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ color: pr.counted ? "var(--green-400)" : "rgba(77,189,136,0.3)", fontSize: "0.65rem" }}>●</span>
                          {pr.pick.isTopPick && <span style={{ color: "#facc15" }}>★</span>}
                          <span style={{ color: pr.counted ? "#f0faf4" : "var(--text-muted)", fontWeight: pr.counted ? 500 : 400 }}>
                            {pr.pick.golferName}
                          </span>
                          {pr.status === "winner" && <span style={{ fontSize: "0.85rem" }}>🏆</span>}
                          {pr.status === "cut" && <span style={{ color: "#ef4444", fontSize: "0.72rem", fontFamily: "'DM Mono', monospace" }}>CUT</span>}
                          {pr.status === "wd" && <span style={{ color: "#f59e0b", fontSize: "0.72rem", fontFamily: "'DM Mono', monospace" }}>WD</span>}
                        </div>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                          <span className={`tier-badge tier-${pr.pick.tier}`}>{ODDS_BONUSES[pr.pick.tier]?.oddsRange}</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.95rem", fontWeight: pr.counted ? 700 : 400, color: pr.score < 0 ? "#f87171" : pr.score === 0 ? "#f0faf4" : "#6b7280" }}>
                            {formatScore(pr.score)}
                          </span>
                        </div>
                      </div>
                    ))}

                    {ms.bonusReason && (
                      <div style={{ padding: "8px 14px", background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 8, fontSize: "0.8rem", color: "#facc15" }}>
                        ★ {ms.bonusReason}
                      </div>
                    )}

                    <div style={{ padding: "8px 14px", display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>
                      <span>● = counted (best 3 of 5) · ★ = Top Pick</span>
                      <span>Counted: {formatScore(ms.countedScore)}{ms.bonus !== 0 ? ` + bonus ${formatScore(ms.bonus)}` : ""}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "12px 0" }}>No picks submitted for this major.</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
