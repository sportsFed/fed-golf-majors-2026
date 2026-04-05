import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
export async function GET() {
  const snap = await adminDb.collection("majors").get();
  const majors = snap.docs.map(d => d.data());
  return NextResponse.json({ majors });
}