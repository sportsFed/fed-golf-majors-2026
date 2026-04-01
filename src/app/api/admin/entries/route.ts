import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
export async function GET() {
  const snap = await adminDb.collection("entries").orderBy("createdAt", "asc").get();
  const entries = snap.docs.map(d => { const data = d.data(); delete data.pinHash; return data; });
  return NextResponse.json({ entries });
}
