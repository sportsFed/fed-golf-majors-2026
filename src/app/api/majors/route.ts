import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import type { MajorId } from "@/types";

const DEFAULT_MAJORS = [
  { id: "masters", name: "The Masters", shortName: "Masters", dates: "Apr 10–13", year: 2026, pickDeadline: "", status: "upcoming", sheetCsvUrl: "" },
  { id: "pga", name: "PGA Championship", shortName: "PGA", dates: "May 15–18", year: 2026, pickDeadline: "", status: "upcoming", sheetCsvUrl: "" },
  { id: "us-open", name: "U.S. Open", shortName: "US Open", dates: "Jun 12–15", year: 2026, pickDeadline: "", status: "upcoming", sheetCsvUrl: "" },
  { id: "british-open", name: "The Open Championship", shortName: "British Open", dates: "Jul 17–20", year: 2026, pickDeadline: "", status: "upcoming", sheetCsvUrl: "" }
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const majorId = searchParams.get("majorId") as MajorId | null;

  if (majorId) {
    const snap = await adminDb.collection("majors").doc(majorId).get();
    if (!snap.exists) {
      const def = DEFAULT_MAJORS.find(m => m.id === majorId);
      return NextResponse.json(def ?? null);
    }
    return NextResponse.json(snap.data());
  }

  const snap = await adminDb.collection("majors").get();
  if (snap.empty) return NextResponse.json(DEFAULT_MAJORS);
  return NextResponse.json(snap.docs.map(d => d.data()));
}
