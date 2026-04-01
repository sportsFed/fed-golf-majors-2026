import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { pin } = await req.json();
  if (pin === process.env.ADMIN_PIN) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
}
