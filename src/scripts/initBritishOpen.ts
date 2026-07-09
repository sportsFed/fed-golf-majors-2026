/**
 * One-time setup: creates the majors/british-open document in Firestore if it
 * does not already exist. Safe to run multiple times — existing documents are
 * never overwritten.
 *
 * Run with:
 *   npm run init-british-open
 */

import * as fs from "fs";
import * as path from "path";
import * as admin from "firebase-admin";

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

async function main(): Promise<void> {
  const docRef = db.collection("majors").doc("british-open");
  const snap = await docRef.get();

  if (snap.exists) {
    console.log("majors/british-open already exists — skipping.");
    console.log("Existing data:", snap.data());
    return;
  }

  const majorData = {
    id: "british-open",
    name: "The Open Championship",
    short: "THE OPEN",
    status: "open",
    year: 2026,
    pickDeadline: "2026-07-17T11:00:00.000Z",
    sheetCsvUrl: "",
    noSubmissionPenalty: 48,
  };

  await docRef.set(majorData);
  console.log("✓ Created majors/british-open:");
  console.log(majorData);
}

main().catch((err) => {
  console.error("initBritishOpen failed:", err);
  process.exit(1);
});
