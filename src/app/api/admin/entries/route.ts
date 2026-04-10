import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { hashPin } from "@/lib/auth";

export async function GET() {
  const snap = await adminDb.collection("entries")
    .select("id", "entrantName", "email", "pin", "createdAt", "majors")
    .get();
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

// Manual score override endpoint
export async function PATCH(req: NextRequest) {
  try {
    const { entryId, majorId, manualScore } = await req.json();
    if (!entryId || !majorId || manualScore === undefined || manualScore === null) {
      return NextResponse.json({ error: "Missing fields." }, { status: 400 });
    }
    const score = Number(manualScore);
    if (isNaN(score)) {
      return NextResponse.json({ error: "manualScore must be a number." }, { status: 400 });
    }
    await adminDb.collection("entries").doc(entryId).set(
      {
        majors: {
          [majorId]: {
            manualScore: score,
            picks: [],
            submittedAt: "admin-override"
          }
        }
      },
      { merge: true }
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}