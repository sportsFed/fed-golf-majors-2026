import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

function formatScore(score: number): string {
  if (score === 0) return "E";
  if (score > 0) return `+${score}`;
  return `${score}`;
}

function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req: NextRequest) {
  // Auth check
  const password = req.nextUrl.searchParams.get("password");
  if (password !== process.env.ADMIN_PIN) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // Fetch entries and finalized scores in parallel
    const [entriesSnap, finalizedSnap] = await Promise.all([
      adminDb.collection("entries").get(),
      adminDb.collection("finalizedScores").get()
    ]);

    // Group finalized scores by entryId and majorId
    const finalizedByEntry: Record<string, Record<string, any>> = {};
    finalizedSnap.docs.forEach(doc => {
      const data = doc.data();
      const entryId = data.entryId;
      const majorId = data.majorId;
      if (!finalizedByEntry[entryId]) finalizedByEntry[entryId] = {};
      finalizedByEntry[entryId][majorId] = data;
    });

    const MAJOR_IDS = ["masters", "pga", "us-open", "british-open"];

    // Build standings rows
    const rows = entriesSnap.docs.map(doc => {
      const entry = doc.data();
      const entryId = entry.id ?? doc.id;
      const majorScores = finalizedByEntry[entryId] ?? {};

      // Calculate totals
      let totalScore = 0;
      let winnersHit = 0;
      let topPickWins = 0;
      let hasAnyScore = false;

      MAJOR_IDS.forEach(mid => {
        const ms = majorScores[mid];
        if (ms) {
          totalScore += ms.finalScore ?? 0;
          winnersHit += ms.winnersHit ?? 0;
          topPickWins += ms.topPickWon ? 1 : 0;
          hasAnyScore = true;
        }
      });

      // Per-major scores
      const mastersScore = majorScores["masters"]?.finalScore;
      const pgaScore = majorScores["pga"]?.finalScore;
      const usOpenScore = majorScores["us-open"]?.finalScore;
      const britishScore = majorScores["british-open"]?.finalScore;

      // Pick lists from entry.majors
      const majorsData = entry.majors ?? {};
      const mastersPicks = (majorsData["masters"]?.picks ?? [])
        .map((p: any) => p.golferName).join(" | ");
      const pgaPicks = (majorsData["pga"]?.picks ?? [])
        .map((p: any) => p.golferName).join(" | ");

      return {
        entryId,
        name: entry.entrantName ?? "",
        email: entry.email ?? "",
        totalScore: hasAnyScore ? totalScore : null,
        mastersScore: mastersScore !== undefined ? mastersScore : null,
        pgaScore: pgaScore !== undefined ? pgaScore : null,
        usOpenScore: usOpenScore !== undefined ? usOpenScore : null,
        britishScore: britishScore !== undefined ? britishScore : null,
        winnersHit,
        topPickWins,
        mastersPicks,
        pgaPicks
      };
    });

    // Sort by total score ascending (lower = better), nulls last
    rows.sort((a, b) => {
      if (a.totalScore === null && b.totalScore === null) return 0;
      if (a.totalScore === null) return 1;
      if (b.totalScore === null) return -1;
      return a.totalScore - b.totalScore;
    });

    // Assign ranks with tie handling
    let rank = 1;
    for (let i = 0; i < rows.length; i++) {
      if (i > 0) {
        const prev = rows[i - 1];
        const curr = rows[i];
        if (curr.totalScore !== prev.totalScore) rank = i + 1;
      }
      (rows[i] as any).rank = rank;
    }

    // Build CSV
    const headers = [
      "Rank", "Name", "Email",
      "Total Score", "Masters Score", "PGA Score",
      "US Open Score", "British Open Score",
      "Winners Hit", "Top Pick Wins",
      "Masters Picks", "PGA Picks"
    ];

    const csvRows = rows.map(row => {
      const r = row as any;
      return [
        csvField(r.rank),
        csvField(r.name),
        csvField(r.email),
        csvField(r.totalScore !== null ? formatScore(r.totalScore) : ""),
        csvField(r.mastersScore !== null ? formatScore(r.mastersScore) : ""),
        csvField(r.pgaScore !== null ? formatScore(r.pgaScore) : ""),
        csvField(r.usOpenScore !== null ? formatScore(r.usOpenScore) : ""),
        csvField(r.britishScore !== null ? formatScore(r.britishScore) : ""),
        csvField(r.winnersHit),
        csvField(r.topPickWins),
        csvField(r.mastersPicks ? `"${r.mastersPicks}"` : ""),
        csvField(r.pgaPicks ? `"${r.pgaPicks}"` : "")
      ].join(",");
    });

    const csv = [headers.join(","), ...csvRows].join("\n");

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (error) {
    console.error("CSV export error:", error);
    return new Response("Export failed", { status: 500 });
  }
}