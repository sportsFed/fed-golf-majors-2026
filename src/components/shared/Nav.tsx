"use client";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { getSession, clearSession } from "@/lib/auth";

export default function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  const session = getSession();

  const links: { href: string; label: string; mobileLabel: string | null; title?: string }[] = [
    { href: "/leaderboard", label: "Leaderboard", mobileLabel: "LB" },
    { href: "/picks",        label: "My Picks",    mobileLabel: "Picks" },
    { href: "/analysis",     label: "Analysis",    mobileLabel: null },
    { href: "/head-to-head", label: "H2H",         mobileLabel: "H2H" },
    { href: "/admin",        label: "⚙",           mobileLabel: "⚙", title: "Admin" }
  ];

  return (
    <nav style={{ background: "rgba(10,22,40,0.95)", borderBottom: "3px solid #DC2626", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, flexWrap: "nowrap", overflow: "hidden" }}>
        <button onClick={() => router.push("/leaderboard")}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
          <Image src="/British26_fed.png" alt="Fed Golf Majors - The Open Championship" width={34} height={34} style={{ objectFit: "contain", borderRadius: "50%", boxShadow: "0 0 0 2px rgba(255,255,255,0.12)" }} />
          <span className="nav-wordmark" style={{ fontFamily: "'Playfair Display', serif", color: "#f0faf4", fontWeight: 700, fontSize: "0.95rem", letterSpacing: "0.01em" }}>
            Fed Golf Majors <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>2026</span>
          </span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          {links.map(link => (
            <button key={link.href} onClick={() => router.push(link.href)} title={link.title}
              className={link.mobileLabel === null ? "nav-hide-mobile" : undefined}
              style={{
                background: pathname.startsWith(link.href) ? "rgba(240,192,64,0.1)" : "transparent",
                border: "none", borderRadius: 6,
                color: pathname.startsWith(link.href) ? "var(--green-400)" : "var(--text-muted)",
                padding: link.href === "/admin" ? "6px 10px" : "6px 12px", fontFamily: "'DM Sans', sans-serif",
                fontWeight: 500, fontSize: "0.85rem", cursor: "pointer", transition: "all 0.15s"
              }}>
              <span className="nav-label-desktop">{link.label}</span>
              {link.mobileLabel !== null && <span className="nav-label-mobile">{link.mobileLabel}</span>}
            </button>
          ))}
          {session && (
            <button onClick={() => { clearSession(); router.push("/login"); }} style={{
              marginLeft: 6, background: "transparent", border: "1px solid var(--border)",
              borderRadius: 6, color: "var(--text-muted)", padding: "5px 10px",
              fontFamily: "'DM Sans', sans-serif", fontSize: "0.78rem", cursor: "pointer"
            }}>Sign Out</button>
          )}
        </div>
      </div>
    </nav>
  );
}
