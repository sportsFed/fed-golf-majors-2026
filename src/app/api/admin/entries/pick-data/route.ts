import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const entryId = req.nextUrl.searchParams.get("entryId");
  if (!entryId) return NextResponse.json({ majors: {} });
  const snap = await adminDb.collection("entries").doc(entryId).get();
  if (!snap.exists) return NextResponse.json({ majors: {} });
  return NextResponse.json({ majors: snap.data()?.majors ?? {} });
}
