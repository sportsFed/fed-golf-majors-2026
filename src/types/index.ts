// ─── MAJORS ────────────────────────────────────────────────────────────────

export type MajorId = "masters" | "pga" | "us-open" | "british-open";

export interface Major {
  id: MajorId;
  name: string;
  shortName: string;
  dates: string;
  year: number;
  pickDeadline: string; // ISO datetime string
  status: "upcoming" | "open" | "locked" | "active" | "finalized";
  sheetCsvUrl: string;
  winnerId?: string; // golfer name as matched in sheet
}

// ─── GOLFERS ───────────────────────────────────────────────────────────────

export type OddsTier = "even-999" | "1000-2499" | "2500-4999" | "5000plus" | "field";

export interface OddsBonus {
  tier: OddsTier;
  label: string;         // e.g. "Even to +999"
  oddsRange: string;
  standardBonus: number; // e.g. -2
  topPickBonus: number;  // e.g. -5
}

export const ODDS_BONUSES: Record<OddsTier, OddsBonus> = {
  "even-999": {
    tier: "even-999",
    label: "Even to +999",
    oddsRange: "Even – +999",
    standardBonus: -2,
    topPickBonus: -5
  },
  "1000-2499": {
    tier: "1000-2499",
    label: "+1000 to +2499",
    oddsRange: "+1000 – +2499",
    standardBonus: -3,
    topPickBonus: -6
  },
  "2500-4999": {
    tier: "2500-4999",
    label: "+2500 to +4999",
    oddsRange: "+2500 – +4999",
    standardBonus: -5,
    topPickBonus: -8
  },
  "5000plus": {
    tier: "5000plus",
    label: "+5000 and above",
    oddsRange: "+5000+",
    standardBonus: -7,
    topPickBonus: -10
  },
  "field": {
    tier: "field",
    label: "Field",
    oddsRange: "Field",
    standardBonus: -7,
    topPickBonus: -10
  }
};

export interface FieldGolfer {
  id: string;            // normalized name used as key
  displayName: string;   // exactly as admin entered
  espnName?: string;     // mapped ESPN name (set via name-match tool)
  odds?: number;         // e.g. 1400 (for +1400)
  tier: OddsTier;
  majorId: MajorId;
}

// ─── ENTRIES & PICKS ───────────────────────────────────────────────────────

export interface Pick {
  golferId: string;      // matches FieldGolfer.id
  golferName: string;    // display name
  isTopPick: boolean;    // slot 1 = top pick
  tier: OddsTier;
}

export interface MajorEntry {
  majorId: MajorId;
  picks: Pick[];         // always 5, picks[0] is Top Pick
  submittedAt: string;
  locked: boolean;
}

export interface Entry {
  id: string;
  entrantName: string;
  email: string;
  pinHash: string;
  createdAt: string;
  majors: Record<MajorId, MajorEntry>;
}

// ─── SCORING ───────────────────────────────────────────────────────────────

export interface GolferScore {
  espnName: string;
  position: string;      // "1", "T3", "CUT", "WD", "MC" etc.
  score: number;         // relative to par as integer (e.g. -21, +4, 0)
  r1?: number;
  r2?: number;
  r3?: number;
  r4?: number;
  totalStrokes?: number;
  isCut: boolean;
  isWD: boolean;
  isWinner: boolean;
}

export interface PickResult {
  pick: Pick;
  score: number;         // final score used (after CUT/WD adjustment)
  counted: boolean;      // is this in the best 3?
  rawScore: number;      // score before adjustments
  status: "active" | "cut" | "wd" | "missing" | "winner";
}

export interface MajorScore {
  majorId: MajorId;
  pickResults: PickResult[];
  countedScore: number;  // sum of best 3
  bonus: number;         // negative number or 0
  bonusReason?: string;  // e.g. "Top Pick winner (+5000+)"
  finalScore: number;    // countedScore + bonus
  winnersHit: number;    // number of winners picked (0 or 1 max)
  topPickWon: boolean;
  finalized: boolean;
}

export interface EntryStandings {
  entryId: string;
  entrantName: string;
  totalScore: number;
  majorScores: Partial<Record<MajorId, MajorScore>>;
  completedMajors: number;
  totalWinnersHit: number;  // tiebreaker 1
  totalTopPickWins: number; // tiebreaker 2
  rank?: number;
}

// ─── ADMIN ─────────────────────────────────────────────────────────────────

export interface NameMapping {
  adminName: string;     // as entered in field import
  espnName: string;      // as it appears in ESPN sheet
  majorId: MajorId;
}

export interface AdminOverride {
  majorId: MajorId;
  golferName: string;    // ESPN name
  overrideStatus: "CUT" | "WD" | "CUSTOM";
  customScore?: number;
  reason?: string;
  setAt: string;
}

export interface AppSettings {
  majors: Major[];
  currentMajorId?: MajorId;
  lastSheetFetch?: string;
  sheetFetchError?: string;
}
