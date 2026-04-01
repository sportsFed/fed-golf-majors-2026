import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import type { MajorId, MajorEntry, Pick } from "@/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const entryId = searchParams.get("entryId");
  if (!entryId) return NextResponse.json({ error: "Missing entryId" }, { status: 400 });

  const snap = await adminDb.collection("entries").doc(entryId).get();
  if (!snap.exists) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(snap.data());
}

export async function POST(req: NextRequest) {
  const { entryId, majorId, picks } = await req.json() as { entryId: string; majorId: MajorId; picks: Pick[] };

  if (!entryId || !majorId || !picks?.length) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  if (picks.length !== 5) return NextResponse.json({ error: "Exactly 5 picks required" }, { status: 400 });

  // Validate major is open
  const majorSnap = await adminDb.collection("majors").doc(majorId).get();
  const major = majorSnap.data();
  if (major && major.status !== "open") return NextResponse.json({ error: "Picks are not currently open for this major" }, { status: 403 });

  // Check deadline
  if (major?.pickDeadline && new Date() > new Date(major.pickDeadline)) {
    return NextResponse.json({ error: "Pick deadline has passed" }, { status: 403 });
  }

  // Validate no duplicate golfers across other majors for this entry
  const entrySnap = await adminDb.collection("entries").doc(entryId).get();
  if (!entrySnap.exists) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  const entry = entrySnap.data()!;

  const usedInOtherMajors = new Set<string>();
  Object.entries(entry.majors ?? {}).forEach(([mid, me]: [string, any]) => {
    if (mid !== majorId) me.picks?.forEach((p: Pick) => usedInOtherMajors.add(p.golferName.toLowerCase()));
  });

  for (const pick of picks) {
    if (usedInOtherMajors.has(pick.golferName.toLowerCase())) {
      return NextResponse.json({ error: `${pick.golferName} has already been used in another major` }, { status: 400 });
    }
  }

  const majorEntry: MajorEntry = {
    majorId,
    picks: picks.map((p, i) => ({ ...p, isTopPick: i === 0 })),
    submittedAt: new Date().toISOString(),
    locked: false
  };

  await adminDb.collection("entries").doc(entryId).update({ [`majors.${majorId}`]: majorEntry });
  return NextResponse.json({ success: true });
}
