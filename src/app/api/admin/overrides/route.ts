import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import type { AdminOverride } from "@/types";
export async function GET(req: NextRequest) {
  const majorId = req.nextUrl.searchParams.get("majorId");
  const snap = await adminDb.collection("overrides").where("majorId", "==", majorId).get();
  return NextResponse.json({ overrides: snap.docs.map(d => d.data() as AdminOverride) });
}
export async function POST(req: NextRequest) {
  const override: AdminOverride = await req.json();
  const id = `${override.majorId}_${override.golferName.replace(/\s+/g, "_").toLowerCase()}`;
  await adminDb.collection("overrides").doc(id).set(override);
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: NextRequest) {
  const { majorId, golferName } = await req.json();
  const id = `${majorId}_${golferName.replace(/\s+/g, "_").toLowerCase()}`;
  await adminDb.collection("overrides").doc(id).delete();
  return NextResponse.json({ ok: true });
}
