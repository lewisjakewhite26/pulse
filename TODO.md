# Pulse — To do list

## Setup (do when ready)

### Gemini API key
- [ ] Create a key at [Google AI Studio](https://aistudio.google.com/apikey)
- [ ] **Rotate the old key** if it was ever committed to GitHub (the previous hardcoded key is compromised)
- [ ] Local dev: copy `.env.example` to `.env.local` and set `GEMINI_API_KEY=your_key`
- [ ] Vercel: Project → Settings → Environment Variables → add `GEMINI_API_KEY` for Production (and Preview if needed)
- [ ] Redeploy after adding the variable

### Strava API credentials
- [ ] Go to [strava.com/settings/api](https://www.strava.com/settings/api) and create an app
- [ ] Set **Authorization Callback Domain** to `localhost` (dev) or your deployed host
- [ ] Add redirect URI: `http://localhost:3000/strava/callback` (update for production when deployed)
- [ ] Paste credentials into `lib/strava-config.ts`
- [ ] Restart dev server (`npm run dev`)
- [ ] Test: Activity tab → Connect Strava → approve → Sync recent activities

### End-to-end smoke test (phone or desktop)
- [ ] Fresh load → AccountSetup (or PIN lock if account exists)
- [ ] Legacy profile: profile without account shows welcome message and pre-filled name
- [ ] Complete onboarding → Start tracking
- [ ] Log tab: parse and confirm a real entry → header chip shows "Not synced"
- [ ] Tap sync chip → backup downloads → chip shows "Synced"
- [ ] Profile → Backups → restore flow with inline confirmation
- [ ] Refresh → PIN lock → data still there
- [ ] PWA: `npm run build && npm start` → test install on Android Chrome

### Automated tests
- [ ] Run `npm test` before releases

---

## Known gaps

- [ ] **Strava credentials** not configured in `lib/strava-config.ts`
- [ ] **Garmin FIT binary test** with a real `.FIT` file (GPX/TCX/CSV covered by `npm test`)
- [ ] **Scheduled 10pm sync** verify on a real device
- [ ] **Notifications** feature not implemented (sync chip replaced the bell icon)
- [ ] Optional: include Strava tokens in backup export/import
- [ ] Optional: run `npm audit` and review `next-pwa` dependency vulnerabilities

---

## Done (sync spec items 1–10)

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
