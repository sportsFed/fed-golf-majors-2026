import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import type { MajorId, NameMapping } from "@/types";

function mappingId(majorId: string, adminName: string) {
  return `${majorId}_${adminName.replace(/\s+/g, "_").toLowerCase()}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const majorId = searchParams.get("majorId") as MajorId;
  const snap = await adminDb.collection("nameMappings").where("majorId", "==", majorId).get();
  return NextResponse.json(snap.docs.map(d => d.data()));
}

export async function POST(req: NextRequest) {
  const mapping: NameMapping = await req.json();
  await adminDb.collection("nameMappings").doc(mappingId(mapping.majorId, mapping.adminName)).set(mapping);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { majorId, adminName } = await req.json();
  await adminDb.collection("nameMappings").doc(mappingId(majorId, adminName)).delete();
  return NextResponse.json({ ok: true });
}
