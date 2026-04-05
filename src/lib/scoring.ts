import {
  type MajorId, type Pick, type PickResult, type MajorScore,
  type GolferScore, type AdminOverride,
  type EntryStandings, type Entry, ODDS_BONUSES
} from "@/types";

export function normalizeName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x00-\x7F]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function namesMatch(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

export function oddsToTier(odds: number | undefined): import("@/types").OddsTier {
  if (!odds) return "field";
  if (odds <= 999) return "even-999";
  if (odds <= 2499) return "1000-2499";
  if (odds <= 4999) return "2500-4999";
  return "5000plus";
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "", inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

// Dynamic column detection from header row
// Handles leading empty column and any minor layout variations
export function parseEspnCsv(csvText: string): GolferScore[] {
  const lines = csvText.split("\n").map(l => l.trim()).filter(Boolean);

  let dataStart = 0;
  let posCol = 1, playerCol = 3, scoreCol = 4, r1Col = 7, totCol = 11;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes("player")) {
      const h = parseCsvLine(lines[i]).map(c => c.toUpperCase().trim());
      const find = (name: string) => h.findIndex(c => c === name);
      const pi = find("PLAYER"), si = find("SCORE"), poi = find("POS"), ti = find("TOT"), r1i = find("R1");
      if (pi !== -1) playerCol = pi;
      if (si !== -1) scoreCol  = si;
      if (poi !== -1) posCol   = poi;
      if (ti !== -1) totCol    = ti;
      if (r1i !== -1) r1Col   = r1i;
      dataStart = i + 1;
      break;
    }
  }

  // First pass: highest total for CUT/WD penalty
  let highestTotal = 288;
  for (let i = dataStart; i < lines.length; i++) {
    const tot = parseInt(parseCsvLine(lines[i])[totCol]);
    if (!isNaN(tot) && tot > highestTotal) highestTotal = tot;
  }

  const scores: GolferScore[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length <= playerCol) continue;
    const pos        = cols[posCol]?.trim() ?? "";
    const playerName = cols[playerCol]?.trim() ?? "";
    const scoreRaw   = cols[scoreCol]?.trim() ?? "";
    const r1  = parseInt(cols[r1Col]);
    const r2  = parseInt(cols[r1Col + 1]);
    const r3  = parseInt(cols[r1Col + 2]);
    const r4  = parseInt(cols[r1Col + 3]);
    const tot = parseInt(cols[totCol]);
    const scoreFmt = parseInt(cols[cols.length - 1]);

    // Skip header echoes, blank rows, movement indicator rows
    if (!playerName || playerName === "-" || playerName.toUpperCase() === "PLAYER") continue;
    // Skip rows that are clearly position numbers (all digits, short)
    if (/^\d+$/.test(playerName) && playerName.length <= 3) continue;

    const isCut    = scoreRaw.toUpperCase() === "CUT" || pos.toUpperCase() === "CUT";
    const isWD     = scoreRaw.toUpperCase() === "WD"  || pos.toUpperCase() === "WD";
    const isWinner = pos.trim() === "1";

    let finalScore: number;
    if (isCut)                 finalScore = (highestTotal + 2) - 288;
    else if (isWD)             finalScore = highestTotal - 288;
    else if (!isNaN(scoreFmt)) finalScore = scoreFmt;
    else if (scoreRaw === "E") finalScore = 0;
    else { const p = parseInt(scoreRaw.replace("+", "")); finalScore = isNaN(p) ? 0 : p; }

    scores.push({ espnName: playerName, position: pos, score: finalScore, r1: isNaN(r1)?undefined:r1, r2: isNaN(r2)?undefined:r2, r3: isNaN(r3)?undefined:r3, r4: isNaN(r4)?undefined:r4, totalStrokes: isNaN(tot)?undefined:tot, isCut, isWD, isWinner });
  }
  return scores;
}

export function findGolferScore(golferName: string, liveScores: GolferScore[], nameMappings: Record<string, string>, overrides: AdminOverride[]): GolferScore | null {
  const override = overrides.find(o => namesMatch(o.golferName, golferName) || namesMatch(o.golferName, nameMappings[normalizeName(golferName)] ?? ""));
  if (override) {
    const ht = liveScores.reduce((m, g) => Math.max(m, g.totalStrokes ?? 288), 288);
    return { espnName: golferName, position: override.overrideStatus, score: override.overrideStatus === "CUT" ? (ht+2)-288 : override.overrideStatus === "WD" ? ht-288 : (override.customScore??0), isCut: override.overrideStatus==="CUT", isWD: override.overrideStatus==="WD", isWinner: false };
  }
  let found = liveScores.find(g => namesMatch(g.espnName, golferName));
  if (found) return found;
  const mapped = nameMappings[normalizeName(golferName)];
  if (mapped) found = liveScores.find(g => namesMatch(g.espnName, mapped));
  return found ?? null;
}

export function calculateMajorScore(picks: Pick[], liveScores: GolferScore[], nameMappings: Record<string, string>, overrides: AdminOverride[], majorFinalized: boolean): MajorScore {
  const worst = liveScores.length > 0 ? Math.max(...liveScores.map(g => g.score)) : 20;
  const pickResults: PickResult[] = picks.map(pick => {
    const gs = findGolferScore(pick.golferName, liveScores, nameMappings, overrides);
    if (!gs) return { pick, score: worst, counted: false, rawScore: worst, status: "missing" as const };
    let status: PickResult["status"] = "active";
    if (gs.isWinner) status = "winner"; else if (gs.isCut) status = "cut"; else if (gs.isWD) status = "wd";
    return { pick, score: gs.score, counted: false, rawScore: gs.score, status };
  });
  const sorted = [...pickResults].sort((a,b) => a.score - b.score);
  sorted[0].counted = true; sorted[1].counted = true; sorted[2].counted = true;
  const countedScore = sorted.filter(r => r.counted).reduce((s,r) => s+r.score, 0);
  let bonus=0, bonusReason: string|undefined, winnersHit=0, topPickWon=false;
  for (const r of pickResults) {
    if (r.status === "winner") {
      winnersHit++;
      const tb = ODDS_BONUSES[r.pick.tier];
      if (r.pick.isTopPick) { topPickWon=true; if (tb.topPickBonus < bonus) { bonus=tb.topPickBonus; bonusReason=`Top Pick winner (${tb.label}) → ${tb.topPickBonus} strokes`; } }
      else { if (tb.standardBonus < bonus) { bonus=tb.standardBonus; bonusReason=`Winner picked (${tb.label}) → ${tb.standardBonus} strokes`; } }
    }
  }
  return { majorId: "" as MajorId, pickResults, countedScore, bonus, bonusReason, finalScore: countedScore+bonus, winnersHit, topPickWon, finalized: majorFinalized };
}

export function calculateStandings(entries: Entry[], majorScores: Record<string, Partial<Record<MajorId, MajorScore>>>): EntryStandings[] {
  const standings: EntryStandings[] = entries.map(entry => {
    const ems = majorScores[entry.id] ?? {};
    const mids = Object.keys(ems) as MajorId[];
    return { entryId: entry.id, entrantName: entry.entrantName, totalScore: mids.reduce((s,m) => s+(ems[m]?.finalScore??0),0), majorScores: ems, completedMajors: mids.length, totalWinnersHit: mids.reduce((s,m) => s+(ems[m]?.winnersHit??0),0), totalTopPickWins: mids.reduce((s,m) => s+(ems[m]?.topPickWon?1:0),0) };
  });
  standings.sort((a,b) => { if (a.totalScore!==b.totalScore) return a.totalScore-b.totalScore; if (a.totalWinnersHit!==b.totalWinnersHit) return b.totalWinnersHit-a.totalWinnersHit; return b.totalTopPickWins-a.totalTopPickWins; });
  let rank=1;
  for (let i=0; i<standings.length; i++) {
    if (i>0) { const p=standings[i-1],c=standings[i]; if (c.totalScore!==p.totalScore||c.totalWinnersHit!==p.totalWinnersHit||c.totalTopPickWins!==p.totalTopPickWins) rank=i+1; }
    standings[i].rank=rank;
  }
  return standings;
}

export function formatScore(score: number): string { if (score===0) return "E"; return score>0?`+${score}`:`${score}`; }
export function scoreColor(score: number): string { if (score<0) return "text-red-400"; if (score===0) return "text-white"; return "text-gray-400"; }