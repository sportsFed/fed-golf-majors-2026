# Fed Golf Majors 2026 — Setup & Admin Guide

---

## PART 1: ONE-TIME SETUP (Do this once, today ~45 min total)

### Step 1 — Create GitHub repo and get the code in

1. Go to https://github.com/sportsFed
2. Click the **+** button (top-right) → **New repository**
3. Name: `fed-golf-majors-2026` · Set to **Private** · Click **Create repository**
4. Copy the URL shown (looks like `https://github.com/sportsFed/fed-golf-majors-2026.git`)

Open **VS Code**. In the top menu click **Terminal → New Terminal**. Type:

```bash
cd Desktop
git clone https://github.com/sportsFed/fed-golf-majors-2026.git
cd fed-golf-majors-2026
```

Now drag-and-drop the contents of the zip file you downloaded into this `fed-golf-majors-2026` folder.
(Replace any files if prompted — the zip has all the correct files.)

Then install dependencies:
```bash
npm install
```
This takes 1–2 minutes. You'll see a lot of text scroll by — that's normal.

---

### Step 2 — Create a new Firebase project

1. Go to https://console.firebase.google.com
2. Click **Add project**
3. Name it: `fed-golf-majors-2026` → Continue → Continue → Create project
4. Once created, click **Firestore Database** in the left sidebar
5. Click **Create database** → **Start in test mode** → Choose region **us-central1** → **Enable**

**Get your web app credentials:**
1. Click the **gear icon** (top-left, next to "Project Overview") → **Project settings**
2. Scroll down to **Your apps** → click the **</>** icon (Web)
3. App nickname: `golf-majors-web` → click **Register app**
4. You'll see a `firebaseConfig` block with values like `apiKey`, `authDomain`, etc. **Save these** — you need them in Step 4.
5. Click **Continue to console**

**Get your Admin SDK key:**
1. Still in Project Settings → click **Service accounts** tab
2. Click **Generate new private key** → **Generate key**
3. A JSON file downloads to your computer. **Keep this file safe and private.**
4. Open the JSON file in a text editor — you need three values:
   - `project_id`
   - `client_email`
   - `private_key` (the entire long string starting with `-----BEGIN PRIVATE KEY-----`)

---

### Step 3 — Create your .env.local file

In VS Code, in the `fed-golf-majors-2026` folder, create a **new file** called exactly `.env.local`

Paste this in and fill in each value:

```
NEXT_PUBLIC_FIREBASE_API_KEY=paste-value-here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=paste-value-here
NEXT_PUBLIC_FIREBASE_PROJECT_ID=paste-value-here
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=paste-value-here
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=paste-value-here
NEXT_PUBLIC_FIREBASE_APP_ID=paste-value-here

FIREBASE_ADMIN_PROJECT_ID=paste-project_id-from-json
FIREBASE_ADMIN_CLIENT_EMAIL=paste-client_email-from-json
FIREBASE_ADMIN_PRIVATE_KEY="paste-entire-private_key-from-json-including-the-dashes"

NEXT_PUBLIC_APP_NAME=Fed - Golf Majors 2026
ADMIN_PIN=choose4digitpinhere
```

**Important notes:**
- The `FIREBASE_ADMIN_PRIVATE_KEY` value must be wrapped in double quotes
- Copy the entire private key exactly as it appears in the JSON — it has `\n` characters in it, keep those
- Choose your own `ADMIN_PIN` — this is what you'll use to access the admin panel. Write it down.
- `.env.local` is in `.gitignore` so it will never be pushed to GitHub (keeps your keys safe)

---

### Step 4 — Set up Vercel (free hosting)

1. Go to https://vercel.com → click **Sign Up** → **Continue with GitHub**
2. Once logged in, click **Add New… → Project**
3. Find and click **Import** next to `fed-golf-majors-2026`
4. **Before clicking Deploy:** click **Environment Variables** and add every variable from your `.env.local` file (same names, same values)
5. Click **Deploy**

Vercel builds and deploys in about 2 minutes. Your app will be live at a URL like:
`https://fed-golf-majors-2026.vercel.app`

---

### Step 5 — Push your code and test

In VS Code terminal:
```bash
git add .
git commit -m "initial build"
git push origin main
```

Vercel auto-deploys every time you push to GitHub.

**Test locally:** Run `npm run dev` in the terminal → open http://localhost:3000

You should see the login page. Try creating an account and logging in.

---

## PART 2: BEFORE EACH MAJOR (Admin checklist)

Do these steps 5–7 days before each major's first tee time.

### ① Set up the Google Sheet connection & deadline

1. Go to your app URL → add `/admin` to the end → enter your Admin PIN
2. Click the correct major button at the top (e.g. **Masters**)
3. Click the **Settings & Deadline** tab
4. **Pick Deadline:** Set the date and time (the form auto-converts to Central Time)
   - Example: April 10, 8:15 AM
5. **Status:** Set to **Open** (this makes the pick form visible to entrants)
6. **Google Sheet CSV URL:** 
   - Open your Google Sheet
   - File → Share → Publish to web
   - Under "Link," choose your Scores_db sheet → format: **CSV** → click **Publish**
   - Copy the URL it gives you and paste it here
7. Click **Save Settings**

### ② Import the field with odds

1. Admin → **Field Import** tab → confirm correct major is selected (top buttons)
2. Paste your golfer list. One golfer per line:
   ```
   Scottie Scheffler    350
   Rory McIlroy         800
   Jon Rahm             1400
   Min Woo Lee          5000
   Sam Burns
   ```
   - Odds: just the number, with or without the + sign
   - Golfers with no odds automatically go to the **Field** tier (same bonus as +5000)
   - Tab or comma between name and odds — either works
3. Click **Parse Field** — the app assigns tiers automatically
4. Review the parsed list — you can adjust any tier manually using the dropdown next to each golfer
5. Click **Save [X] golfers**

### ③ Let entrants know the app is open

Send your group the URL. Tell them:
- Register with their **email** and a **4-digit PIN** they create themselves
- **Slot 1 = Top Pick** — this earns a bigger bonus if that golfer wins
- They can update picks any time until the deadline
- They cannot use the same golfer in more than one major across the entire season

---

## PART 3: DURING THE TOURNAMENT

The leaderboard auto-refreshes every 5 minutes from your Google Sheet.
Your Sheet updates every ~60 seconds from ESPN via importHTML.
So the app is effectively ~6 minutes behind live — that's fine for a pool.

### Fix name mismatches (most common issue)

If a golfer's score isn't appearing, it's usually a name spelling difference between your field list and ESPN's format.

1. Admin → **Name Matching** tab → select the active major
2. Left dropdown: your field name · Right dropdown: ESPN's live name
3. Click **Add** — the app immediately uses this mapping going forward
4. Do this once and it's saved for the rest of the tournament

**Common mismatch causes:**
- Accented characters (Højgaard, Åberg, Björk)
- First name abbreviations (B.H. An vs Byeong Hun An)
- Jr./III suffixes
- Nickname vs legal name (Tom Kim = Joo-Hyung Kim on some sources)

### Force a CUT or WD

1. Admin → **Score Overrides** tab
2. **Golfer Name:** type the ESPN name exactly as it appears in the live sheet
3. **Status:** CUT or WD (or Custom if you need a specific score)
4. Click **Add Override** — takes effect on next leaderboard refresh

CUT rule: golfer gets highest 4-day total in the field + 2 strokes
WD rule: golfer gets highest 4-day total, no extra penalty

### Pause sheet polling

If your Google Sheet has bad data mid-tournament (e.g. the importHTML broke), go to Admin → Settings & Deadline → change Status to **Locked** temporarily. This stops the leaderboard from pulling bad data. Switch back to **Active** when the sheet is fixed.

---

## PART 4: AFTER EACH TOURNAMENT ENDS

**Do this within a few hours of the final putt dropping — before your sheet reloads next week's data.**

1. Admin → **Finalize Major** tab
2. Confirm the correct major is selected (top buttons)
3. Read the checklist — make sure name mappings and overrides are set correctly
4. Click **🏁 Finalize [Major Name]**
5. The app will:
   - Fetch one final snapshot of scores from your Google Sheet
   - Calculate every entrant's result with all bonuses applied
   - Lock those scores permanently in the database
   - Mark the major as "Finalized" on the leaderboard
6. After finalizing, your Google Sheet can update to next week's data — it won't affect locked scores

**There is no undo.** Double-check overrides and name mappings before clicking Finalize.

---

## PART 5: SCORING RULES REFERENCE

### Basic structure
- Each entrant selects **5 golfers** per major
- Only the **best 3 scores** (lowest = best in golf) count toward their total
- Picks lock at the deadline — no changes after
- Cannot reuse a golfer across all 4 majors

### Special cases
| Situation | Score Applied |
|-----------|--------------|
| Golfer makes cut, plays all 4 rounds | Their actual score relative to par |
| Golfer misses cut | Highest 4-day total in field **+2 strokes** |
| Golfer withdraws (WD) | Highest 4-day total in field (no penalty) |
| Golfer not found in sheet | Worst score in field for those rounds |

### Bonus table
| Pre-tournament odds | Any of 5 picks wins | Top Pick (Slot 1) wins |
|--------------------|--------------------|-----------------------|
| Even to +999 | **-2 strokes** | **-5 strokes** |
| +1000 to +2499 | **-3 strokes** | **-6 strokes** |
| +2500 to +4999 | **-5 strokes** | **-8 strokes** |
| +5000+ or Field | **-7 strokes** | **-10 strokes** |

- Only **one bonus per major** — no stacking
- The best applicable bonus is automatically applied
- Top Pick = Slot 1 only. Only one Top Pick per major per entrant.

### Tiebreaker order
1. Lowest cumulative score (primary)
2. Most tournament winners picked across all majors
3. Most Top Pick winners across all majors

---

## TROUBLESHOOTING

| Problem | Solution |
|---------|----------|
| Leaderboard shows no scores | Admin → Settings → make sure Status is "Active" or "Locked" (not "Open" or "Upcoming") |
| A golfer's score is missing | Admin → Name Matching → add a mapping for their name |
| Picks form shows "field not published" | Admin → Field Import → import and save the field for this major |
| Picks form says picks are locked | Admin → Settings → check the deadline — it may have passed or status is wrong |
| App works locally but not on Vercel | Check all env variables are added in Vercel dashboard → Settings → Environment Variables |
| Firebase error in logs | Most likely the FIREBASE_ADMIN_PRIVATE_KEY — make sure it's wrapped in quotes and the \n characters are preserved |
| Deploying fails | Run `npm run build` locally first — if it fails, the error message will tell you what's wrong |

---

## QUICK REFERENCE: FIREBASE COLLECTIONS

For your own reference, here's what's stored in Firebase:

| Collection | What's in it |
|------------|-------------|
| `entries` | One document per entrant — name, email, PIN hash, all picks |
| `majors` | One document per major — status, deadline, sheet URL |
| `field` | All golfers for each major with odds/tier |
| `nameMappings` | Your manual name match overrides |
| `overrides` | CUT/WD/custom score overrides |
| `finalizedScores` | Locked scores after each major is finalized |

