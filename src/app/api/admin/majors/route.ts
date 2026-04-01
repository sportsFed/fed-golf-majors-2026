import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import type { Major } from "@/types";

export async function POST(req: NextRequest) {
  const major: Major = await req.json();
  if (!major.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await adminDb.collection("majors").doc(major.id).set(major, { merge: true });
  return NextResponse.json({ ok: true });
}
