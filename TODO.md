# Pulse — To do list

## Setup (do when ready)

### Strava API credentials
- [ ] Go to [strava.com/settings/api](https://www.strava.com/settings/api) and create an app
- [ ] Set **Authorization Callback Domain** to your deployed host (e.g. `pulse-*.vercel.app`) or `localhost` for dev
- [ ] Add redirect URI: `https://your-vercel-domain/strava/callback` (and `http://localhost:3000/strava/callback` for local dev)
- [ ] Paste credentials into `lib/strava-config.ts`
- [ ] Restart dev server (`npm run dev`)
- [ ] Test: Activity tab → Connect Strava → approve → Sync recent activities

### End-to-end smoke test (phone or desktop)
- [ ] Production URL: test full flow on Vercel deploy
- [ ] AccountSetup: name step in glass card, progress pills on PIN steps
- [ ] Set and confirm PIN via keyboard (4 digit boxes)
- [ ] Legacy profile: amber welcome card, pre-filled name, no account yet
- [ ] Refresh → PinLock: "Welcome back, [name]" greeting and glass card
- [ ] Complete onboarding → Start tracking
- [ ] Log tab: parse and confirm a real entry → header chip shows "Not synced"
- [ ] Tap sync chip → backup downloads → chip shows "Synced"
- [ ] Profile → Backups → restore flow with inline confirmation
- [ ] PWA: install on Android Chrome from production URL

### Automated tests
- [ ] Run `npm test` before releases (16 tests)

---

## Known gaps

- [ ] Test Garmin upload with a real `.FIT` file exported from Garmin Connect app
- [ ] **Scheduled 10pm sync** verify on a real device
- [ ] **Notifications** feature not implemented (sync chip replaced the bell icon)
- [ ] Strava Connect button in Activity tab is visible but non-functional. Consider hiding it until credentials are configured (code stays, UI hidden)
- [ ] Optional: run `npm audit` and review `next-pwa` dependency vulnerabilities
- [ ] Optional: scrub old Gemini key from Git history (revoked in Google Studio; still visible in commit `0a888ae`)

---

## Done

### Deployment and security
- GitHub repo: [github.com/lewisjakewhite26/pulse](https://github.com/lewisjakewhite26/pulse)
- Vercel production deploy (Next.js 15.5.18 security patch)
- Gemini API key moved to `GEMINI_API_KEY` env var (no hardcoded key in source)
- Old Gemini key revoked in Google Studio
- `.env.local` for local dev, `GEMINI_API_KEY` set in Vercel (Production + Preview)

### Auth UI (AccountSetup + PinLock)
- Shared `AuthShell` with frosted header matching main app
- Glass card layout for name entry, PIN setup, and PIN lock
- Keyboard PIN entry (4 digit boxes, auto-advance, paste support)
- Step progress pills on signup PIN steps
- Legacy welcome card (amber border, personalised copy)
- PinLock greeting with account/profile name
- PIN confirmation stale-state bug fixed

### Sync spec (items 1–10)
1. Silent saves (no auto-export on each entry)
2. Versioned daily backup filenames (`pulse-backup-YYYY-MM-DD.json`)
3. Sync state in localStorage (`pulse_dirty`, `pulse_last_synced`, helpers)
4. Sync status chip in header (tap to backup, tooltip on hover/long-press)
5. Scheduled auto-sync at 10pm when dirty and not yet synced today
6. Rollback import with inline confirmation (account/PIN preserved)
7. Backups section in Profile tab
8. Project cleanup (`react-icons` removed, dead folders removed)
9. Legacy profile welcome flow (profile without account)
10. Intentional sync model: dirty on save, export on manual tap or 10pm only

### Core app
- localStorage data layer + PIN account
- Dashboard, logs, trends, activity wired to real data
- Garmin file parsing (FIT, GPX, TCX, CSV) + Strava OAuth routes
- PWA (manifest, icons, service worker)
- Automated tests (`npm test`)

---

## Future — when shipping to others

### Strava integration (OAuth code already built, credentials not configured)
- [ ] Sign up for Strava Standard Tier developer subscription ($11.99/month)
- [ ] Go to [strava.com/settings/api](https://www.strava.com/settings/api) and create the app
- [ ] Set callback domain to your production Vercel URL
- [ ] Add `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` to Vercel environment variables
- [ ] Paste credentials into `lib/strava-config.ts`
- [ ] Test: Activity tab → Connect Strava → approve → sync recent activities
- [ ] When user base grows past 10, submit for Strava review to scale to 9,999 users
- [ ] At 10,000+ users, apply for Extended Access Tier (no subscription fee at that scale)
