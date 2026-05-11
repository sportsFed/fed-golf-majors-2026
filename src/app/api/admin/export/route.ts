import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

type MajorId = "masters" | "pga" | "us-open" | "british-open";

const MAJOR_IDS: MajorId[] = ["masters", "pga", "us-open", "british-open"];

interface FinalizedScoreDoc {
  entryId: string;
  majorId: string;
  finalScore: number;
  winnersHit: number;
  topPickWon: boolean | number;
}

interface EntryDoc {
  id: string;
  entrantName: string;
  email: string;
  majors?: Record<string, { picks?: Array<{ golferName: string }> }>;
}

interface StandingRow {
  entry: EntryDoc;
  totalScore: number | undefined;
  majorScores: Record<MajorId, number | undefined>;
  winnersHit: number;
  topPickWins: number;
  mastersPicks: string;
  pgaPicks: string;
  rank: number;
}

function formatScore(score: number): string {
  if (score === 0) return "E";
  if (score > 0) return `+${score}`;
  return `${score}`;
}

function csvWrap(value: string): string {
  if (value.includes(",") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const password = searchParams.get("password");

  if (!password || password !== process.env.ADMIN_PIN) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const [entriesSnap, scoresSnap] = await Promise.all([
    adminDb.collection("entries").get(),
    adminDb.collection("finalizedScores").get(),
  ]);

  const scoresByEntry: Record<string, Record<string, FinalizedScoreDoc>> = {};
  for (const doc of scoresSnap.docs) {
    const data = doc.data() as FinalizedScoreDoc;
    if (!scoresByEntry[data.entryId]) scoresByEntry[data.entryId] = {};
    scoresByEntry[data.entryId][data.majorId] = data;
  }

  const rows: Omit<StandingRow, "rank">[] = entriesSnap.docs.map((doc) => {
    const entry = { id: doc.id, ...doc.data() } as EntryDoc;
    const entryScores = scoresByEntry[entry.id] ?? {};

    let totalScore: number | undefined;
    let winnersHit = 0;
    let topPickWins = 0;

    const majorScores: Record<MajorId, number | undefined> = {
      masters: undefined,
      pga: undefined,
      "us-open": undefined,
      "british-open": undefined,
    };

    for (const majorId of MAJOR_IDS) {
      const s = entryScores[majorId];
      if (s) {
        majorScores[majorId] = s.finalScore;
        totalScore = (totalScore ?? 0) + s.finalScore;
        winnersHit += s.winnersHit ?? 0;
        topPickWins += s.topPickWon ? 1 : 0;
      }
    }

    const getPickNames = (majorId: MajorId): string => {
      const picks = entry.majors?.[majorId]?.picks;
      if (!picks?.length) return "";
      return picks.map((p) => p.golferName).join(" | ");
    };

    return {
      entry,
      totalScore,
      majorScores,
      winnersHit,
      topPickWins,
      mastersPicks: getPickNames("masters"),
      pgaPicks: getPickNames("pga"),
    };
  });

  rows.sort((a, b) => {
    if (a.totalScore === undefined && b.totalScore === undefined) return 0;
    if (a.totalScore === undefined) return 1;
    if (b.totalScore === undefined) return -1;
    return a.totalScore - b.totalScore;
  });

  const ranked: StandingRow[] = rows.map((row, i) => {
    let rank: number;
    if (i === 0 || row.totalScore === undefined) {
      rank = i + 1;
    } else {
      const prev = ranked[i - 1];
      rank = row.totalScore === prev.totalScore ? prev.rank : i + 1;
    }
    return { ...row, rank };
  });

  const headers = [
    "Rank",
    "Name",
    "Email",
    "Total Score",
    "Masters Score",
    "PGA Score",
    "US Open Score",
    "British Open Score",
    "Winners Hit",
    "Top Pick Wins",
    "Masters Picks",
    "PGA Picks",
  ];

  const csvLines: string[] = [headers.join(",")];

  for (const row of ranked) {
    const picksField = (picks: string) => (picks ? `"${picks}"` : "");
    const cols = [
      String(row.rank),
      csvWrap(row.entry.entrantName ?? ""),
      csvWrap(row.entry.email ?? ""),
      row.totalScore !== undefined ? formatScore(row.totalScore) : "",
      row.majorScores["masters"] !== undefined ? formatScore(row.majorScores["masters"]!) : "",
      row.majorScores["pga"] !== undefined ? formatScore(row.majorScores["pga"]!) : "",
      row.majorScores["us-open"] !== undefined ? formatScore(row.majorScores["us-open"]!) : "",
      row.majorScores["british-open"] !== undefined ? formatScore(row.majorScores["british-open"]!) : "",
      String(row.winnersHit),
      String(row.topPickWins),
      picksField(row.mastersPicks),
      picksField(row.pgaPicks),
    ];
    csvLines.push(cols.join(","));
  }

  return new Response(csvLines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
