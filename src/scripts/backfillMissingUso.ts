/**
 * One-time backfill: writes finalizedScores documents for entries that were
 * missing them after US Open finalization.
 *
 * Entries with no submitted picks were silently skipped by the finalization
 * route (the `if (!majorEntry?.picks?.length) continue` guard). This script
 * creates penalty documents for every entry that still lacks one.
 *
 * It also handles Mark Canchola's missing PGA document specifically.
 *
 * Run with:
 *   npm run backfill-uso
 * (requires `npm install -D ts-node` if not already installed)
 */

import * as fs from "fs";
import * as path from "path";
import * as admin from "firebase-admin";

// ── Load .env.local before initializeApp so credentials are available ─────────
// firebase-admin itself does nothing at import time; initializeApp below is the
// first SDK call, so env vars just need to be set before that line.
function loadEnvLocal(): void {
  const envPath = path.resolve(__dirname, "..", "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    console.warn(".env.local not found — relying on environment variables already set.");
    return;
  }
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding double-quotes (as written in .env.local.example)
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    // Restore literal \n sequences (used in FIREBASE_ADMIN_PRIVATE_KEY)
    process.env[key] = val.replace(/\\n/g, "\n");
  }
  console.log("Loaded .env.local");
}

loadEnvLocal();

// ── Firebase Admin init ───────────────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    }),
  });
}
const db = admin.firestore();

// ── Constants ─────────────────────────────────────────────────────────────────
// These match the penalty scores agreed upon for the two affected majors.
// They are NOT derived from the major document because this is a one-time
// historical backfill for specific known values.
const US_OPEN_PENALTY = 48;
const PGA_PENALTY = 44;

const US_OPEN_ID = "us-open";
const PGA_ID = "pga";

// ── Helpers ───────────────────────────────────────────────────────────────────
function penaltyDoc(
  entryId: string,
  majorId: string,
  finalScore: number
): Record<string, unknown> {
  return {
    entryId,
    majorId,
    majorId_str: majorId,
    pickResults: [],
    countedScore: finalScore,
    bonus: 0,
    bonusReason: null,
    finalScore,
    winnersHit: 0,
    topPickWon: false,
    finalized: true,
    finalizedAt: new Date().toISOString(),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const entriesSnap = await db.collection("entries").get();
  console.log(`\nFound ${entriesSnap.docs.length} total entries.\n`);

  let written = 0;
  let skipped = 0;

  for (const entryDoc of entriesSnap.docs) {
    const data = entryDoc.data() as { id?: string; entrantName?: string };
    // Some entries store their ID in the document; fall back to the doc ID.
    const entryId: string = data.id ?? entryDoc.id;
    const entrantName: string = data.entrantName ?? "(unknown)";

    // ── US Open ──────────────────────────────────────────────────────────────
    const usoDocId = `${entryId}_${US_OPEN_ID}`;
    const usoRef = db.collection("finalizedScores").doc(usoDocId);
    const usoSnap = await usoRef.get();

    if (usoSnap.exists) {
      console.log(`SKIP  ${usoDocId}  (${entrantName}) — already exists`);
      skipped++;
    } else {
      await usoRef.set(penaltyDoc(entryId, US_OPEN_ID, US_OPEN_PENALTY));
      console.log(
        `WRITE ${usoDocId}  (${entrantName}) — finalScore: ${US_OPEN_PENALTY}`
      );
      written++;
    }

    // ── Mark Canchola PGA backfill ───────────────────────────────────────────
    if (entrantName === "Mark Canchola") {
      const pgaDocId = `${entryId}_${PGA_ID}`;
      const pgaRef = db.collection("finalizedScores").doc(pgaDocId);
      const pgaSnap = await pgaRef.get();

      if (pgaSnap.exists) {
        console.log(`SKIP  ${pgaDocId}  (${entrantName}) — already exists`);
        skipped++;
      } else {
        await pgaRef.set(penaltyDoc(entryId, PGA_ID, PGA_PENALTY));
        console.log(
          `WRITE ${pgaDocId}  (${entrantName}) — finalScore: ${PGA_PENALTY}`
        );
        written++;
      }
    }
  }

  console.log(`\n✓ Done. Written: ${written}  Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
