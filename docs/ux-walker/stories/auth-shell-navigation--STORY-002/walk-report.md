# STORY-002: Deep link while signed out, old bookmarks, 404. Walk report

**Result: PASS on the journey, with a CRITICAL security finding.** 8 findings: 1 critical, 3 medium, 4 low.
Persona: Dr. Praneeta Jain (DOCTOR). Target patient: Arjun Reddy (`cmw6dbbe2000a7dc1bw0xhc61`), because the seed has no "Lakshmi Reddy". Playwright at 1280x800.
Screenshots: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/auth-shell-navigation--STORY-002/`

## Steps

| # | Action | Actual | Screenshot | Geometry |
|---|--------|--------|------------|----------|
| 1 | Open `/dashboard/patients/<id>` signed out | Redirected to `/login?next=%2Fdashboard%2Fpatients%2F<id>`. Login card shown. | step-1-deeplink-redirect.png | clean |
| 2-3 | Sign in as praneeta | Lands exactly on the patient: "Arjun Reddy", badges ID / Code TRYAT / M / 35 yrs; Start new visit / Book appointment / Back; Info, History and Uploads tabs. Sidebar highlights Patients. **The `?next` round-trip works.** The full cuid badge is noisy (F-002-07). | step-3-patient-detail.png | 4 uneven rows (header badges, button group, tracker steps). All intentional content-width variance, not logged. |
| 4 | History tab | Shows two **Scheduled** appointments (21 Nov and today 07 Nov 19:00). The summary card above says "Next appointment: Not scheduled" and the tracker offered "Book" (F-002-03). | step-4-history-tab.png, step-4b-history-record.png | n/a |
| 5 | `/dashboard/prescriptions` | Goes to `/dashboard/visits`, "Visit Documentation", Visits highlighted. As the catalog says, there is no prescription pad. | step-5-bookmark_dashboard_prescriptions.png | clean |
| 6 | `/dashboard/billing` | Goes to `/dashboard/pharmacy?section=billing`, "Pharmacy Billing". **No nav item highlighted.** The title appears twice and the header layout is off-pattern (F-002-04). | step-6-bookmark_dashboard_billing.png | 3 label/value rows of different widths (intentional) |
| 7 | `/dashboard/stock-predictions` | Goes to `inventory?area=reorder&view=targets`. Inventory highlighted, but the view is **"Manual targets & exclusions"**, not "Target proposals" (F-002-05). | step-7-…png | n/a |
| 8 | `/dashboard/inventory-updates` | Goes to `inventory?area=stock&view=approvals`: "Price / stock approval queue", 0 pending. Matches the catalog. | step-8-…png | n/a |
| 9 | `/dashboard/patient/<id>` (typo) | Bare Next 404 with no shell (F-002-02). | step-9-404.png | clean |

## Variations
- `/dashboard/appointments?patientId=<id>` loads, but the patient is not prefilled (see STORY-004). `var-appointments-patientId.png`
- Missing patient `/dashboard/patients/doesnotexist123`: "Patient not found (Reference: 4974c955-…)" and "Back to Patients". Matches the catalog apart from the raw reference. `var-missing-patient.png`
- Signed-out `/dashboard/xyz`: `/login?next=%2Fdashboard%2Fxyz`, then the bare 404 after login. Matches the catalog. `var-signedout-404-login.png`, `var-signedout-404-after-login.png`
- `/test-transcribe` signed out renders "Voice Transcription Test". It is also in the doctor sidebar as "Admin → Test Transcribe" (F-002-06). `var-test-transcribe-signedout.png`

## Open-redirect test (requested)
Fresh context, no cookie:
1. `/login?next=https%3A%2F%2Fexample.com`, sign in as praneeta (201). The browser then made a **top-level navigation request to `https://example.com/`** and the page ended on `chrome-error://chromewebdata/` because the sandbox has no outbound network. `open-redirect-https.png` (blank chrome error page)
2. `/login?next=%2F%2Fexample.com%2Fphish`, sign in (201). Navigation went to **`http://example.com/phish`** (protocol-relative also works).

**Verdict: CONFIRMED. After a real login the user is sent off-site** (mapped defect auth #11). F-002-01, critical.

## Mobile spot-check (390x844, patient detail)
`mobile-check.png`: header badges and buttons wrap acceptably. The progress tracker is clipped after "Complete" (F-002-08). There is no global search. Geometry: no page overflow. The tracker row is uneven (intentional label widths).

## Console and network evidence
- Each patient-detail load logs `api.request_failed … resource: patients, status: 200, code: invalid_response` twice. GET `/patients/:id/next-appointment` returns 200 with `Content-Length: 0` (detailed in STORY-004 F-004-02).
- 404s: GET `/dashboard/patient/<id>`, GET `/dashboard/xyz`, and `/api/patients/doesnotexist123` (plus `/api/visits/patient/doesnotexist123/history`).

## Mapped defects touched
- CONFIRMED: auth #11 (open redirect), #23 (no custom 404; the 404 leaves the shell). Patients #6 and #7 (Next appointment always "Not scheduled"; today's appointment treated as past).
- PARTLY REFUTED (catalog claim, not a mapped defect): step 7's target is the "Manual targets & exclusions" view, not "Target proposals".
- Not tested: auth #24 (expired-JWT race).

## Flow log
- Ideal 3 steps (click link, sign in, see patient). Actual 3. The `?next` round-trip is good.
- Hesitations: on the patient, "Next appointment: Not scheduled" contradicts the History tab. At `/dashboard/billing` there is no highlighted nav, so she cannot tell where she is in the app. At the 404 she has to use browser Back.
- Redundancy: patient name, gender, age and phone appear in the header badges, the summary card and the Info tab. "Pharmacy Billing" appears twice on one screen.
