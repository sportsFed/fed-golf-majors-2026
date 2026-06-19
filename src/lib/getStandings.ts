import { adminDb } from "@/lib/firebase-admin";
import { parseEspnCsv, calculateMajorScore, calculateStandings, normalizeName } from "@/lib/scoring";
import type { Entry, MajorId, AdminOverride, NameMapping, Major, MajorScore, EntryStandings } from "@/types";

export interface LiveMajorContext {
  majorId: string;
  liveScores: ReturnType<typeof parseEspnCsv>;
  overrides: AdminOverride[];
  nameMappings: Record<string, string>;
}

export interface StandingsResult {
  standings: EntryStandings[];
  entries: Entry[];
  liveMajorContexts: LiveMajorContext[];
}

export async function computeStandings(): Promise<StandingsResult> {
  const [entriesSnap, majorsSnap] = await Promise.all([
    adminDb.collection("entries").get(),
    adminDb.collection("majors").get()
  ]);
  const entries = entriesSnap.docs.map(d => d.data() as Entry);
  const majors = majorsSnap.docs.map(d => d.data() as Major);
  const majorScores: Record<string, Partial<Record<MajorId, MajorScore>>> = {};
  entries.forEach(e => { majorScores[e.id] = {}; });

  const activeMajor = majors.find(
    m => m.status !== "upcoming" && m.status !== "open" && m.status !== "finalized"
  ) ?? null;

  const [activeOverrides, activeMappingsSnap] = activeMajor
    ? await Promise.all([
        adminDb.collection("overrides").where("majorId", "==", activeMajor.id).get(),
        adminDb.collection("nameMappings").where("majorId", "==", activeMajor.id).get()
      ])
    : [null, null];

  const preloadedOverrides: AdminOverride[] = activeOverrides
    ? activeOverrides.docs.map(d => d.data() as AdminOverride)
    : [];
  const preloadedNameMappings: Record<string, string> = {};
  if (activeMappingsSnap) {
    activeMappingsSnap.docs.map(d => d.data() as NameMapping).forEach(m => {
      preloadedNameMappings[normalizeName(m.adminName)] = m.espnName;
    });
  }

  const liveMajorContexts: LiveMajorContext[] = [];

  for (const major of majors) {
    if (major.status === "upcoming" || major.status === "open") continue;

    if (major.status === "finalized") {
      const finalSnap = await adminDb.collection("finalizedScores")
        .where("majorId", "==", major.id).get();
      if (!finalSnap.empty) {
        finalSnap.docs.forEach(d => {
          const data = d.data();
          if (majorScores[data.entryId])
            majorScores[data.entryId][major.id as MajorId] = data as MajorScore;
        });
        continue;
      }
    }

    let liveScores: ReturnType<typeof parseEspnCsv> = [];
    if (major.sheetCsvUrl) {
      try {
        const csvRes = await fetch(major.sheetCsvUrl, { next: { revalidate: 300 } });
        if (csvRes.ok) {
          const csvText = await csvRes.text();
          liveScores = parseEspnCsv(csvText);
        }
      } catch {}
    }

    let overrides: AdminOverride[];
    let nameMappings: Record<string, string>;
    if (activeMajor && major.id === activeMajor.id) {
      overrides = preloadedOverrides;
      nameMappings = preloadedNameMappings;
    } else {
      const [overridesSnap, mappingsSnap] = await Promise.all([
        adminDb.collection("overrides").where("majorId", "==", major.id).get(),
        adminDb.collection("nameMappings").where("majorId", "==", major.id).get()
      ]);
      overrides = overridesSnap.docs.map(d => d.data() as AdminOverride);
      nameMappings = {};
      mappingsSnap.docs.map(d => d.data() as NameMapping).forEach(m => {
        nameMappings[normalizeName(m.adminName)] = m.espnName;
      });
    }

    for (const entry of entries) {
      const majorEntry = entry.majors?.[major.id as MajorId];

      if (!majorEntry?.picks?.length) {
        const entryAny = majorEntry as any;
        if (entryAny?.manualScore !== undefined && entryAny?.manualScore !== null) {
          majorScores[entry.id][major.id as MajorId] = {
            majorId: major.id as MajorId,
            pickResults: [],
            countedScore: Number(entryAny.manualScore),
            bonus: 0,
            bonusReason: null,
            finalScore: Number(entryAny.manualScore),
            winnersHit: 0,
            topPickWon: false,
            finalized: false
          } as any;
        }
        continue;
      }

      const ms = calculateMajorScore(majorEntry.picks, liveScores, nameMappings, overrides, false);
      ms.majorId = major.id as MajorId;
      majorScores[entry.id][major.id as MajorId] = ms;
    }

    if (liveScores.length > 0) {
      liveMajorContexts.push({ majorId: major.id, liveScores, overrides, nameMappings });
    }
  }

  const standings = calculateStandings(entries, majorScores);
  return { standings, entries, liveMajorContexts };
}
