"use client";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/shared/Nav";
import { getSession } from "@/lib/auth";
import { ODDS_BONUSES, oddsToTier } from "@/lib/scoring";
import { formatScore } from "@/lib/scoring";
import type { MajorId, FieldGolfer, Entry } from "@/types";

// Need to re-export oddsToTier from scoring since it's defined there
import { oddsToTier as getOddsTier } from "@/lib/scoring";

const MAJOR_NAMES: Record<MajorId, string> = {
  masters: "The Masters",
  pga: "PGA Championship",
  "us-open": "U.S. Open",
  "british-open": "The Open Championship"
};

interface PickSlot {
  golfer: FieldGolfer | null;
}

export default function MajorPickPage({ params }: { params: Promise<{ majorId: string }> }) {
  const { majorId } = use(params);
  const router = useRouter();
  const session = getSession();

  const [field, setField] = useState<FieldGolfer[]>([]);
  const [existingEntry, setExistingEntry] = useState<Entry | null>(null);
  const [slots, setSlots] = useState<PickSlot[]>([null, null, null, null, null].map(() => ({ golfer: null })));
  const [search, setSearch] = useState("");
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [usedAcrossMajors, setUsedAcrossMajors] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [majorOpen, setMajorOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) { router.push("/login"); return; }

    async function load() {
      const [fieldRes, entryRes, majorRes] = await Promise.all([
        fetch(`/api/admin/field?majorId=${majorId}`),
        fetch(`/api/picks?entryId=${session!.entryId}`),
        fetch(`/api/majors?majorId=${majorId}`)
      ]);

      if (fieldRes.ok) setField(await fieldRes.json());

      if (entryRes.ok) {
        const entry: Entry = await entryRes.json();
        setExistingEntry(entry);

        // Collect used golfers from other majors
        const used = new Set<string>();
        Object.entries(entry.majors ?? {}).forEach(([mid, me]) => {
          if (mid !== majorId) me.picks?.forEach(p => used.add(p.golferName.toLowerCase()));
        });
        setUsedAcrossMajors(used);

        // Pre-fill existing picks for this major
        const existing = entry.majors?.[majorId as MajorId];
        if (existing?.picks?.length) {
          const prefilled = existing.picks.map((p) => ({
            golfer: { id: p.golferId, displayName: p.golferName, tier: p.tier, majorId: majorId as MajorId } as FieldGolfer
          }));
          while (prefilled.length < 5) prefilled.push({ golfer: null });
          setSlots(prefilled);
        }
      }

      if (majorRes.ok) {
        const major = await majorRes.json();
        setMajorOpen(major.status === "open");
      }

      setLoading(false);
    }
    load();
  }, [majorId, router]);

  const pickedIds = new Set(slots.map(s => s.golfer?.id).filter(Boolean));

  const filteredField = field.filter(g => {
    if (!search) return true;
    return g.displayName.toLowerCase().includes(search.toLowerCase());
  });

  function selectGolfer(golfer: FieldGolfer) {
    if (activeSlot === null) return;
    const newSlots = [...slots];
    newSlots[activeSlot] = { golfer };
    setSlots(newSlots);
    setActiveSlot(null);
    setSearch("");
  }

  function clearSlot(idx: number) {
    const newSlots = [...slots];
    newSlots[idx] = { golfer: null };
    setSlots(newSlots);
  }

  async function handleSubmit() {
    const filled = slots.filter(s => s.golfer !== null);
    if (filled.length !== 5) { setError("You must select exactly 5 golfers."); return; }

    setSubmitting(true);
    setError("");

    const picks = slots.map((s, i) => ({
      golferId: s.golfer!.id,
      golferName: s.golfer!.displayName,
      isTopPick: i === 0,
      tier: s.golfer!.tier
    }));

    try {
      const res = await fetch("/api/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: session!.entryId, majorId, picks })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Submission failed."); return; }
      setSuccess(true);
      setTimeout(() => router.push("/picks"), 2000);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}>
      <Nav />
      <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-muted)" }}>Loading field…</div>
    </div>
  );

  if (!majorOpen) return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}>
      <Nav />
      <div style={{ maxWidth: 600, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
        <div className="card" style={{ padding: "48px" }}>
          <div style={{ fontSize: "2rem", marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", color: "#f0faf4", marginBottom: 12 }}>Picks Not Open</h2>
          <p style={{ color: "var(--text-muted)" }}>Pick submission for this major is not currently open.</p>
          <button className="btn-secondary" onClick={() => router.push("/picks")} style={{ marginTop: 20 }}>← Back to Picks</button>
        </div>
      </div>
    </div>
  );

  if (success) return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}>
      <Nav />
      <div style={{ maxWidth: 500, margin: "100px auto", padding: "0 20px", textAlign: "center" }}>
        <div className="card" style={{ padding: "48px" }}>
          <div style={{ fontSize: "3rem", marginBottom: 16 }}>✅</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", color: "#f0faf4", fontSize: "1.6rem" }}>Picks Submitted!</h2>
          <p style={{ color: "var(--text-muted)", marginTop: 8 }}>Redirecting to your picks…</p>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway-dark)" }}>
      <Nav />
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <button onClick={() => router.push("/picks")} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.85rem", marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>
            ← Back
          </button>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "2rem", color: "#f0faf4", marginBottom: 4 }}>
            {MAJOR_NAMES[majorId as MajorId]}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
            Select 5 golfers. Slot 1 is your <span style={{ color: "#facc15" }}>★ Top Pick</span>. Best 3 of 5 scores count.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
          {/* LEFT: Pick slots */}
          <div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", marginBottom: 12, letterSpacing: "0.06em" }}>
              Your Selections
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {slots.map((slot, idx) => (
                <div
                  key={idx}
                  onClick={() => { if (!slot.golfer) setActiveSlot(idx); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "14px 16px", borderRadius: 10, cursor: slot.golfer ? "default" : "pointer",
                    border: `1px solid ${activeSlot === idx ? "var(--green-400)" : idx === 0 ? "rgba(250,204,21,0.3)" : "var(--border)"}`,
                    background: idx === 0 ? "rgba(250,204,21,0.04)" : "rgba(17,45,28,0.6)",
                    transition: "all 0.15s"
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    background: idx === 0 ? "rgba(250,204,21,0.15)" : "rgba(77,189,136,0.1)",
                    color: idx === 0 ? "#facc15" : "var(--text-muted)",
                    fontSize: "0.8rem", fontFamily: "'DM Mono', monospace", fontWeight: 700, flexShrink: 0
                  }}>
                    {idx === 0 ? "★" : idx + 1}
                  </div>

                  {slot.golfer ? (
                    <>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#f0faf4", fontWeight: idx === 0 ? 600 : 400 }}>{slot.golfer.displayName}</div>
                        <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                          <span className={`tier-badge tier-${slot.golfer.tier}`}>
                            {ODDS_BONUSES[slot.golfer.tier]?.oddsRange}
                          </span>
                          <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", fontFamily: "'DM Mono', monospace" }}>
                            Win bonus: {idx === 0
                              ? formatScore(ODDS_BONUSES[slot.golfer.tier].topPickBonus)
                              : formatScore(ODDS_BONUSES[slot.golfer.tier].standardBonus)}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); clearSlot(idx); }}
                        style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.1rem", padding: "4px" }}
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                      {activeSlot === idx ? "Search and select below →" : idx === 0 ? "Click to select Top Pick" : "Click to select golfer"}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Bonus summary */}
            <div className="card" style={{ marginTop: 20, padding: "16px" }}>
              <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", marginBottom: 10 }}>
                Potential Win Bonuses
              </div>
              {Object.values(ODDS_BONUSES).map(tier => (
                <div key={tier.tier} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "0.8rem", borderBottom: "1px solid rgba(77,189,136,0.06)" }}>
                  <span className={`tier-badge tier-${tier.tier}`}>{tier.oddsRange}</span>
                  <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>
                    Standard: <span style={{ color: "#f87171" }}>{formatScore(tier.standardBonus)}</span>
                    &nbsp;·&nbsp;
                    Top Pick: <span style={{ color: "#facc15" }}>{formatScore(tier.topPickBonus)}</span>
                  </span>
                </div>
              ))}
            </div>

            {error && (
              <div style={{ marginTop: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", color: "#f87171", fontSize: "0.85rem" }}>
                {error}
              </div>
            )}

            <button
              className="btn-gold"
              onClick={handleSubmit}
              disabled={submitting || slots.filter(s => s.golfer).length !== 5}
              style={{ marginTop: 20, width: "100%", padding: "14px", fontSize: "1rem" }}
            >
              {submitting ? "Submitting…" : "Lock In Picks →"}
            </button>
          </div>

          {/* RIGHT: Field list */}
          <div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", marginBottom: 12, letterSpacing: "0.06em" }}>
              {activeSlot !== null ? `Selecting for Slot ${activeSlot + 1}${activeSlot === 0 ? " (Top Pick)" : ""}` : "Field"}
            </div>

            <input
              className="input"
              placeholder="Search golfers…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ marginBottom: 12 }}
              onFocus={() => { if (activeSlot === null) setActiveSlot(slots.findIndex(s => !s.golfer)); }}
            />

            <div style={{ maxHeight: 520, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {filteredField.map(golfer => {
                const alreadyPicked = pickedIds.has(golfer.id);
                const usedInOtherMajor = usedAcrossMajors.has(golfer.displayName.toLowerCase());
                const disabled = alreadyPicked || usedInOtherMajor || activeSlot === null;

                return (
                  <div
                    key={golfer.id}
                    onClick={() => !disabled && selectGolfer(golfer)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px", borderRadius: 8,
                      border: `1px solid ${alreadyPicked ? "rgba(77,189,136,0.3)" : "var(--border)"}`,
                      background: alreadyPicked ? "rgba(77,189,136,0.08)" : usedInOtherMajor ? "rgba(255,255,255,0.02)" : "rgba(17,45,28,0.5)",
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: usedInOtherMajor ? 0.4 : 1,
                      transition: "all 0.1s"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ color: alreadyPicked ? "var(--green-400)" : usedInOtherMajor ? "var(--text-muted)" : "#f0faf4", fontSize: "0.9rem" }}>
                        {golfer.displayName}
                      </span>
                      {usedInOtherMajor && (
                        <span style={{ fontSize: "0.68rem", color: "#ef4444", fontFamily: "'DM Mono', monospace" }}>USED</span>
                      )}
                      {alreadyPicked && (
                        <span style={{ fontSize: "0.68rem", color: "var(--green-400)", fontFamily: "'DM Mono', monospace" }}>✓ PICKED</span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {golfer.odds && (
                        <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", fontSize: "0.8rem" }}>
                          +{golfer.odds}
                        </span>
                      )}
                      <span className={`tier-badge tier-${golfer.tier}`}>
                        {ODDS_BONUSES[golfer.tier]?.label}
                      </span>
                    </div>
                  </div>
                );
              })}
              {filteredField.length === 0 && (
                <div style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  No golfers match "{search}"
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
