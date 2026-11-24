# Clinic verification map

This directory is the maintained source for verifying how stock gets into the clinic pharmacy's inventory, the follow-up loop between a visit and the patient's WhatsApp check-in, and the patient portal's sign-in and records. Read this index before driving the app, then follow the matching feature file as the recipe. Other dashboard areas (appointments, billing) are not mapped yet. Add a file here when you verify one.

## Baseline preconditions

- A stack launched by this skill (`scripts/launch.cjs`) with `doctor.cjs` reporting `DOCTOR OK`. Never drive the user's own dev server or a deployed URL.
- Log in as `pharmacist` (Anil Deshmukh) unless a recipe says otherwise (the follow-up loop uses `reception` and `doctor`). That role has the seeded PHARMACIST permissions: create, review and commit purchase bills.
- The seeded schema has no suppliers, no products and no stock. Every product a recipe receives must either be created in the flow ("Create new item") or come from an earlier step of the same run.
- Desktop viewport 1280×900; phone checks use 390×844 with `isMobile`.

## Driving conventions

- Reach features through the in-app navigation or the canonical route `/dashboard/inventory?area=<area>&view=<view>`. Both are user paths, since the app keeps its navigation in the URL.
- Prefer accessible names (`getByRole('button', { name })`, `getByLabel`) and the stable ids listed in `SKILL.md`. "Type instead" is a **link**, not a button.
- Use unique bill numbers and product names per run (the scripted driver appends a base-36 timestamp tag). A supplier GSTIN plus bill number pair can be posted only once per schema.
- Reuse one login per role per process (`lib.openPage`). `/auth/login` returns 429 after 5 calls a minute.

## Proof and skip reporting

- A posting proof needs all three: the UI says "Stock added", the network shows one draft save, one review and one commit, and the database shows `STOCK_COMMITTED` plus the `currentStock` delta.
- Stock-neutral actions (scan only, Save draft, CSV import, duplicate refusal) must be shown to leave `currentStock` unchanged. "No error" is not proof.
- For UX claims, record user-step counts, time from action to outcome, whether the outcome is on screen where the user acted, and 390px fit.
- An entry point that can't run here (for example, scan/OCR without a model key) is reported as **not verified**, with the reason. It is never covered by proving a sibling path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph on the user-visible behavior, followed by exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with Playwright`, `Gotchas`.

## Features

- [Manual purchase bill](./manual-bill.md): typing a distributor bill and adding its stock, plus new and known products, multi-line bills, duplicates, double-clicks, phone layout and read-back. **Scripted:** `drive-manual-bill.cjs`.
- [Import purchase CSV](./csv-import.md): uploading a CSV that opens the same review draft as manual entry.
- [Scan a bill (OCR)](./scan-bill.md): uploading a PDF or photos for extraction. Blocked in this stack, so only its failure UX can be verified here.
- [Opening stock](./opening-stock.md): the Excel opening-stock import and the manual opening-stock document.
- [Purchase bills and unfinished intake](./purchase-bills.md): the register where posted bills appear, and the "Recent invoices" list where saved drafts resume.
- [Follow-up loop](./follow-up-loop.md): number confirmation, a visit with a follow-up plan, the scheduler's check-in link through a fake WhatsApp endpoint, the patient's photo answer at phone width, the staff reply and worklist resolution, plus the review reminder. **Scripted:** `drive-follow-up-loop.cjs` with `fake-meta.cjs`.
- [Portal sign-in and records](./portal-sign-in.md): WhatsApp code sign-in on `/p`, the shared-phone profile picker, read-only appointments, prescriptions, check-ins and messages, writing to the clinic, a staff reply after the WhatsApp window that lands in the portal, and sign out. **Scripted:** `drive-portal-sign-in.cjs` with `fake-meta.cjs`.
