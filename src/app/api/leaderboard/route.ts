// Updated route.ts content

// Your existing imports...

// ...

if (!majorEntry?.picks?.length) {
  // Assign a penalty score for entries with no picks for this major
  // Sum only rounds that have been played (non-zero worst scores)
  // Each round worst score is already strokes over par for that round
  // r1, r2, r3, r4 from getWorstRoundScores are raw stroke totals
  // Par per round is 72. So worst relative score per round = worstRound - 72
  // Only count rounds where worst > 0 (round has been played)
  const roundPenalties = [
    worstScores.r1 > 0 ? worstScores.r1 - 72 : 0,
    worstScores.r2 > 0 ? worstScores.r2 - 72 : 0,
    worstScores.r3 > 0 ? worstScores.r3 - 72 : 0,
    worstScores.r4 > 0 ? worstScores.r4 - 72 : 0,
  ];
  const penaltyScore = roundPenalties.reduce((sum, r) => sum + r, 0);
  const penaltyMs: MajorScore = {
    majorId: major.id as MajorId,
    pickResults: [],
    countedScore: penaltyScore,
    bonus: 0,
    bonusReason: undefined,
    finalScore: penaltyScore,
    winnersHit: 0,
    topPickWon: false,
    finalized: false,
  };
  majorScores[entry.id][major.id as MajorId] = penaltyMs;
  continue;
}

// Additional existing content...