import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
export async function GET(req: NextRequest) {
  const majorId = req.nextUrl.searchParams.get("majorId");
  if (!majorId) return NextResponse.json({ major: null });
  const snap = await adminDb.collection("majors").doc(majorId).get();
  return NextResponse.json({ major: snap.exists ? snap.data() : null });
}
