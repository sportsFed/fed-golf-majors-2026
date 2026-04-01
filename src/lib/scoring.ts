import {
  type MajorId, type Pick, type PickResult, type MajorScore,
  type GolferScore, type FieldGolfer, type AdminOverride,
  type EntryStandings, type Entry, ODDS_BONUSES
} from "@/types";

// ─── NAME NORMALIZATION ────────────────────────────────────────────────────
// Strips accents and encoding artifacts so "HÃ¸jgaard" matches "Højgaard"

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")     // strip accent marks
    .replace(/[^\x00-\x7F]/g, "")        // strip any remaining non-ASCII
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function namesMatch(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

// ─── ODDS → TIER ──────────────────────────────────────────────────────────

export function oddsToTier(odds: number | undefined): import("@/types").OddsTier {
  if (odds === undefined || odds === null) return "field";
  if (odds <= 999) return "even-999";
  if (odds <= 2499) return "1000-2499";
  if (odds <= 4999) return "2500-4999";
  return "5000plus";
}

// ─── CSV PARSING ──────────────────────────────────────────────────────────
// Parses the raw CSV from your Google Sheet (ESPN importHTML format)

export function parseEspnCsv(csvText: string): GolferScore[] {
  const lines = csvText.split("\n").map(l => l.trim()).filter(Boolean);

  // Skip metadata rows (URL, query type, index, refresh) and find header row
  let dataStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes("pos") && lines[i].toLowerCase().includes("player")) {
      dataStart = i + 1;
      break;
    }
  }

  const scores: GolferScore[] = [];
  let highestTotalStrokes = 0;

  // First pass: find highest total strokes (used for CUT/WD penalty)
  for (let i = dataStart; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.replace(/^"|"$/g, "").trim());
    const tot = parseInt(cols[7]);
    if (!isNaN(tot) && tot > highestTotalStrokes) {
      highestTotalStrokes = tot;
    }
  }

  // Second pass: build GolferScore objects
  for (let i = dataStart; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.replace(/^"|"$/g, "").trim());
    if (cols.length < 6 || !cols[1]) continue;

    const pos = cols[0]?.trim() ?? "";
    const playerName = cols[1]?.trim() ?? "";
    const scoreRaw = cols[2]?.trim() ?? "";
    const r1 = parseInt(cols[3]);
    const r2 = parseInt(cols[4]);
    const r3 = parseInt(cols[5]);
    const r4 = parseInt(cols[6]);
    const tot = parseInt(cols[7]);
    // ScoreFmt is the last column — clean integer score
    const scoreFmt = parseInt(cols[cols.length - 1]);

    const isCut = scoreRaw.toUpperCase() === "CUT" || pos.toUpperCase() === "CUT";
    const isWD = scoreRaw.toUpperCase() === "WD" || pos.toUpperCase() === "WD";
    const isWinner = pos === "1";

    let finalScore: number;
    if (isCut) {
      // Highest 4-day total + 2 strokes penalty, convert to relative-to-par
      // We store as relative-to-par. Estimate par as 72 per round = 288 for 4 rounds
      finalScore = (highestTotalStrokes + 2) - 288;
    } else if (isWD) {
      finalScore = highestTotalStrokes - 288;
    } else if (!isNaN(scoreFmt)) {
      finalScore = scoreFmt;
    } else {
      // Fallback: try parsing the SCORE column directly
      if (scoreRaw === "E") {
        finalScore = 0;
      } else {
        finalScore = parseInt(scoreRaw.replace("+", "")) || 0;
      }
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
// Find a golfer in the live scores, respecting name mappings and overrides

export function findGolferScore(
  golferName: string,
  liveScores: GolferScore[],
  nameMappings: Record<string, string>, // adminName → espnName
  overrides: AdminOverride[]
): GolferScore | null {
  // Check for admin override first
  const override = overrides.find(o => namesMatch(o.golferName, golferName) || namesMatch(o.golferName, nameMappings[golferName] ?? ""));
  if (override) {
    const baseScore = liveScores.reduce((max, g) => (g.totalStrokes ?? 0) > (max.totalStrokes ?? 0) ? g : max, liveScores[0]);
    const highestTotal = baseScore?.totalStrokes ?? 288;
    return {
      espnName: golferName,
      position: override.overrideStatus,
      score: override.overrideStatus === "CUT"
        ? (highestTotal + 2) - 288
        : override.overrideStatus === "WD"
          ? highestTotal - 288
          : (override.customScore ?? 0),
      isCut: override.overrideStatus === "CUT",
      isWD: override.overrideStatus === "WD",
      isWinner: false
    };
  }

  // Try direct match
  let found = liveScores.find(g => namesMatch(g.espnName, golferName));
  if (found) return found;

  // Try via name mapping
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
  // Find the worst score in the field for "missing" golfer penalty
  const worstScore = liveScores.length > 0
    ? Math.max(...liveScores.map(g => g.score))
    : 20;

  const pickResults: PickResult[] = picks.map(pick => {
    const golferScore = findGolferScore(pick.golferName, liveScores, nameMappings, overrides);

    if (!golferScore) {
      // Golfer not found in sheet — worst score penalty
      return {
        pick,
        score: worstScore,
        counted: false,
        rawScore: worstScore,
        status: "missing" as const
      };
    }

    let status: PickResult["status"] = "active";
    if (golferScore.isWinner) status = "winner";
    else if (golferScore.isCut) status = "cut";
    else if (golferScore.isWD) status = "wd";

    return {
      pick,
      score: golferScore.score,
      counted: false,
      rawScore: golferScore.score,
      status
    };
  });

  // Sort by score ascending (best = lowest in golf), mark best 3 as counted
  const sorted = [...pickResults].sort((a, b) => a.score - b.score);
  sorted[0].counted = true;
  sorted[1].counted = true;
  sorted[2].counted = true;

  // Sum the best 3
  const countedScore = sorted
    .filter(r => r.counted)
    .reduce((sum, r) => sum + r.score, 0);

  // Bonus calculation — only one bonus per major, take the best applicable
  let bonus = 0;
  let bonusReason: string | undefined;
  let winnersHit = 0;
  let topPickWon = false;

  for (const result of pickResults) {
    if (result.status === "winner") {
      winnersHit++;
      const tierBonus = ODDS_BONUSES[result.pick.tier];
      if (result.pick.isTopPick) {
        topPickWon = true;
        const topBonus = tierBonus.topPickBonus; // negative number
        if (topBonus < bonus) {
          bonus = topBonus;
          bonusReason = `Top Pick winner (${tierBonus.label}) → ${topBonus} strokes`;
        }
      } else {
        const stdBonus = tierBonus.standardBonus;
        if (stdBonus < bonus) {
          bonus = stdBonus;
          bonusReason = `Winner picked (${tierBonus.label}) → ${stdBonus} strokes`;
        }
      }
    }
  }

  return {
    majorId: picks[0]?.isTopPick ? ("" as MajorId) : ("" as MajorId), // set by caller
    pickResults,
    countedScore,
    bonus,
    bonusReason,
    finalScore: countedScore + bonus,
    winnersHit,
    topPickWon,
    finalized: majorFinalized
  };
}

// ─── STANDINGS CALCULATION ────────────────────────────────────────────────

export function calculateStandings(
  entries: Entry[],
  majorScores: Record<string, Partial<Record<MajorId, MajorScore>>>
): EntryStandings[] {
  const standings: EntryStandings[] = entries.map(entry => {
    const entryMajorScores = majorScores[entry.id] ?? {};
    const majorIds = Object.keys(entryMajorScores) as MajorId[];

    const totalScore = majorIds.reduce((sum, mid) => {
      return sum + (entryMajorScores[mid]?.finalScore ?? 0);
    }, 0);

    const totalWinnersHit = majorIds.reduce((sum, mid) => {
      return sum + (entryMajorScores[mid]?.winnersHit ?? 0);
    }, 0);

    const totalTopPickWins = majorIds.reduce((sum, mid) => {
      return sum + (entryMajorScores[mid]?.topPickWon ? 1 : 0);
    }, 0);

    return {
      entryId: entry.id,
      entrantName: entry.entrantName,
      totalScore,
      majorScores: entryMajorScores,
      completedMajors: majorIds.length,
      totalWinnersHit,
      totalTopPickWins
    };
  });

  // Sort: lowest score → most winners → most top pick wins
  standings.sort((a, b) => {
    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
    if (a.totalWinnersHit !== b.totalWinnersHit) return b.totalWinnersHit - a.totalWinnersHit;
    return b.totalTopPickWins - a.totalTopPickWins;
  });

  // Assign ranks (tied entries share a rank)
  let rank = 1;
  for (let i = 0; i < standings.length; i++) {
    if (i > 0) {
      const prev = standings[i - 1];
      const curr = standings[i];
      const tied =
        curr.totalScore === prev.totalScore &&
        curr.totalWinnersHit === prev.totalWinnersHit &&
        curr.totalTopPickWins === prev.totalTopPickWins;
      if (!tied) rank = i + 1;
    }
    standings[i].rank = rank;
  }

  return standings;
}

// ─── SCORE DISPLAY HELPERS ────────────────────────────────────────────────

export function formatScore(score: number): string {
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : `${score}`;
}

export function scoreColor(score: number): string {
  if (score < 0) return "text-red-400";   // under par = red in golf
  if (score === 0) return "text-white";
  return "text-gray-400";                 // over par = gray
}
