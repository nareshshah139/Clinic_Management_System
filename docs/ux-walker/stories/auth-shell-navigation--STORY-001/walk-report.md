# STORY-001: Front-desk sign-in with a phone number. Walk report

**Result: PASS** (goal reached in the ideal 3 steps). 9 findings: 1 high, 5 medium, 3 low.
Persona: Riya Sharma (RECEPTION, 9000000003). Walked 2026-11-07 with Playwright Chromium at 1280x800 (dsf 1). Login form at http://localhost:3000.
Screenshots: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/auth-shell-navigation--STORY-001/`

## Steps

| # | Action | Expected (catalog) | Actual | Screenshot | Geometry |
|---|--------|--------------------|--------|------------|----------|
| 1 | Open `/` | Goes to `/login?next=%2Fdashboard`, identifier focused | Matches. `document.activeElement` = `login-identifier`. The screen is a centred card with the Linaé crop, "ClinicMS Login" and a Branded switch at top right. The password placeholder dots make the empty field look filled (F-001-08). | step-1-login.png | clean |
| 2 | Type `9000000003` without clicking | Sign in still disabled | Matches (autofocus works, so no extra click is needed) | step-2-phone-typed.png | n/a |
| 3 | Type password | Sign in enabled | Matches | step-3-password.png | n/a |
| 4 | Press Enter | Spinner, "Signing in…", HttpOnly cookie | Not captured: the response arrived in under 100 ms. Cookie `auth_token` is httpOnly, SameSite=Strict, and expires in 7 days. | n/a | n/a |
| 5 | Land on `/dashboard` | Dashboard, RS / Riya Sharma / RECEPTION, Start Tour | Matches. The dashboard leads with admin cards (Total Users 10 = Active Users 10, Total Branches 1, System Status "operational") and a hard-coded "All systems operational / LOW" alert (F-001-05). "operational" spills into its icon (F-001-06). | step-5-dashboard.png | 1 spill: `System Statusoperational` 14px |

## Variations and edge cases

- **`+91 90000 00003`**: "Account not found (Reference: 7df4b31e-…)" with a 404. **Confirms** mapped defect auth #13 (F-001-01). `var-plus91.png`
- **Formatted `90000-00003`** (wrong password used to save throttle budget): "Invalid password". So the hyphenated phone resolves to the account, as the catalog claims. `var-formatted-phone-wrongpw.png`
- **Wrong password**: "Invalid password (Reference: …)". **Unknown email** `riya@clinic.test`: "Account not found". **Confirms** enumeration defect auth #14 (F-001-03). `edge-wrong-password.png`, `edge-unknown-email.png`. Geometry: clean.
- **Throttle**: on the first walk attempt, other sessions sharing the per-IP 5/min budget meant Riya's *first* attempt got "ThrottlerException: Too Many Requests (Reference: …)". This confirms the catalog edge case "raw throttler message shows". The per-IP keying is a separate finding (F-001-02, F-001-04). `edge-throttled-429.png`
- **Signed in, visit `/login`**: the form shows again with no redirect. This confirms the catalog's claim (F-001-09). `edge-login-while-signed-in.png`
- Not exercised: suspended or disabled users, malformed-email and 6-digit validation (to conserve the shared login throttle).

## Mobile spot-check (390x844)
`mobile-check.png`: the header is gone (no search, bell, Start Tour or Branded switch). This **confirms** mapped defect auth #15. Each stat card is about 155px tall for one number. Geometry: clean (no horizontal overflow). See F-001-07.

## Console and network evidence
- POST `/api/auth/login`: 404 `{"message":"Account not found"}` for +91. 401 `Invalid password`. 429 `ThrottlerException: Too Many Requests`.
- After login, every dashboard page logs `introJs() is deprecated` warnings. Noise only.

## Mapped defects touched
- CONFIRMED: auth #8 (admin stat cards for every role, Total = Active), #9 (fake "All systems operational" alert), #13 (+91), #14 (enumeration), #15 (mobile header hidden).

## Flow log
- Specified 3 steps (identifier, password, Enter); actual 3. No hesitation on the happy path.
- Hesitation points: the password field looks pre-filled before typing. After a +91 failure the copy "Account not found" sends the user toward "my account was deleted" rather than "use 10 digits".
- Re-entry: none.
- Cross-screen redundancy: the user's name appears in the header ("Riya Sharma") and again in the sidebar footer. The Next.js dev badge (dev only) overlaps the sidebar avatar.
