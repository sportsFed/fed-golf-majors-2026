import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const entryId = req.nextUrl.searchParams.get("entryId");
  if (!entryId) return NextResponse.json({ majors: {} });

  try {
    const snap = await adminDb.collection("entries").doc(entryId).get();
    if (!snap.exists) {
      console.error(`Entry not found: ${entryId}`);
      return NextResponse.json({ majors: {}, error: "Entry not found" });
    }
    const data = snap.data();
    // Return the full majors map — picks are nested under each major key
    return NextResponse.json({ 
      majors: data?.majors ?? {},
      entrantName: data?.entrantName,
      email: data?.email
    });
  } catch (e) {
    console.error("my-picks error:", e);
    return NextResponse.json({ majors: {} });
  }
}