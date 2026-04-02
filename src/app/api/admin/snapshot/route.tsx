import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { parseEspnCsv, calculateMajorScore, normalizeName } from "@/lib/scoring";
import type { Entry, MajorId, AdminOverride, NameMapping, Major } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { majorId } = await req.json();
    if (!majorId) return NextResponse.json({ error: "Missing majorId." }, { status: 400 });

    const majorSnap = await adminDb.collection("majors").doc(majorId).get();
    const major = majorSnap.data() as Major;
    if (!major?.sheetCsvUrl) return NextResponse.json({ error: "No sheet URL configured." }, { status: 400 });

    const csvRes = await fetch(major.sheetCsvUrl);
    if (!csvRes.ok) return NextResponse.json({ error: "Could not fetch sheet." }, { status: 502 });
    const liveScores = parseEspnCsv(await csvRes.text());

    const [entriesSnap, overridesSnap, mappingsSnap] = await Promise.all([
      adminDb.collection("entries").get(),
      adminDb.collection("overrides").where("majorId", "==", majorId).get(),
      adminDb.collection("nameMappings").where("majorId", "==", majorId).get()
    ]);

    const overrides = overridesSnap.docs.map(d => d.data() as AdminOverride);
    const nameMappings: Record<string, string> = {};
    mappingsSnap.docs.map(d => d.data() as NameMapping).forEach(m => {
      nameMappings[normalizeName(m.adminName)] = m.espnName;
    });

    const timestamp = new Date().toISOString();
    const batch = adminDb.batch();
    let count = 0;

    for (const entryDoc of entriesSnap.docs) {
      const entry = entryDoc.data() as Entry;
      const majorEntry = entry.majors?.[majorId as MajorId];
      if (!majorEntry?.picks?.length) continue;

      const ms = calculateMajorScore(majorEntry.picks, liveScores, nameMappings, overrides, false);
      const pickDetail = ms.pickResults.map(pr => ({
        golfer: pr.pick.golferName,
        score: pr.score,
        status: pr.status,
        counted: pr.counted,
        isTopPick: pr.pick.isTopPick
      }));

      const snapshotId = `${entry.id}_${majorId}_${Date.now()}_${count}`;
      batch.set(adminDb.collection("scoreHistory").doc(snapshotId), {
        entryId: entry.id, entrantName: entry.entrantName,
        majorId, timestamp, totalScore: ms.finalScore,
        countedScore: ms.countedScore, bonus: ms.bonus, picks: pickDetail
      });
      count++;
    }

    await batch.commit();
    return NextResponse.json({ ok: true, count, timestamp });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Snapshot failed." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const entryId = req.nextUrl.searchParams.get("entryId");
  const majorId = req.nextUrl.searchParams.get("majorId");
  if (!entryId && !majorId) return NextResponse.json({ history: [] });
  let q: any = adminDb.collection("scoreHistory");
  if (entryId) q = q.where("entryId", "==", entryId);
  if (majorId) q = q.where("majorId", "==", majorId);
  const snap = await q.get();
  const history = snap.docs.map((d: any) => d.data())
    .sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp));
  return NextResponse.json({ history });
}