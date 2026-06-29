import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { parseEspnCsv, calculateMajorScore, normalizeName } from "@/lib/scoring";
import type { Entry, MajorId, AdminOverride, NameMapping, FieldGolfer } from "@/types";

// Fallback penalty for entries with no submitted picks when the major document
// does not specify a noSubmissionPenalty field.
const NO_SUBMISSION_PENALTY = 48;

export async function POST(req: NextRequest) {
  try {
    const { majorId } = await req.json();
    if (!majorId) return NextResponse.json({ error: "Missing majorId." }, { status: 400 });

    const majorSnap = await adminDb.collection("majors").doc(majorId).get();
    const major = majorSnap.data();
    if (!major) return NextResponse.json({ error: "Major not found." }, { status: 404 });

    // Penalty score applied to entries that never submitted picks for this major.
    // Reads from the major document so each major can have its own penalty.
    const noSubmissionPenalty: number =
      typeof major.noSubmissionPenalty === "number"
        ? major.noSubmissionPenalty
        : NO_SUBMISSION_PENALTY;

    // Fetch live scores one final time
    let liveScores: ReturnType<typeof parseEspnCsv> = [];
    if (major.sheetCsvUrl) {
      const csvRes = await fetch(major.sheetCsvUrl);
      if (csvRes.ok) { const text = await csvRes.text(); liveScores = parseEspnCsv(text); }
    }

    const [entriesSnap, overridesSnap, mappingsSnap] = await Promise.all([
      adminDb.collection("entries").get(),
      adminDb.collection("overrides").where("majorId", "==", majorId).get(),
      adminDb.collection("nameMappings").where("majorId", "==", majorId).get()
    ]);

    const overrides = overridesSnap.docs.map(d => d.data() as AdminOverride);
    const rawMappings = mappingsSnap.docs.map(d => d.data() as NameMapping);
    const nameMappings: Record<string, string> = {};
    rawMappings.forEach(m => { nameMappings[normalizeName(m.adminName)] = m.espnName; });

    const batch = adminDb.batch();
    let count = 0;

    for (const entryDoc of entriesSnap.docs) {
      const entry = entryDoc.data() as Entry;
      const majorEntry = entry.majors?.[majorId as MajorId];
      const scoreRef = adminDb.collection("finalizedScores").doc(`${entry.id}_${majorId}`);
      let scoreData: Record<string, any>;

      if (!majorEntry?.picks?.length) {
        // Entry was never submitted for this major — write a penalty document instead
        // of skipping so the entry appears on the leaderboard with the correct score.
        scoreData = {
          entryId: entry.id,
          majorId: majorId,
          majorId_str: String(majorId),
          pickResults: [],
          countedScore: noSubmissionPenalty,
          bonus: 0,
          bonusReason: null,
          finalScore: noSubmissionPenalty,
          winnersHit: 0,
          topPickWon: false,
          finalized: true,
          finalizedAt: new Date().toISOString()
        };
      } else {
        const ms = calculateMajorScore(majorEntry.picks, liveScores, nameMappings, overrides, true);
        ms.majorId = majorId as MajorId;

        scoreData = {
          entryId: entry.id,
          majorId: majorId,
          majorId_str: String(majorId),
          pickResults: ms.pickResults.map(pr => ({
            pick: pr.pick,
            score: pr.score,
            counted: pr.counted,
            rawScore: pr.rawScore,
            status: pr.status
          })),
          countedScore: ms.countedScore,
          bonus: ms.bonus,
          bonusReason: ms.bonusReason !== undefined ? ms.bonusReason : null,
          finalScore: ms.finalScore,
          winnersHit: ms.winnersHit,
          topPickWon: ms.topPickWon,
          finalized: true,
          finalizedAt: new Date().toISOString()
        };

        // Remove any undefined values before writing to Firestore
        Object.keys(scoreData).forEach(key => {
          if (scoreData[key] === undefined) scoreData[key] = null;
        });
      }

      batch.set(scoreRef, scoreData);
      count++;
    }

    // Mark major as finalized
    batch.set(adminDb.collection("majors").doc(majorId), { status: "finalized" }, { merge: true });
    await batch.commit();

    return NextResponse.json({ ok: true, message: `✓ Finalized ${count} entries for ${major.name ?? majorId}.` });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error during finalization." }, { status: 500 });
  }
}
