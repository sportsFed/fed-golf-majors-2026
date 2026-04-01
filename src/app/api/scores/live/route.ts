import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { parseEspnCsv } from "@/lib/scoring";
import type { MajorId } from "@/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const majorId = searchParams.get("majorId") as MajorId;

  const majorSnap = await adminDb.collection("majors").doc(majorId).get();
  const major = majorSnap.data();
  if (!major?.sheetCsvUrl) return NextResponse.json({ names: [] });

  try {
    const res = await fetch(major.sheetCsvUrl);
    if (!res.ok) return NextResponse.json({ names: [] });
    const csv = await res.text();
    const scores = parseEspnCsv(csv);
    return NextResponse.json({ names: scores.map(s => s.espnName) });
  } catch {
    return NextResponse.json({ names: [] });
  }
}
