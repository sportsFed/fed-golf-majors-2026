import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { parseEspnCsv } from "@/lib/scoring";
export async function GET(req: NextRequest) {
  const majorId = req.nextUrl.searchParams.get("majorId");
  if (!majorId) return NextResponse.json({ names: [] });
  const majorSnap = await adminDb.collection("majors").doc(majorId).get();
  const major = majorSnap.data();
  if (!major?.sheetCsvUrl) return NextResponse.json({ names: [] });
  try {
    const res = await fetch(major.sheetCsvUrl);
    if (!res.ok) return NextResponse.json({ names: [] });
    const text = await res.text();
    const scores = parseEspnCsv(text);
    const names = scores.map(s => s.espnName).filter(Boolean).sort();
    return NextResponse.json({ names });
  } catch { return NextResponse.json({ names: [] }); }
}
