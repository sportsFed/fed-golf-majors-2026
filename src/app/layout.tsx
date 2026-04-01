import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fed – Golf Majors 2026",
  description: "The official Fed Golf Majors Pool — Masters, PGA, US Open, British Open"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
