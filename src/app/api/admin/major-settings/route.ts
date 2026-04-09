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
    const body = await req.json();
    const { majorId, pickDeadline, status, sheetCsvUrl } = body;
    if (!majorId) return NextResponse.json({ error: "Missing majorId." }, { status: 400 });
    const NAMES: Record<string, string> = {
      masters: "The Masters", pga: "PGA Championship",
      "us-open": "U.S. Open", "british-open": "The Open Championship"
    };
    const update: Record<string, any> = { id: majorId, name: NAMES[majorId] ?? majorId, year: 2026 };
    if (status !== undefined) update.status = status;
    if (pickDeadline !== undefined) update.pickDeadline = pickDeadline;
    if (sheetCsvUrl !== undefined) update.sheetCsvUrl = sheetCsvUrl;
    await adminDb.collection("majors").doc(majorId).set(update, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}