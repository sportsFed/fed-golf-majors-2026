import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { parseEspnCsv, calculateMajorScore } from "@/lib/scoring";
import { computeStandings } from "@/lib/getStandings";
import type { Entry, MajorId, AdminOverride } from "@/types";

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
    const { standings, entries, liveMajorContexts } = await computeStandings();

    for (const { majorId, liveScores, overrides, nameMappings } of liveMajorContexts) {
      maybeSnapshot(majorId, liveScores, entries, overrides, nameMappings);
    }

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
