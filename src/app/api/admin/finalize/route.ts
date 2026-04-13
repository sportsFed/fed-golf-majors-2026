import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { parseEspnCsv, calculateMajorScore, normalizeName } from "@/lib/scoring";
import type { Entry, MajorId, AdminOverride, NameMapping, FieldGolfer } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { majorId } = await req.json();
    if (!majorId) return NextResponse.json({ error: "Missing majorId." }, { status: 400 });

    const majorSnap = await adminDb.collection("majors").doc(majorId).get();
    const major = majorSnap.data();
    if (!major) return NextResponse.json({ error: "Major not found." }, { status: 404 });

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
      if (!majorEntry?.picks?.length) continue;

      const ms = calculateMajorScore(majorEntry.picks, liveScores, nameMappings, overrides, true);
      ms.majorId = majorId as MajorId;

      const scoreRef = adminDb.collection("finalizedScores").doc(`${entry.id}_${majorId}`);
      const { majorId: _mid, ...msRest } = ms;
      batch.set(scoreRef, { 
        entryId: entry.id, 
        majorId,
        ...msRest,
        bonusReason: msRest.bonusReason ?? null,
        finalizedAt: new Date().toISOString() 
      });
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
