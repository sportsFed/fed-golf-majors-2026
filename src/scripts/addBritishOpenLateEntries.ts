/**
 * One-time script: adds five British Open late-entry golfers to the field,
 * adds their nameMappings, withdraws Louis Oosthuizen, and audits who picked him.
 *
 * Run with:
 *   npm run add-late-entries
 */

import * as fs from "fs";
import * as path from "path";
import * as admin from "firebase-admin";
import type { MajorId, OddsTier, Entry } from "../types";

// ── Load .env.local before initializeApp so credentials are available ─────────
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
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
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
const MAJOR_ID: MajorId = "british-open";
const WITHDRAWN_REASON = "Withdrew with back injury";

// The live "field" collection stores golfers as { id, displayName, tier, majorId, ... },
// keyed by doc id `${majorId}_${id}` — NOT the golferId/golferName/isActive shape.
// isActive/withdrawnReason are not read by any existing UI/API code; they are written
// here as forward-compatible metadata so the withdrawal is recorded without deleting data.
interface FieldGolferDoc {
  id: string;
  displayName: string;
  tier: OddsTier;
  majorId: MajorId;
  isActive: boolean;
  withdrawnReason?: string;
}

interface NameMappingDoc {
  majorId: MajorId;
  adminName: string;
  espnName: string;
  displayAs: string;
}

const NEW_GOLFERS: FieldGolferDoc[] = [
  { id: "johnny-keefer", displayName: "Johnny Keefer", tier: "5000plus", majorId: MAJOR_ID, isActive: true },
  { id: "michael-thorbjornsen", displayName: "Michael Thorbjornsen", tier: "5000plus", majorId: MAJOR_ID, isActive: true },
  { id: "victor-perez", displayName: "Victor Perez", tier: "5000plus", majorId: MAJOR_ID, isActive: true },
  { id: "joe-dean", displayName: "Joe Dean", tier: "5000plus", majorId: MAJOR_ID, isActive: true },
  { id: "aldrich-potgieter", displayName: "Aldrich Potgieter", tier: "5000plus", majorId: MAJOR_ID, isActive: true },
];

const NEW_MAPPINGS: { docId: string; mapping: NameMappingDoc }[] = [
  { docId: "british-open_johnny_keefer", mapping: { majorId: MAJOR_ID, adminName: "Johnny Keefer", espnName: "Johnny Keefer", displayAs: "J. Keefer" } },
  { docId: "british-open_michael_thorbjornsen", mapping: { majorId: MAJOR_ID, adminName: "Michael Thorbjornsen", espnName: "Michael Thorbjornsen", displayAs: "M. Thorbjornsen" } },
  { docId: "british-open_victor_perez", mapping: { majorId: MAJOR_ID, adminName: "Victor Perez", espnName: "Victor Perez", displayAs: "V. Perez" } },
  { docId: "british-open_joe_dean", mapping: { majorId: MAJOR_ID, adminName: "Joe Dean", espnName: "Joe Dean", displayAs: "J. Dean" } },
  { docId: "british-open_aldrich_potgieter", mapping: { majorId: MAJOR_ID, adminName: "Aldrich Potgieter", espnName: "Aldrich Potgieter", displayAs: "A. Potgieter" } },
];

async function main(): Promise<void> {
  // ── STEP 1: Add golfers to field ─────────────────────────────────────────
  let fieldWritten = 0;
  let fieldSkipped = 0;

  for (const golfer of NEW_GOLFERS) {
    const docId = `${MAJOR_ID}_${golfer.id}`;
    const ref = db.collection("field").doc(docId);
    const snap = await ref.get();
    if (snap.exists) {
      console.log(`SKIP field  ${docId} — already exists`);
      fieldSkipped++;
    } else {
      await ref.set(golfer);
      console.log(`WRITE field ${docId} — ${golfer.displayName}`);
      fieldWritten++;
    }
  }

  // ── STEP 2: Add nameMappings ──────────────────────────────────────────────
  let mappingsWritten = 0;
  let mappingsSkipped = 0;

  for (const { docId, mapping } of NEW_MAPPINGS) {
    const ref = db.collection("nameMappings").doc(docId);
    const snap = await ref.get();
    if (snap.exists) {
      console.log(`SKIP mapping ${docId} — already exists`);
      mappingsSkipped++;
    } else {
      await ref.set(mapping);
      console.log(`WRITE mapping ${docId} — ${mapping.adminName}`);
      mappingsWritten++;
    }
  }

  // ── STEP 3: Withdraw Louis Oosthuizen ─────────────────────────────────────
  let oosthuizenStatus = "not found";

  const fieldSnap = await db.collection("field").where("majorId", "==", MAJOR_ID).get();
  const oosthuizenDoc = fieldSnap.docs.find(d => {
    const displayName = (d.data() as { displayName?: string }).displayName ?? "";
    return displayName.toLowerCase().includes("oosthuizen");
  });

  if (oosthuizenDoc) {
    const data = oosthuizenDoc.data();
    console.log(`FOUND field/${oosthuizenDoc.id} — ${data.displayName} (isActive: ${data.isActive})`);
    await oosthuizenDoc.ref.update({ isActive: false, withdrawnReason: WITHDRAWN_REASON });
    console.log(`WITHDREW field/${oosthuizenDoc.id} — isActive: false, withdrawnReason: "${WITHDRAWN_REASON}"`);
    oosthuizenStatus = "active→inactive";
  } else {
    console.log(`No field document found for majorId=${MAJOR_ID} matching "Oosthuizen"`);
  }

  const nameMappingsSnap = await db.collection("nameMappings").where("majorId", "==", MAJOR_ID).get();
  const oosthuizenMapping = nameMappingsSnap.docs.find(d => {
    const adminName = (d.data() as { adminName?: string }).adminName ?? "";
    return adminName.toLowerCase().includes("oosthuizen");
  });

  if (oosthuizenMapping) {
    console.log(`FOUND nameMappings/${oosthuizenMapping.id} — ${oosthuizenMapping.data().adminName} (no field change needed)`);
  } else {
    console.log(`No nameMappings document found for majorId=${MAJOR_ID} matching "Oosthuizen"`);
  }

  // ── STEP 4: Audit who picked Oosthuizen ───────────────────────────────────
  const entriesSnap = await db.collection("entries").get();
  const oosthuizenPickers: { entrantName: string; email: string; entryId: string }[] = [];

  for (const entryDoc of entriesSnap.docs) {
    const data = entryDoc.data() as Entry;
    const entryId = data.id ?? entryDoc.id;
    const boEntry = data.majors?.[MAJOR_ID];
    const picks = boEntry?.picks ?? [];

    const hasOosthuizen = picks.some(p => {
      const name = (p.golferName ?? "").toLowerCase();
      const id = (p.golferId ?? "").toLowerCase();
      return name.includes("oosthuizen") || id.includes("oosthuizen");
    });

    if (hasOosthuizen) {
      const entrantName = data.entrantName ?? "(unknown)";
      const email = data.email ?? "(unknown)";
      console.log(`PICKED OOSTHUIZEN: ${entrantName} | ${email} | ${entryId}`);
      oosthuizenPickers.push({ entrantName, email, entryId });
    }
  }

  if (oosthuizenPickers.length === 0) {
    console.log("Oosthuizen audit: 0 entries have him in their british-open picks.");
  } else {
    console.log(`Oosthuizen audit: ${oosthuizenPickers.length} entries have him in their british-open picks.`);
  }

  // ── STEP 5: Summary ────────────────────────────────────────────────────────
  console.log("\n──── SUMMARY ────");
  console.log(`Field: ${fieldWritten} written, ${fieldSkipped} skipped.`);
  console.log(`Mappings: ${mappingsWritten} written, ${mappingsSkipped} skipped.`);
  console.log(`Oosthuizen: ${oosthuizenStatus}`);
  console.log(`Oosthuizen picked by: ${oosthuizenPickers.length} entries`);
  for (const p of oosthuizenPickers) {
    console.log(`${p.entrantName} | ${p.email}`);
  }
}

main().catch((err) => {
  console.error("addBritishOpenLateEntries failed:", err);
  process.exit(1);
});
