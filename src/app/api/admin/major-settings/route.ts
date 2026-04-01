import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
export async function GET(req: NextRequest) {
  const majorId = req.nextUrl.searchParams.get("majorId");
  if (!majorId) return NextResponse.json({ major: null });
  const snap = await adminDb.collection("majors").doc(majorId).get();
  return NextResponse.json({ major: snap.exists ? snap.data() : null });
}
export async function POST(req: NextRequest) {
  try {
    const { majorId, pickDeadline, status, sheetCsvUrl } = await req.json();
    if (!majorId) return NextResponse.json({ error: "Missing majorId." }, { status: 400 });
    const MAJOR_NAMES: Record<string, string> = { masters: "The Masters", pga: "PGA Championship", "us-open": "U.S. Open", "british-open": "The Open Championship" };
    await adminDb.collection("majors").doc(majorId).set({ id: majorId, name: MAJOR_NAMES[majorId] ?? majorId, pickDeadline, status, sheetCsvUrl, year: 2026 }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: "Server error." }, { status: 500 }); }
}
