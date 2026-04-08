import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { parseEspnCsv, findGolferScore, normalizeName } from "@/lib/scoring";
import type { Entry, MajorId, AdminOverride, NameMapping } from "@/types";

export async function GET(req: NextRequest) {
  const majorId = (req.nextUrl.searchParams.get("majorId") ?? "masters") as MajorId;

  try {
    const [entriesSnap, majorSnap, overridesSnap, mappingsSnap] = await Promise.all([
      adminDb.collection("entries").get(),
      adminDb.collection("majors").doc(majorId).get(),
      adminDb.collection("overrides").where("majorId", "==", majorId).get(),
      adminDb.collection("nameMappings").where("majorId", "==", majorId).get()
    ]);

    const entries = entriesSnap.docs.map(d => d.data() as Entry);
    const major = majorSnap.data();
    const overrides = overridesSnap.docs.map(d => d.data() as AdminOverride);
    const nameMappings: Record<string, string> = {};
    mappingsSnap.docs.map(d => d.data() as NameMapping).forEach(m => {
      nameMappings[normalizeName(m.adminName)] = m.espnName;
    });

    // Fetch live scores
    let liveScores: ReturnType<typeof parseEspnCsv> = [];
    if (major?.sheetCsvUrl) {
      try {
        const csvRes = await fetch(major.sheetCsvUrl);
        if (csvRes.ok) liveScores = parseEspnCsv(await csvRes.text());
      } catch {}
    }

    // Aggregate pick data
    const golferStats: Record<string, {
      name: string;
      totalPicks: number;
      topPickCount: number;
      countingPicks: number;  // in someone's best 3
      notCountingPicks: number;
      cutPicks: number;
      currentScore: number | null;
      position: string;
    }> = {};

    let totalEntries = 0;
    let entriesWithPicks = 0;
    let totalPicksMade = 0;

    for (const entry of entries) {
      const majorEntry = entry.majors?.[majorId];
      if (!majorEntry?.picks?.length) continue;

      totalEntries++;
      entriesWithPicks++;
      totalPicksMade += majorEntry.picks.length;

      // Get scores for all 5 picks and determine best 3
      const picksWithScores = majorEntry.picks.map((pick: any) => {
        const gs = findGolferScore(pick.golferName, liveScores, nameMappings, overrides);
        return {
          ...pick,
          liveScore: gs?.score ?? 99,
          isCut: gs?.isCut ?? false,
          isWD: gs?.isWD ?? false,
          position: gs?.position ?? "—"
        };
      });

      const sorted = [...picksWithScores].sort((a, b) => a.liveScore - b.liveScore);
      const countingIds = new Set(sorted.slice(0, 3).map((p: any) => p.golferId));

      for (const pick of picksWithScores) {
        const key = normalizeName(pick.golferName);
        if (!golferStats[key]) {
          const gs = findGolferScore(pick.golferName, liveScores, nameMappings, overrides);
          golferStats[key] = {
            name: pick.golferName,
            totalPicks: 0,
            topPickCount: 0,
            countingPicks: 0,
            notCountingPicks: 0,
            cutPicks: 0,
            currentScore: gs ? gs.score : null,
            position: gs?.position ?? "—"
          };
        }
        golferStats[key].totalPicks++;
        if (pick.isTopPick) golferStats[key].topPickCount++;
        if (countingIds.has(pick.golferId)) golferStats[key].countingPicks++;
        else golferStats[key].notCountingPicks++;
        if (pick.isCut || pick.isWD) golferStats[key].cutPicks++;
      }
    }

    const golferArray = Object.values(golferStats).sort((a, b) => b.totalPicks - a.totalPicks);

    // Summary stats
    const totalPicksAcrossPool = golferArray.reduce((s, g) => s + g.totalPicks, 0);
    const cutPicks = golferArray.reduce((s, g) => s + g.cutPicks, 0);
    const uniqueGolfers = golferArray.length;
    const mostPicked = golferArray[0];
    const mostTopPicked = [...golferArray].sort((a, b) => b.topPickCount - a.topPickCount)[0];
    const mostCounting = [...golferArray].sort((a, b) => b.countingPicks - a.countingPicks)[0];
    const differentiators = golferArray.filter(g => g.totalPicks === 1);

    // Consensus score — what if everyone had the same picks (top 5 most picked)
    const top5 = [...golferArray].slice(0, 5);
    const consensusScores = top5.map(g => g.currentScore ?? 0).sort((a, b) => a - b);
    const consensusScore = consensusScores.slice(0, 3).reduce((s, v) => s + v, 0);

    return NextResponse.json({
      majorId,
      totalEntries,
      entriesWithPicks,
      totalPicksAcrossPool,
      uniqueGolfers,
      cutPickCount: cutPicks,
      cutPickRate: totalPicksAcrossPool > 0 ? Math.round((cutPicks / totalPicksAcrossPool) * 100) : 0,
      consensusScore,
      mostPicked,
      mostTopPicked,
      mostCounting,
      differentiatorCount: differentiators.length,
      golfers: golferArray
    });

  } catch (e) {
    console.error("Analysis error:", e);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}