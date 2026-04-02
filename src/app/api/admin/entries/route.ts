import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { hashPin } from "@/lib/auth";

export async function GET() {
  const snap = await adminDb.collection("entries").get();
  const entries = snap.docs
    .map(d => {
      const data = d.data();
      delete data.pinHash; // remove hash, plain pin shown if stored
      return data;
    })
    .sort((a, b) => a.entrantName.localeCompare(b.entrantName));
  return NextResponse.json({ entries });
}

// PIN reset endpoint
export async function POST(req: NextRequest) {
  try {
    const { entryId, newPin } = await req.json();
    if (!entryId || !newPin) return NextResponse.json({ error: "Missing fields." }, { status: 400 });
    if (!/^\d{4}$/.test(newPin)) return NextResponse.json({ error: "PIN must be 4 digits." }, { status: 400 });
    await adminDb.collection("entries").doc(entryId).update({
      pin: newPin,
      pinHash: hashPin(newPin)
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}