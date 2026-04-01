import Cookies from "js-cookie";

const SESSION_KEY = "golf_session";
const ADMIN_KEY = "golf_admin";

// Simple hash for PIN — not crypto-grade but fine for a pool app
export function hashPin(pin: string): string {
  let hash = 0;
  const str = pin + "golf2026salt";
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function verifyPin(pin: string, hash: string): boolean {
  return hashPin(pin) === hash;
}

export interface Session {
  entryId: string;
  entrantName: string;
  email: string;
}

export function getSession(): Session | null {
  try {
    const raw = Cookies.get(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session, remember: boolean) {
  const opts = remember ? { expires: 90 } : undefined; // 90 days
  Cookies.set(SESSION_KEY, JSON.stringify(session), opts);
}

export function clearSession() {
  Cookies.remove(SESSION_KEY);
  Cookies.remove(ADMIN_KEY);
}

export function getAdminSession(): boolean {
  return Cookies.get(ADMIN_KEY) === "true";
}

export function setAdminSession() {
  Cookies.set(ADMIN_KEY, "true", { expires: 1 }); // 1 day
}

export function clearAdminSession() {
  Cookies.remove(ADMIN_KEY);
}
