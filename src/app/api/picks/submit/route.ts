import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import type { MajorId } from "@/types";
export async function POST(req: NextRequest) {
  try {
    const { entryId, majorId, picks } = await req.json();
    if (!entryId || !majorId || !picks || picks.length !== 5)
      return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
    const majorSnap = await adminDb.collection("majors").doc(majorId).get();
    const major = majorSnap.data();
    if (major?.pickDeadline && new Date(major.pickDeadline) < new Date())
      return NextResponse.json({ error: "Pick deadline has passed." }, { status: 403 });
    if (major?.status === "locked" || major?.status === "finalized")
      return NextResponse.json({ error: "Picks are locked." }, { status: 403 });
    const entrySnap = await adminDb.collection("entries").doc(entryId).get();
    const entry = entrySnap.data();
    const newPickIds = picks.map((p: any) => p.golferId);
    const otherMajorIds = ["masters", "pga", "us-open", "british-open"].filter(m => m !== majorId);
    for (const mid of otherMajorIds) {
      const existing = entry?.majors?.[mid]?.picks ?? [];
      const existingIds = existing.map((p: any) => p.golferId);
      const overlap = newPickIds.filter((id: string) => existingIds.includes(id));
      if (overlap.length > 0) {
        const names = picks.filter((p: any) => overlap.includes(p.golferId)).map((p: any) => p.golferName).join(", ");
        return NextResponse.json({ error: `${names} already used in another major.` }, { status: 400 });
      }
    }
    await adminDb.collection("entries").doc(entryId).set({ [`majors.${majorId}`]: { picks, submittedAt: new Date().toISOString(), locked: false } }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: "Server error." }, { status: 500 }); }
}
