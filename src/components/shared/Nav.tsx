"use client";
import { useRouter, usePathname } from "next/navigation";
import { getSession, clearSession, getAdminSession } from "@/lib/auth";

const MAJOR_ORDER = ["masters", "pga", "us-open", "british-open"];
const MAJOR_SHORT: Record<string, string> = {
  masters: "Masters", pga: "PGA", "us-open": "US Open", "british-open": "British Open"
};

export default function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  const session = getSession();
  const isAdmin = getAdminSession();

  const links = [
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/picks", label: "My Picks" },
    { href: "/head-to-head", label: "H2H" },
    ...(isAdmin ? [{ href: "/admin", label: "⚙ Admin" }] : [])
  ];

  function handleLogout() {
    clearSession();
    router.push("/login");
  }

  return (
    <nav style={{
      background: "rgba(10,31,20,0.95)",
      borderBottom: "1px solid var(--border)",
      backdropFilter: "blur(12px)",
      position: "sticky", top: 0, zIndex: 50
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
        {/* Logo */}
        <button
          onClick={() => router.push("/leaderboard")}
          style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <span style={{ fontSize: "1.4rem" }}>⛳</span>
          <span style={{ fontFamily: "'Playfair Display', serif", color: "#f0faf4", fontWeight: 700, fontSize: "1rem", letterSpacing: "0.01em" }}>
            Fed Golf Majors <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>2026</span>
          </span>
        </button>

        {/* Links */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {links.map(link => (
            <button
              key={link.href}
              onClick={() => router.push(link.href)}
              style={{
                background: pathname.startsWith(link.href) ? "rgba(77,189,136,0.1)" : "transparent",
                border: "none",
                borderRadius: 6,
                color: pathname.startsWith(link.href) ? "var(--green-400)" : "var(--text-muted)",
                padding: "6px 14px",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 500,
                fontSize: "0.88rem",
                cursor: "pointer",
                transition: "all 0.15s"
              }}
            >
              {link.label}
            </button>
          ))}

          {session && (
            <button
              onClick={handleLogout}
              style={{
                marginLeft: 8, background: "transparent", border: "1px solid var(--border)",
                borderRadius: 6, color: "var(--text-muted)", padding: "5px 12px",
                fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", cursor: "pointer"
              }}
            >
              Sign Out
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
