"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Nav from "@/components/shared/Nav";
import { getSession } from "@/lib/auth";
import { formatScore } from "@/lib/scoring";
import type { EntryStandings, MajorId } from "@/types";

const MAJORS: { id: MajorId; name: string }[] = [
  { id: "masters", name: "The Masters" },
  { id: "pga", name: "PGA Championship" },
  { id: "us-open", name: "U.S. Open" },
  { id: "british-open", name: "The Open Championship" }
];

function H2HContent() {
  const router = useRouter();
  const params = useSearchParams();
  const session = getSession();
  const [allEntries, setAllEntries] = useState<EntryStandings[]>([]);
  const [entryA, setEntryA] = useState(params.get("a") ?? "");
  const [entryB, setEntryB] = useState(params.get("b") ?? "");
  const [detailA, setDetailA] = useState<any>(null);
  const [detailB, setDetailB] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) { router.push("/login"); return; }
    fetch("/api/leaderboard").then(r => r.json()).then(d => {
      setAllEntries(d.standings ?? []);
      setLoading(false);
      if (!entryA && session) setEntryA(session.entryId);
    });
  }, []);

  useEffect(() => { if (entryA) fetch(`/api/entry/${entryA}`).then(r => r.json()).then(setDetailA); }, [entryA]);
  useEffect(() => { if (entryB) fetch(`/api/entry/${entryB}`).then(r => r.json()).then(setDetailB); }, [entryB]);

  const standingA = allEntries.find(e => e.entryId === entryA);
  const standingB = allEntries.find(e => e.entryId === entryB);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "2rem", color: "#f0faf4", marginBottom: 6 }}>Head to Head</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: 28 }}>Compare any two entries across all majors.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, alignItems: "center", marginBottom: 32 }}>
        <div>
          <label style={{ display: "block", color: "var(--text-muted)", fontSize: "0.72rem", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Entry A</label>
          <select className="input" value={entryA} onChange={e => setEntryA(e.target.value)}>
            <option value="">Select entry…</option>
            {allEntries.map(e => <option key={e.entryId} value={e.entryId}>{e.entrantName}{e.entryId === session?.entryId ? " (you)" : ""}</option>)}
          </select>
        </div>
        <div style={{ color: "var(--text-muted)", fontFamily: "'Playfair Display', serif", fontSize: "1.3rem", paddingTop: 22, textAlign: "center" }}>vs</div>
        <div>
          <label style={{ display: "block", color: "var(--text-muted)", fontSize: "0.72rem", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Entry B</label>
          <select className="input" value={entryB} onChange={e => setEntryB(e.target.value)}>
            <option value="">Select entry…</option>
            {allEntries.filter(e => e.entryId !== entryA).map(e => <option key={e.entryId} value={e.entryId}>{e.entrantName}</option>)}
          </select>
        </div>
      </div>

      {standingA && standingB ? (
        <>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr auto 1fr",
            background: "rgba(17,45,28,0.7)", border: "1px solid var(--border)",
            borderRadius: 12, padding: "20px 24px", marginBottom: 20, alignItems: "center"
          }}>
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.05rem", color: "#f0faf4", marginBottom: 4 }}>{standingA.entrantName}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.5rem", fontWeight: 700, color: standingA.totalScore <= standingB.totalScore ? "#facc15" : "#f87171" }}>{formatScore(standingA.totalScore)}</div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginTop: 4 }}>Rank #{standingA.rank} · {standingA.totalWinnersHit} winners</div>
            </div>
            <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
              {standingA.totalScore < standingB.totalScore ? "leads by" : standingA.totalScore === standingB.totalScore ? "🤝 tied" : "trails by"}
              {standingA.totalScore !== standingB.totalScore && (
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.1rem", color: "#facc15", marginTop: 4 }}>
                  {Math.abs(standingA.totalScore - standingB.totalScore)}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.05rem", color: "#f0faf4", marginBottom: 4 }}>{standingB.entrantName}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.5rem", fontWeight: 700, color: standingB.totalScore <= standingA.totalScore ? "#facc15" : "#f87171" }}>{formatScore(standingB.totalScore)}</div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginTop: 4 }}>Rank #{standingB.rank} · {standingB.totalWinnersHit} winners</div>
            </div>
          </div>

          {MAJORS.map(m => {
            const msA = standingA.majorScores[m.id];
            const msB = standingB.majorScores[m.id];
            if (!msA && !msB) return null;
            const sA = msA?.finalScore ?? null;
            const sB = msB?.finalScore ?? null;
            return (
              <div key={m.id} className="card" style={{ padding: "16px 20px", marginBottom: 10 }}>
                <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontWeight: 600 }}>{m.name}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 20px 1fr", gap: 12 }}>
                  <div>
                    {sA !== null && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.1rem", fontWeight: 700, color: sA !== null && sB !== null && sA <= sB ? "#facc15" : "#f87171", marginBottom: 8 }}>{formatScore(sA)}</div>}
                    {msA?.pickResults.map((pr, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3, opacity: pr.counted ? 1 : 0.4 }}>
                        {pr.pick.isTopPick && <span style={{ fontSize: "0.62rem", color: "#facc15" }}>⭐</span>}
                        <span style={{ color: pr.counted ? "#f0faf4" : "var(--text-muted)", fontSize: "0.8rem", flex: 1 }}>{pr.pick.golferName}</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.72rem", color: pr.score < 0 ? "#f87171" : "#6b7280" }}>
                          {pr.status === "cut" ? "CUT" : pr.status === "wd" ? "WD" : pr.status === "missing" ? "?" : formatScore(pr.score)}
                        </span>
                        {pr.status === "winner" && <span>🏆</span>}
                      </div>
                    ))}
                    {msA?.bonus !== 0 && <div style={{ color: "#facc15", fontSize: "0.72rem", marginTop: 4 }}>{msA?.bonusReason}</div>}
                  </div>
                  <div style={{ color: "var(--border)", textAlign: "center" }}>|</div>
                  <div>
                    {sB !== null && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.1rem", fontWeight: 700, color: sB !== null && sA !== null && sB <= sA ? "#facc15" : "#f87171", marginBottom: 8 }}>{formatScore(sB)}</div>}
                    {msB?.pickResults.map((pr, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3, opacity: pr.counted ? 1 : 0.4 }}>
                        {pr.pick.isTopPick && <span style={{ fontSize: "0.62rem", color: "#facc15" }}>⭐</span>}
                        <span style={{ color: pr.counted ? "#f0faf4" : "var(--text-muted)", fontSize: "0.8rem", flex: 1 }}>{pr.pick.golferName}</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.72rem", color: pr.score < 0 ? "#f87171" : "#6b7280" }}>
                          {pr.status === "cut" ? "CUT" : pr.status === "wd" ? "WD" : pr.status === "missing" ? "?" : formatScore(pr.score)}
                        </span>
                        {pr.status === "winner" && <span>🏆</span>}
                      </div>
                    ))}
                    {msB?.bonus !== 0 && <div style={{ color: "#facc15", fontSize: "0.72rem", marginTop: 4 }}>{msB?.bonusReason}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      ) : !loading && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>⚔️</div>
          <p>Select two entries above to compare them.</p>
        </div>
      )}
    </div>
  );
}

export default function HeadToHeadPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}>
      <Nav />
      <Suspense fallback={<div style={{ padding: "60px", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
        <H2HContent />
      </Suspense>
    </div>
  );
}
