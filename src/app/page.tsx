"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const session = getSession();
    if (session) {
      router.replace("/leaderboard");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--fairway-dark)" }}>
      <div className="text-green-400 font-mono text-sm animate-pulse">Loading…</div>
    </div>
  );
}
