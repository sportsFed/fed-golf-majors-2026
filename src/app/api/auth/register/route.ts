import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { hashPin } from "@/lib/auth";
import type { Entry } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { email, name, pin } = await req.json();
    if (!email || !name || !pin) return NextResponse.json({ error: "Missing fields." }, { status: 400 });
    if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: "PIN must be 4 digits." }, { status: 400 });
    const existing = await adminDb.collection("entries").where("email", "==", email.toLowerCase()).get();
    if (!existing.empty) return NextResponse.json({ error: "Email already registered." }, { status: 409 });
    const entryId = `entry_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const entry: Entry = { id: entryId, entrantName: name.trim(), email: email.toLowerCase(), pinHash: hashPin(pin), createdAt: new Date().toISOString(), majors: {} as any };
    await adminDb.collection("entries").doc(entryId).set(entry);
    return NextResponse.json({ entryId, entrantName: name });
  } catch (e) { return NextResponse.json({ error: "Server error." }, { status: 500 }); }
}
