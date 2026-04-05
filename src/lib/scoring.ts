import {
  type MajorId, type Pick, type PickResult, type MajorScore,
  type GolferScore, type FieldGolfer, type AdminOverride,
  type EntryStandings, type Entry, ODDS_BONUSES
} from "@/types";

// ─── NAME NORMALIZATION ────────────────────────────────────────────────────

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function namesMatch(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

export function oddsToTier(odds: number | undefined): import("@/types").OddsTier {
  if (odds === undefined || odds === null) return "field";
  if (odds <= 999) return "even-999";
  if (odds <= 2499) return "1000-2499";
  if (odds <= 4999) return "2500-4999";
  return "5000plus";
}

// ─── CSV PARSING ──────────────────────────────────────────────────────────
// Actual ESPN importHTML column layout:
// Col 0: POS
// Col 1: Movement indicator (number or dash) — SKIP
// Col 2: PLAYER NAME
// Col 3: SCORE (relative to par, "E", "CUT", "WD")
// Col 4: TODAY (today's round score or "-")
// Col 5: THRU (holes through, tee time, or "F")
// Col 6: R1  Col 7: R2  Col 8: R3  Col 9: R4
// Col 10: TOT (total strokes)
// Last col: ScoreFmt (clean integer)

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

export function parseEspnCsv(csvText: string): GolferScore[] {
  const lines = csvText.split("\n").map(l => l.trim()).filter(Boolean);

  // Find the header row
  let dataStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes("pos") && lower.includes("player")) {
      dataStart = i + 1;
      break;
    }
  }

  // First pass: find highest total strokes for CUT/WD penalty
  let highestTotalStrokes = 288;
  for (let i = dataStart; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const tot = parseInt(cols[10]);
    if (!isNaN(tot) && tot > highestTotalStrokes) highestTotalStrokes = tot;
  }

  const scores: GolferScore[] = [];

  for (let i = dataStart; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 4) continue;

    const pos        = cols[0]?.trim() ?? "";
    // cols[1] = movement indicator — skipped
    const playerName = cols[2]?.trim() ?? "";
    const scoreRaw   = cols[3]?.trim() ?? "";
    // cols[4] = TODAY, cols[5] = THRU
    const r1  = parseInt(cols[6]);
    const r2  = parseInt(cols[7]);
    const r3  = parseInt(cols[8]);
    const r4  = parseInt(cols[9]);
    const tot = parseInt(cols[10]);
    const scoreFmt = parseInt(cols[cols.length - 1]);

    if (!playerName || playerName.toUpperCase() === "PLAYER") continue;

    const isCut    = scoreRaw.toUpperCase() === "CUT" || pos.toUpperCase() === "CUT";
    const isWD     = scoreRaw.toUpperCase() === "WD"  || pos.toUpperCase() === "WD";
    const isWinner = pos.trim() === "1";

    let finalScore: number;
    if (isCut) {
      finalScore = (highestTotalStrokes + 2) - 288;
    } else if (isWD) {
      finalScore = highestTotalStrokes - 288;
    } else if (!isNaN(scoreFmt)) {
      finalScore = scoreFmt;
    } else if (scoreRaw === "E") {
      finalScore = 0;
    } else {
      const parsed = parseInt(scoreRaw.replace("+", ""));
      finalScore = isNaN(parsed) ? 0 : parsed;
    }

    scores.push({
      espnName: playerName,
      position: pos,
      score: finalScore,
      r1: isNaN(r1) ? undefined : r1,
      r2: isNaN(r2) ? undefined : r2,
      r3: isNaN(r3) ? undefined : r3,
      r4: isNaN(r4) ? undefined : r4,
      totalStrokes: isNaN(tot) ? undefined : tot,
      isCut,
      isWD,
      isWinner
    });
  }

  return scores;
}

// ─── SCORE LOOKUP ─────────────────────────────────────────────────────────

export function findGolferScore(
  golferName: string,
  liveScores: GolferScore[],
  nameMappings: Record<string, string>,
  overrides: AdminOverride[]
): GolferScore | null {
  const override = overrides.find(o =>
    namesMatch(o.golferName, golferName) ||
    namesMatch(o.golferName, nameMappings[normalizeName(golferName)] ?? "")
  );
  if (override) {
    const highestTotal = liveScores.reduce((max, g) => Math.max(max, g.totalStrokes ?? 288), 288);
    return {
      espnName: golferName,
      position: override.overrideStatus,
      score: override.overrideStatus === "CUT"
        ? (highestTotal + 2) - 288
        : override.overrideStatus === "WD"
          ? highestTotal - 288
          : (override.customScore ?? 0),
      isCut: override.overrideStatus === "CUT",
      isWD:  override.overrideStatus === "WD",
      isWinner: false
    };
  }

  let found = liveScores.find(g => namesMatch(g.espnName, golferName));
  if (found) return found;

  const mappedName = nameMappings[normalizeName(golferName)];
  if (mappedName) {
    found = liveScores.find(g => namesMatch(g.espnName, mappedName));
    if (found) return found;
  }

  return null;
}

// ─── MAJOR SCORE CALCULATION ──────────────────────────────────────────────

export function calculateMajorScore(
  picks: Pick[],
  liveScores: GolferScore[],
  nameMappings: Record<string, string>,
  overrides: AdminOverride[],
  majorFinalized: boolean
): MajorScore {
  const worstScore = liveScores.length > 0
    ? Math.max(...liveScores.map(g => g.score))
    : 20;

  const pickResults: PickResult[] = picks.map(pick => {
    const gs = findGolferScore(pick.golferName, liveScores, nameMappings, overrides);
    if (!gs) return { pick, score: worstScore, counted: false, rawScore: worstScore, status: "missing" as const };
    let status: PickResult["status"] = "active";
    if (gs.isWinner) status = "winner";
    else if (gs.isCut) status = "cut";
    else if (gs.isWD)  status = "wd";
    return { pick, score: gs.score, counted: false, rawScore: gs.score, status };
  });

  const sorted = [...pickResults].sort((a, b) => a.score - b.score);
  sorted[0].counted = true;
  sorted[1].counted = true;
  sorted[2].counted = true;

  const countedScore = sorted.filter(r => r.counted).reduce((sum, r) => sum + r.score, 0);

  let bonus = 0, bonusReason: string | undefined, winnersHit = 0, topPickWon = false;

  for (const result of pickResults) {
    if (result.status === "winner") {
      winnersHit++;
      const tb = ODDS_BONUSES[result.pick.tier];
      if (result.pick.isTopPick) {
        topPickWon = true;
        if (tb.topPickBonus < bonus) { bonus = tb.topPickBonus; bonusReason = `Top Pick winner (${tb.label}) → ${tb.topPickBonus} strokes`; }
      } else {
        if (tb.standardBonus < bonus) { bonus = tb.standardBonus; bonusReason = `Winner picked (${tb.label}) → ${tb.standardBonus} strokes`; }
      }
    }
  }

  return { majorId: "" as MajorId, pickResults, countedScore, bonus, bonusReason, finalScore: countedScore + bonus, winnersHit, topPickWon, finalized: majorFinalized };
}

// ─── STANDINGS ────────────────────────────────────────────────────────────

export function calculateStandings(
  entries: Entry[],
  majorScores: Record<string, Partial<Record<MajorId, MajorScore>>>
): EntryStandings[] {
  const standings: EntryStandings[] = entries.map(entry => {
    const ems = majorScores[entry.id] ?? {};
    const mids = Object.keys(ems) as MajorId[];
    return {
      entryId: entry.id,
      entrantName: entry.entrantName,
      totalScore: mids.reduce((s, m) => s + (ems[m]?.finalScore ?? 0), 0),
      majorScores: ems,
      completedMajors: mids.length,
      totalWinnersHit: mids.reduce((s, m) => s + (ems[m]?.winnersHit ?? 0), 0),
      totalTopPickWins: mids.reduce((s, m) => s + (ems[m]?.topPickWon ? 1 : 0), 0)
    };
  });

  standings.sort((a, b) => {
    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
    if (a.totalWinnersHit !== b.totalWinnersHit) return b.totalWinnersHit - a.totalWinnersHit;
    return b.totalTopPickWins - a.totalTopPickWins;
  });

  let rank = 1;
  for (let i = 0; i < standings.length; i++) {
    if (i > 0) {
      const p = standings[i - 1], c = standings[i];
      const tied = c.totalScore === p.totalScore && c.totalWinnersHit === p.totalWinnersHit && c.totalTopPickWins === p.totalTopPickWins;
      if (!tied) rank = i + 1;
    }
    standings[i].rank = rank;
  }
  return standings;
}

export function formatScore(score: number): string {
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : `${score}`;
}

export function scoreColor(score: number): string {
  if (score < 0) return "text-red-400";
  if (score === 0) return "text-white";
  return "text-gray-400";
}