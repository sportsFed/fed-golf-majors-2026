import {
  doc, getDoc, setDoc, updateDoc, collection,
  getDocs, query, where, serverTimestamp, deleteDoc
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  Entry, Major, FieldGolfer, NameMapping, AdminOverride,
  AppSettings, MajorId, MajorScore
} from "@/types";

// ─── APP SETTINGS ─────────────────────────────────────────────────────────

export async function getAppSettings(): Promise<AppSettings | null> {
  const snap = await getDoc(doc(db, "settings", "app"));
  return snap.exists() ? (snap.data() as AppSettings) : null;
}

export async function updateAppSettings(data: Partial<AppSettings>) {
  await setDoc(doc(db, "settings", "app"), data, { merge: true });
}

// ─── MAJORS ───────────────────────────────────────────────────────────────

export async function getMajors(): Promise<Major[]> {
  const snap = await getDocs(collection(db, "majors"));
  return snap.docs.map(d => d.data() as Major);
}

export async function getMajor(majorId: MajorId): Promise<Major | null> {
  const snap = await getDoc(doc(db, "majors", majorId));
  return snap.exists() ? (snap.data() as Major) : null;
}

export async function saveMajor(major: Major) {
  await setDoc(doc(db, "majors", major.id), major);
}

// ─── FIELD / GOLFERS ──────────────────────────────────────────────────────

export async function getField(majorId: MajorId): Promise<FieldGolfer[]> {
  const snap = await getDocs(
    query(collection(db, "field"), where("majorId", "==", majorId))
  );
  return snap.docs.map(d => d.data() as FieldGolfer);
}

export async function saveField(golfers: FieldGolfer[]) {
  // Batch in groups of 20 to stay well under Firestore 500-write limit
  const chunks = [];
  for (let i = 0; i < golfers.length; i += 20) chunks.push(golfers.slice(i, i + 20));
  for (const chunk of chunks) {
    await Promise.all(chunk.map(g => setDoc(doc(db, "field", `${g.majorId}_${g.id}`), g)));
  }
}

export async function deleteField(majorId: MajorId) {
  const snap = await getDocs(
    query(collection(db, "field"), where("majorId", "==", majorId))
  );
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}

// ─── ENTRIES ──────────────────────────────────────────────────────────────

export async function getEntries(): Promise<Entry[]> {
  const snap = await getDocs(collection(db, "entries"));
  return snap.docs.map(d => d.data() as Entry);
}

export async function getEntry(entryId: string): Promise<Entry | null> {
  const snap = await getDoc(doc(db, "entries", entryId));
  return snap.exists() ? (snap.data() as Entry) : null;
}

export async function getEntryByEmail(email: string): Promise<Entry | null> {
  const snap = await getDocs(
    query(collection(db, "entries"), where("email", "==", email.toLowerCase()))
  );
  if (snap.empty) return null;
  return snap.docs[0].data() as Entry;
}

export async function saveEntry(entry: Entry) {
  await setDoc(doc(db, "entries", entry.id), entry);
}

export async function updateEntryMajorPicks(
  entryId: string,
  majorId: MajorId,
  majorEntry: Entry["majors"][MajorId]
) {
  await updateDoc(doc(db, "entries", entryId), {
    [`majors.${majorId}`]: majorEntry
  });
}

// ─── NAME MAPPINGS ────────────────────────────────────────────────────────

export async function getNameMappings(majorId: MajorId): Promise<NameMapping[]> {
  const snap = await getDocs(
    query(collection(db, "nameMappings"), where("majorId", "==", majorId))
  );
  return snap.docs.map(d => d.data() as NameMapping);
}

export async function saveNameMapping(mapping: NameMapping) {
  const id = `${mapping.majorId}_${mapping.adminName.replace(/\s+/g, "_").toLowerCase()}`;
  await setDoc(doc(db, "nameMappings", id), mapping);
}

export async function deleteNameMapping(majorId: MajorId, adminName: string) {
  const id = `${majorId}_${adminName.replace(/\s+/g, "_").toLowerCase()}`;
  await deleteDoc(doc(db, "nameMappings", id));
}

// ─── ADMIN OVERRIDES ──────────────────────────────────────────────────────

export async function getOverrides(majorId: MajorId): Promise<AdminOverride[]> {
  const snap = await getDocs(
    query(collection(db, "overrides"), where("majorId", "==", majorId))
  );
  return snap.docs.map(d => d.data() as AdminOverride);
}

export async function saveOverride(override: AdminOverride) {
  const id = `${override.majorId}_${override.golferName.replace(/\s+/g, "_").toLowerCase()}`;
  await setDoc(doc(db, "overrides", id), override);
}

export async function deleteOverride(majorId: MajorId, golferName: string) {
  const id = `${majorId}_${golferName.replace(/\s+/g, "_").toLowerCase()}`;
  await deleteDoc(doc(db, "overrides", id));
}

// ─── FINALIZED SCORES ─────────────────────────────────────────────────────

export async function saveFinalizedMajorScore(
  entryId: string,
  majorId: MajorId,
  score: MajorScore
) {
  const { majorId: _mid, ...scoreData } = score;
  await setDoc(
    doc(db, "finalizedScores", `${entryId}_${majorId}`),
    { entryId, majorId, ...scoreData, finalizedAt: serverTimestamp() }
  );
}

export async function getFinalizedScores(
  majorId: MajorId
): Promise<Array<{ entryId: string } & MajorScore>> {
  const snap = await getDocs(
    query(collection(db, "finalizedScores"), where("majorId", "==", majorId))
  );
  return snap.docs.map(d => d.data() as { entryId: string } & MajorScore);
}