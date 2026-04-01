# Fed Golf Majors 2026 ⛳

Office golf pool app covering all 4 majors — Masters, PGA Championship, US Open, The Open Championship.

**Stack:** Next.js 14 · Firebase Firestore · Vercel · Google Sheets (live scores via ESPN importHTML)

## Features
- Email + 4-digit PIN auth with remember me
- Per-major pick submission (5 picks, slot 1 = Top Pick)
- Live leaderboard powered by Google Sheets → ESPN
- Best 3 of 5 scoring with CUT/WD handling
- Odds-based win bonuses (standard + Top Pick tiers)
- Tiebreakers: total score → winners hit → Top Pick wins
- Head-to-head entry comparison
- Admin panel: field import, odds tiers, name matching, overrides, Finalize Major

## Setup
See [SETUP.md](./SETUP.md) for complete step-by-step instructions.

## Format
- 4 majors, 5 picks each
- Best 3 of 5 scores count per major
- No golfer may be reused across majors
- Win bonuses based on pre-tournament odds tiers
- Cumulative score across all 4 majors
