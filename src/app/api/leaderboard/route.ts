import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { parseEspnCsv, calculateMajorScore, calculateStandings, normalizeName } from "@/lib/scoring";
import type { Entry, MajorId, AdminOverride, NameMapping, Major, MajorScore } from "@/types";

// Simple in-memory throttle — prevents snapshot on every single request
const lastSnapshot: Record<string, number> = {};
const SNAPSHOT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let cachedResult: any = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

async function maybeSnapshot(majorId: string, liveScores: ReturnType<typeof parseEspnCsv>, entries: Entry[], overrides: AdminOverride[], nameMappings: Record<string, string>) {
  const now = Date.now();
  if (lastSnapshot[majorId] && now - lastSnapshot[majorId] < SNAPSHOT_INTERVAL_MS) return;
  lastSnapshot[majorId] = now;

  try {
    const timestamp = new Date().toISOString();
    const batch = adminDb.batch();
    let count = 0;
    for (const entry of entries) {
      const majorEntry = entry.majors?.[majorId as MajorId];
      if (!majorEntry?.picks?.length) continue;
      const ms = calculateMajorScore(majorEntry.picks, liveScores, nameMappings, overrides, false);
      const pickDetail = ms.pickResults.map(pr => ({
        golfer: pr.pick.golferName, score: pr.score,
        status: pr.status, counted: pr.counted, isTopPick: pr.pick.isTopPick
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
  } catch (e) {
    console.error("Snapshot error:", e);
  }
}

export async function GET() {
  const now = Date.now();
  if (cachedResult && now - cacheTimestamp < CACHE_TTL_MS) {
    return NextResponse.json(cachedResult);
  }

  try {
    const [entriesSnap, majorsSnap] = await Promise.all([
      adminDb.collection("entries").get(),
      adminDb.collection("majors").get()
    ]);
    const entries = entriesSnap.docs.map(d => d.data() as Entry);
    const majors = majorsSnap.docs.map(d => d.data() as Major);
    const majorScores: Record<string, Partial<Record<MajorId, MajorScore>>> = {};
    entries.forEach(e => { majorScores[e.id] = {}; });

    // Determine the active (live) major upfront so we can fetch overrides/nameMappings once
    const activeMajor = majors.find(m => m.status !== "upcoming" && m.status !== "open" && m.status !== "finalized") ?? null;

    const [activeOverrides, activeMappingsSnap] = activeMajor
      ? await Promise.all([
          adminDb.collection("overrides").where("majorId", "==", activeMajor.id).get(),
          adminDb.collection("nameMappings").where("majorId", "==", activeMajor.id).get()
        ])
      : [null, null];

    const preloadedOverrides: AdminOverride[] = activeOverrides ? activeOverrides.docs.map(d => d.data() as AdminOverride) : [];
    const preloadedNameMappings: Record<string, string> = {};
    if (activeMappingsSnap) {
      activeMappingsSnap.docs.map(d => d.data() as NameMapping).forEach(m => {
        preloadedNameMappings[normalizeName(m.adminName)] = m.espnName;
      });
    }

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
        // No snapshots yet — fall through to live calculation
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

      // Use preloaded overrides/nameMappings for the active major; fall back to a fresh fetch for any other live major
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

        // If the entry has real picks, score them normally
        if (majorEntry?.picks?.length) {
          const ms = calculateMajorScore(majorEntry.picks, liveScores, nameMappings, overrides, false);
          ms.majorId = major.id as MajorId;
          majorScores[entry.id][major.id as MajorId] = ms;
          continue;
        }

        // If no picks but a manualScore was set by admin, use it as a synthetic MajorScore
        if (majorEntry?.manualScore !== undefined && majorEntry.manualScore !== null) {
          const syntheticMs: MajorScore = {
            majorId: major.id as MajorId,
            finalScore: majorEntry.manualScore,
            countedScore: majorEntry.manualScore,
            bonus: 0,
            bonusReason: "",
            winnersHit: 0,
            topPickWon: false,
            pickResults: [],
            finalized: false,
          };
          majorScores[entry.id][major.id as MajorId] = syntheticMs;
        }
      }

      // Auto-snapshot throttled to every 30 min
      if (liveScores.length > 0) {
        maybeSnapshot(major.id, liveScores, entries, overrides, nameMappings);
      }
    }

    const standings = calculateStandings(entries, majorScores);

    cachedResult = { standings };
    cacheTimestamp = Date.now();

    return NextResponse.json({ standings });
  } catch (e: any) {
    console.error(e);
    if (cachedResult) {
      console.log("Returning cached result due to error");
      return NextResponse.json(cachedResult);
    }
    return NextResponse.json({ standings: [] });
  }
}
