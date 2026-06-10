# PULSE — TO DO

---

## Do immediately

- [ ] Fix float display — `formatDecimal()` already exists but check it's applied everywhere: weight on dashboard measurements card, body fat, BMI, muscle mass. No raw floats anywhere.
- [ ] Fix dead space on PIN setup, confirm PIN, and PIN lock screens — vertically centre content, add ambient gradient blobs
- [ ] Fix loading screen — add coral Pulse wordmark, ambient blobs, subtle pulsing coral dot. Remove plain "Loading Pulse..." text.
- [ ] Rename "Brain dump" to "Your coach" on Log tab heading
- [ ] Add mic and camera buttons to Log tab input bar
- [ ] Fix Connect scale button on Activity tab — primary coral button not low-contrast light style
- [ ] Hide Strava card entirely when credentials not configured — show nothing, not a broken state
- [ ] Glassmorphism audit — cards rendering as solid white. Ensure `backdrop-filter: blur(15px)` is applied and parent containers aren't blocking it
- [ ] Floating coach FAB overlapping content on some screens — check z-index and positioning

---

## App name

Pulse is not the right name — too generic, too AI-coded, doesn't connect to the coach/ADHD/low-friction personality. Decide on a name before building the promo site. Must be: one syllable, clean, not health-app generic, has personality.

---

## Before any public release — remove DEBUG items

- [ ] Lewis name prefill on onboarding screen 1
- [ ] Default PIN 0000 on onboarding complete
- [ ] "Dev: skip onboarding" link on screen 1
- [ ] Renpho debug panel in Activity tab
- [ ] Renpho hardcoded profile (male, 34, 180cm) in BLE handshake — replace with profile values
- [ ] Scrub old Gemini key from Git history (revoked in Google Studio, still visible in commit `0a888ae`)

---

## End-to-end smoke test (Pixel / production)

Clear localStorage before a full run unless testing legacy upgrade.

- [ ] Production URL: test full flow on latest Vercel deploy
- [ ] Onboarding 3 screens: name + DOB + sex, goal + sliders, Renpho or skip
- [ ] After onboarding: lands on dashboard with coach card (welcome may load in background)
- [ ] Log tab: open once, welcome message appears in chat, send a real entry, coach replies
- [ ] FAB: visible on other tabs, hidden on Log, amber pulse if nothing logged today
- [ ] Dashboard: wellness arc, stat chips, habits, recent log, measurements card
- [ ] Activity: Renpho connect (bare feet), Garmin upload with a real `.FIT` file
- [ ] Trends: goal journey, weight chart, weekly summary, alcohol bars
- [ ] Profile: read-only sections, backups download and restore confirmation, change default PIN
- [ ] Sync chip: log something, "Not synced", tap, backup downloads, "Synced"
- [ ] PWA: install on Android Chrome from production URL
- [ ] Run `npm test` (16 tests) before calling the release good

---

## Known gaps

- [ ] Test Garmin upload with a real `.FIT` file exported from Garmin Connect app
- [ ] Scheduled 10pm sync — verify on a real device overnight
- [ ] Notifications not implemented
- [ ] Profile "Set manually" targets link is styled but not wired to chat
- [ ] Run `npm audit` and review `next-pwa` dependency vulnerabilities

---

## Short term — next 2–4 weeks

- [ ] Meal planner feature — vibe chips, constraint toggles (high protein / low fat / low carb etc), healthiness and effort sliders, "use what I've got" free text, Gemini generates meal with macros, "log this meal" button auto-fills coach chat, save to favourites
- [ ] Promo website with email capture — launch before app goes public. One headline, one subtext, one email field. Build waiting list first.
- [ ] Capacitor — wrap PWA for App Store and Play Store submission
- [ ] App Store and Play Store accounts — set up developer accounts if not already done
- [ ] Proper PIN setup screen in onboarding — replace default 0000 flow
- [ ] Coach system prompt audit — check responses on device, make sure tone is right, no AI clichés slipping through

---

## Medium term — 1–3 months

- [ ] Withings API integration — proper OAuth, pulls weight and body composition. Covers serious health tracker users.
- [ ] Optional Supabase cloud sync as premium feature — local stays default, cloud is opt-in premium
- [ ] Paywall implementation — 7 day full trial, then freemium. 5 coach messages/day free, unlimited on premium. £5.99/month or £39.99/year. Push annual.
- [ ] Coach weekly debrief — Sunday AI summary of the week, what went well, what to focus on
- [ ] Content strategy — first TikTok/Reels showing real coach conversation, start audience before launch
- [ ] TikTok and Instagram presence set up under the app brand

---

## Strava (when ready to ship to others)

- [ ] Sign up for Strava Standard Tier developer subscription (£9.99/month equivalent)
- [ ] Go to [strava.com/settings/api](https://www.strava.com/settings/api) and create the app
- [ ] Set callback domain to production Vercel URL
- [ ] Add `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` to Vercel environment variables
- [ ] Paste credentials into `lib/strava-config.ts`
- [ ] Test: Activity tab, Connect Strava, approve, sync recent activities
- [ ] When user base grows past 10, submit for Strava review to scale to 9,999 users
- [ ] At 10,000+ users, apply for Extended Access Tier

---

## Later — 3–6 months

- [ ] Google Home / Alexa voice logging — needs cloud sync first. "Hey Google, log 500ml on [app name]." New webhook endpoint feeding same Gemini pipeline. Account linking via OAuth.
- [ ] Push notifications — daily check-in nudge if nothing logged by 2pm, milestone alerts, weekly debrief
- [ ] B2B / corporate wellness — white-label version, £5–10 per employee per month
- [ ] Coach memory improvements — longer context window, pattern recognition across weeks not just days

---

## Backlog / future

- [ ] Smart watch — ODM route, white-label manufacturer, custom coral hardware and watch face. Realistic at 10,000+ users with revenue to fund it. ~£20–25k for 500 unit run at £89 retail.
- [ ] Additional scale integrations — Fitbit Aria and Garmin Index via API (straightforward). Other BLE scales on request.
- [ ] Social accountability layer — share goal projection with one other person, they see if you're on track. No feed, no comparison, just accountability.
- [ ] Apple Watch / WearOS companion app

---

## Revenue model (when ready)

- Free tier: 7 days full access, then 5 coach messages/day
- Premium: £5.99/month or £39.99/year
- Pro tier (future): £14.99/month — weekly debrief, detailed trends, priority coach, early access
- B2B: white-label per employee pricing
- Hardware: Pulse watch at £89 retail, ~£20–25 unit cost ODM

---

## Done

- Stitch UI overhaul — coral/lime design system, glass cards, ambient blobs, Plus Jakarta Sans, floating glass bottom nav
- Conversational UX — 3-screen onboarding, coach chat, floating FAB, read-only profile, goal journey on Trends, background Gemini calls
- `formatDecimal()` for weight, body fat, BMI, muscle
- Legacy welcome card copy fixed
- Strava unconfigured copy fixed
- Renpho BLE working — ES-26M protocol reverse engineered, weight, body fat, muscle, BMR, water all reading correctly
- Sync system — versioned daily backups, dirty flag, 10pm auto-sync, rollback import
- Coach system prompt — UK English, no em dashes, no AI clichés, straight talking, smart assumptions, brand searching
- Voice input (Web Speech API, en-GB)
- PWA manifest, service worker, A2HS
- 16 tests passing
- Deployed to Vercel (Next.js 15.5.18)
- GitHub: [github.com/lewisjakewhite26/pulse](https://github.com/lewisjakewhite26/pulse)
- Gemini API key secured in environment variables
