import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import type { FieldGolfer } from "@/types";
export async function GET(req: NextRequest) {
  const majorId = req.nextUrl.searchParams.get("majorId");
  if (!majorId) return NextResponse.json({ golfers: [] });
  const snap = await adminDb.collection("field").where("majorId", "==", majorId).get();
  const golfers = snap.docs.map(d => d.data() as FieldGolfer).sort((a, b) => a.displayName.localeCompare(b.displayName));
  return NextResponse.json({ golfers });
}
export async function POST(req: NextRequest) {
  try {
    const { majorId, golfers } = await req.json();
    if (!majorId || !golfers) return NextResponse.json({ error: "Missing data." }, { status: 400 });
    const existing = await adminDb.collection("field").where("majorId", "==", majorId).get();
    const batch = adminDb.batch();
    existing.docs.forEach(d => batch.delete(d.ref));
    golfers.forEach((g: FieldGolfer) => batch.set(adminDb.collection("field").doc(`${majorId}_${g.id}`), g));
    await batch.commit();
    return NextResponse.json({ ok: true, count: golfers.length });
  } catch (e) { return NextResponse.json({ error: "Server error." }, { status: 500 }); }
}
