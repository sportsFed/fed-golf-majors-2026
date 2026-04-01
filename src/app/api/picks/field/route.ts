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
