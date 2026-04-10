"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/shared/Nav";
import { getSession } from "@/lib/auth";
import { formatScore } from "@/lib/scoring";

const MAJOR_IDS = ["masters", "pga", "us-open", "british-open"];
const MAJOR_NAMES: Record<string, string> = {
  masters: "The Masters", pga: "PGA Championship",
  "us-open": "U.S. Open", "british-open": "The Open Championship"
};

interface GolferStat {
  name: string;
  totalPicks: number;
  topPickCount: number;
  countingPicks: number;
  notCountingPicks: number;
  cutPicks: number;
  currentScore: number | null;
  position: string;
}

interface AnalysisData {
  majorId: string;
  totalEntries: number;
  entriesWithPicks: number;
  totalPicksAcrossPool: number;
  uniqueGolfers: number;
  cutPickCount: number;
  cutPickRate: number;
  consensusScore: number;
  mostPicked: GolferStat;
  mostTopPicked: GolferStat;
  mostCounting: GolferStat;
  differentiatorCount: number;
  golfers: GolferStat[];
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: "rgba(17,45,28,0.6)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
      <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.5rem", fontWeight: 700, color: color ?? "var(--green-400)" }}>{value}</div>
      {sub && <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function AnalysisPage() {
  const router = useRouter();
  const session = getSession();
  const [data, setData] = useState<AnalysisData | null>(null);
  const [majorId, setMajorId] = useState("masters");
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"picks" | "counting" | "score" | "topPick">("picks");

  useEffect(() => {
    if (!session) { router.push("/login"); return; }
    loadData(majorId);
  }, [majorId]);

  async function loadData(mid: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/analysis?majorId=${mid}`);
      if (res.ok) setData(await res.json());
    } catch {}
    finally { setLoading(false); }
  }

  const sortedGolfers = data ? [...data.golfers].sort((a, b) => {
    if (sortBy === "picks")   return b.totalPicks - a.totalPicks;
    if (sortBy === "counting") return b.countingPicks - a.countingPicks;
    if (sortBy === "topPick") return b.topPickCount - a.topPickCount;
    if (sortBy === "score")   return (a.currentScore ?? 99) - (b.currentScore ?? 99);
    return 0;
  }) : [];

  const tournamentActive = data && data.golfers.some(g => g.currentScore !== null);

  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}>
      <Nav />
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "2rem", color: "#f0faf4", margin: 0 }}>Pick Analysis</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 4 }}>How the pool picked — and how those picks are performing</p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {["masters","pga","us-open","british-open"].map(mid => (
              <button key={mid} onClick={() => setMajorId(mid)} style={{
                padding: "6px 14px", borderRadius: 20, fontSize: "0.8rem", cursor: "pointer",
                border: `1px solid ${majorId===mid?"var(--green-400)":"var(--border)"}`,
                background: majorId===mid?"rgba(77,189,136,0.12)":"transparent",
                color: majorId===mid?"var(--green-400)":"var(--text-muted)",
                fontFamily: "'DM Sans', sans-serif", fontWeight: majorId===mid?600:400
              }}>
                {mid==="masters"?"Masters":mid==="pga"?"PGA":mid==="us-open"?"US Open":"British"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
            <div style={{ fontSize: "2rem", marginBottom: 12 }}>⛳</div>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85rem" }}>Crunching picks…</p>
          </div>
        ) : !data ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>No data available.</div>
        ) : (
          <>
            {/* Summary stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
              <StatCard label="Entries" value={data.entriesWithPicks} sub={`of ${data.totalEntries} registered`} />
              <StatCard label="Unique Golfers" value={data.uniqueGolfers} sub="selected across pool" />
              <StatCard label="Differentiators" value={data.differentiatorCount} sub="picked by only 1 entry" color="#facc15" />
              {tournamentActive && <>
                <StatCard label="Cut Rate" value={`${data.cutPickRate}%`} sub={`${data.cutPickCount} picks missed cut`} color={data.cutPickRate > 30 ? "#f87171" : "var(--green-400)"} />
                <StatCard label="Consensus Score" value={formatScore(data.consensusScore)} sub="top 5 most-picked, best 3" color={data.consensusScore < 0 ? "#f87171" : "#6b7280"} />
              </>}
            </div>

            {/* Highlight cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 28 }}>
              {[
                { label: "Most Picked", g: data.mostPicked, color: "var(--green-400)" },
                { label: "Most Top Picked ⭐", g: data.mostTopPicked, color: "#facc15" },
                { label: "Most Counting 📊", g: data.mostCounting, color: "#86d8b0" }
              ].map(({ label, g, color }) => g && (
                <div key={label} style={{ background: "rgba(17,45,28,0.7)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px" }}>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{label}</div>
                  <div style={{ color, fontWeight: 600, fontSize: "0.95rem", marginBottom: 4 }}>{g.name}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                    {label.includes("Top") ? `${g.topPickCount} top picks` : label.includes("Counting") ? `${g.countingPicks} counting` : `${g.totalPicks} picks`}
                    {tournamentActive && g.currentScore !== null && (
                      <span style={{ marginLeft: 8, color: g.currentScore < 0 ? "#f87171" : "#6b7280", fontFamily: "'DM Mono', monospace" }}>
                        {formatScore(g.currentScore)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Full golfer breakdown table */}
            <div className="card" style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 480 }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  All Picked Golfers — {MAJOR_NAMES[majorId]}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", alignSelf: "center" }}>Sort:</span>
                  {[
                    { key: "picks" as const, label: "# Picks" },
                    { key: "topPick" as const, label: "Top Picks" },
                    { key: "counting" as const, label: "Counting" },
                    ...(tournamentActive ? [{ key: "score" as const, label: "Score" }] : [])
                  ].map(opt => (
                    <button key={opt.key} onClick={() => setSortBy(opt.key)} style={{
                      padding: "4px 10px", borderRadius: 12, fontSize: "0.72rem", cursor: "pointer",
                      border: `1px solid ${sortBy===opt.key?"var(--green-400)":"var(--border)"}`,
                      background: sortBy===opt.key?"rgba(77,189,136,0.12)":"transparent",
                      color: sortBy===opt.key?"var(--green-400)":"var(--text-muted)",
                      fontFamily: "'DM Sans', sans-serif"
                    }}>{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* Table header */}
              <div style={{ display: "grid", gridTemplateColumns: tournamentActive ? "1fr 52px 52px 64px 44px 56px" : "1fr 52px 52px 64px", padding: "8px 20px", color: "var(--text-muted)", fontSize: "0.68rem", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border)" }}>
                <span>Golfer</span>
                <span style={{ textAlign: "center" }}>Picks</span>
                <span style={{ textAlign: "center" }}>⭐ Top</span>
                <span style={{ textAlign: "center" }}>Counting</span>
                {tournamentActive && <>
                  <span style={{ textAlign: "center" }}>Cut</span>
                  <span style={{ textAlign: "center" }}>Score</span>
                </>}
              </div>

              {/* Golfer rows */}
              <div style={{ maxHeight: 520, overflowY: "auto" }}>
                {sortedGolfers.map((g, idx) => {
                  const pickShare = data.totalPicksAcrossPool > 0 ? Math.round((g.totalPicks / data.totalEntries) * 100) : 0;
                  const countingRate = g.totalPicks > 0 ? Math.round((g.countingPicks / g.totalPicks) * 100) : 0;
                  const isMissedCut = g.cutPicks > 0 && g.currentScore !== null;
                  return (
                    <div key={g.name} style={{
                      display: "grid",
                      gridTemplateColumns: tournamentActive ? "1fr 52px 52px 64px 44px 56px" : "1fr 52px 52px 64px",
                      padding: "10px 20px", alignItems: "center",
                      borderBottom: idx < sortedGolfers.length - 1 ? "1px solid rgba(77,189,136,0.06)" : "none",
                      background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)"
                    }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, minWidth: 140 }}>
                        <span style={{ color: isMissedCut ? "#6b7280" : "#f0faf4", fontSize: "0.85rem", fontStyle: isMissedCut ? "italic" : "normal" }}>
                          {g.name}
                          {g.topPickCount > 0 && <span style={{ color: "#facc15", fontSize: "0.65rem", marginLeft: 4 }}>⭐</span>}
                        </span>
                        <div style={{ width: `${pickShare}%`, maxWidth: 60, minWidth: 4, height: 3, background: "rgba(77,189,136,0.4)", borderRadius: 2 }} />
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85rem", color: "#f0faf4", fontWeight: 600 }}>{g.totalPicks}</span>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", display: "block" }}>{pickShare}%</span>
                      </div>
                      <div style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: "0.85rem", color: g.topPickCount > 0 ? "#facc15" : "var(--border)" }}>
                        {g.topPickCount > 0 ? g.topPickCount : "—"}
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85rem", color: g.countingPicks > 0 ? "var(--green-400)" : "var(--text-muted)" }}>{g.countingPicks}</span>
                        {tournamentActive && g.totalPicks > 0 && <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", display: "block" }}>{countingRate}%</span>}
                      </div>
                      {tournamentActive && <>
                        <div style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: "0.82rem", color: g.cutPicks > 0 ? "#f87171" : "var(--border)" }}>
                          {g.cutPicks > 0 ? g.cutPicks : "—"}
                        </div>
                        <div style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: "0.85rem", color: g.currentScore === null ? "var(--border)" : g.currentScore < 0 ? "#f87171" : g.currentScore === 0 ? "#f0faf4" : "#6b7280", fontWeight: g.currentScore !== null ? 600 : 400 }}>
                          {g.currentScore !== null ? formatScore(g.currentScore) : "—"}
                        </div>
                      </>}
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", textAlign: "center", marginTop: 16 }}>
              "Counting" = in an entry's best 3 of 5 scores · "Differentiators" = picked by exactly 1 entry · Updates with leaderboard
            </p>
          </>
        )}
      </div>
    </div>
  );
}