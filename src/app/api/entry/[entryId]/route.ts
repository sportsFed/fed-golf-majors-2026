import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
export async function GET(req: NextRequest, { params }: { params: { entryId: string } }) {
  const snap = await adminDb.collection("entries").doc(params.entryId).get();
  if (!snap.exists) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const data = snap.data()!;
  delete data.pinHash;
  return NextResponse.json(data);
}
