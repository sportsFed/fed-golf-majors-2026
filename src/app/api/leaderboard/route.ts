import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { parseEspnCsv, calculateMajorScore, calculateStandings, normalizeName } from "@/lib/scoring";
import type { Entry, MajorId, AdminOverride, NameMapping, Major, MajorScore } from "@/types";

export async function GET() {
  try {
    const [entriesSnap, majorsSnap] = await Promise.all([
      adminDb.collection("entries").get(),
      adminDb.collection("majors").get()
    ]);
    const entries = entriesSnap.docs.map(d => d.data() as Entry);
    const majors = majorsSnap.docs.map(d => d.data() as Major);
    const majorScores: Record<string, Partial<Record<MajorId, MajorScore>>> = {};
    entries.forEach(e => { majorScores[e.id] = {}; });

    for (const major of majors) {
      if (major.status === "upcoming" || major.status === "open") continue;

      if (major.status === "finalized") {
        const finalSnap = await adminDb.collection("finalizedScores").where("majorId", "==", major.id).get();
        finalSnap.docs.forEach(d => {
          const data = d.data();
          if (majorScores[data.entryId]) majorScores[data.entryId][major.id as MajorId] = data as MajorScore;
        });
        continue;
      }

      let liveScores: ReturnType<typeof parseEspnCsv> = [];
      if (major.sheetCsvUrl) {
        try {
          const csvRes = await fetch(major.sheetCsvUrl, { next: { revalidate: 300 } });
          if (csvRes.ok) { const text = await csvRes.text(); liveScores = parseEspnCsv(text); }
        } catch {}
      }

      const [overridesSnap, mappingsSnap] = await Promise.all([
        adminDb.collection("overrides").where("majorId", "==", major.id).get(),
        adminDb.collection("nameMappings").where("majorId", "==", major.id).get()
      ]);
      const overrides = overridesSnap.docs.map(d => d.data() as AdminOverride);
      const nameMappings: Record<string, string> = {};
      mappingsSnap.docs.map(d => d.data() as NameMapping).forEach(m => { nameMappings[normalizeName(m.adminName)] = m.espnName; });

      for (const entry of entries) {
        const majorEntry = entry.majors?.[major.id as MajorId];
        if (!majorEntry?.picks?.length) continue;
        const ms = calculateMajorScore(majorEntry.picks, liveScores, nameMappings, overrides, false);
        ms.majorId = major.id as MajorId;
        majorScores[entry.id][major.id as MajorId] = ms;
      }
    }

    const standings = calculateStandings(entries, majorScores);
    return NextResponse.json({ standings });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ standings: [] });
  }
}
