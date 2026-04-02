import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import type { NameMapping } from "@/types";

export async function GET(req: NextRequest) {
  const majorId = req.nextUrl.searchParams.get("majorId");
  const snap = await adminDb.collection("nameMappings").where("majorId", "==", majorId).get();
  return NextResponse.json({ mappings: snap.docs.map(d => d.data()) });
}

export async function POST(req: NextRequest) {
  const { majorId, adminName, espnName, displayAs } = await req.json();
  const id = `${majorId}_${adminName.replace(/\s+/g, "_").toLowerCase()}`;
  await adminDb.collection("nameMappings").doc(id).set({ majorId, adminName, espnName, displayAs: displayAs ?? "" });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { majorId, adminName } = await req.json();
  const id = `${majorId}_${adminName.replace(/\s+/g, "_").toLowerCase()}`;
  await adminDb.collection("nameMappings").doc(id).delete();
  return NextResponse.json({ ok: true });
}