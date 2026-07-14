import { NextRequest } from "next/server";
import { computeStandings } from "@/lib/getStandings";

function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "";
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

  // Version gate — callers should use ?v=4
  const version = req.nextUrl.searchParams.get("v");
  if (version === "3") {
    return new Response("Use v=4 for the updated export format", { status: 400 });
  }

  try {
    const { standings, entries } = await computeStandings();

    // Build a lookup from entryId → entry (for picks and email)
    const entriesById = new Map(entries.map(e => [e.id, e]));

    const rows = standings.map(s => {
      const entry = entriesById.get(s.entryId);
      const majorsData = entry?.majors ?? {};

      const mastersPicks = ((majorsData as any)["masters"]?.picks ?? [])
        .map((p: any) => p.golferName).join(" | ");
      const pgaPicks = ((majorsData as any)["pga"]?.picks ?? [])
        .map((p: any) => p.golferName).join(" | ");
      const usOpenPicksList = ((majorsData as any)["us-open"]?.picks ?? []) as any[];
      const usOpenPicks = usOpenPicksList.length === 0
        ? ""
        : usOpenPicksList
            .map((p: any) => p.isTopPick ? `${p.golferName} (TP)` : p.golferName)
            .join(", ");
      const britishOpenPicksList = ((majorsData as any)["british-open"]?.picks ?? []) as any[];
      const britishOpenPicks = britishOpenPicksList.length === 0
        ? ""
        : britishOpenPicksList
            .map((p: any) => p.isTopPick ? `${p.golferName} (TP)` : p.golferName)
            .join(", ");

      const mastersScore = s.majorScores?.["masters"]?.finalScore;
      const pgaScore = s.majorScores?.["pga"]?.finalScore;
      const usOpenScore = s.majorScores?.["us-open"]?.finalScore;

      return {
        rank: s.rank,
        name: s.entrantName ?? "",
        email: entry?.email ?? "",
        mastersScore: mastersScore !== undefined && mastersScore !== null ? mastersScore : null,
        pgaScore: pgaScore !== undefined && pgaScore !== null ? pgaScore : null,
        usOpenScore: usOpenScore !== undefined && usOpenScore !== null ? usOpenScore : null,
        totalScore: s.totalScore !== undefined && s.totalScore !== null ? s.totalScore : null,
        usOpenPicks,
        britishOpenPicks,
        mastersPicks,
        pgaPicks,
        winnersHit: s.totalWinnersHit,
        topPickWins: s.totalTopPickWins
      };
    });

    // Columns: Rank | Name | Email | Masters | PGA | US Open | Season Total | US Open Picks | British Open Picks | ...
    const headers = [
      "Rank", "Name", "Email",
      "Masters Score", "PGA Score", "US Open Score",
      "Season Total",
      "US Open Picks",
      "British Open Picks",
      "Masters Picks", "PGA Picks",
      "Winners Hit", "Top Pick Wins"
    ];

    const csvRows = rows.map(row => [
      csvField(row.rank),
      csvField(row.name),
      csvField(row.email),
      csvField(formatScore(row.mastersScore)),
      csvField(formatScore(row.pgaScore)),
      csvField(formatScore(row.usOpenScore)),
      csvField(formatScore(row.totalScore)),
      csvField(row.usOpenPicks),
      csvField(row.britishOpenPicks),
      csvField(row.mastersPicks ? `"${row.mastersPicks}"` : ""),
      csvField(row.pgaPicks ? `"${row.pgaPicks}"` : ""),
      csvField(row.winnersHit),
      csvField(row.topPickWins)
    ].join(","));

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
