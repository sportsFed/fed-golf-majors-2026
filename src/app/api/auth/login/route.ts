import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { hashPin } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, pin } = await req.json();
    if (!email || !pin)
      return NextResponse.json({ error: "Missing fields." }, { status: 400 });

    const snap = await adminDb.collection("entries")
      .where("email", "==", email.toLowerCase()).get();

    if (snap.empty)
      return NextResponse.json({ error: "No account found with that email." }, { status: 404 });

    const entry = snap.docs[0].data();

    if (hashPin(pin) !== entry.pinHash)
      return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });

    return NextResponse.json({
      entryId: entry.id,
      entrantName: entry.entrantName,
      email: entry.email
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
