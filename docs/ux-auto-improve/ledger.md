# UX auto-improve ledger

| Section | Date | Status | Branch | Videos |
|---|---|---|---|---|
| Voice intake and output (visits, appointments, inventory) | 2026-11-16 | Built on main and hand-tested with stubbed model answers; not run against a real provider | `main-illw51` | none; screenshots in [voice-bar/screenshots/](voice-bar/screenshots/) |

## Voice intake and output

**What was built.** The design is [voice-bar/main-rebuild.md](voice-bar/main-rebuild.md). The first plan was drawn on a line
that split from main on 27 Sep 2026. Main had since shipped voice fill and voice commands (PRs #120 and #121), so the
bar was rebuilt on main as a front end over that back end. The older notes below stay for the intent and the wording.

- A bar docked under the page on every dashboard page. It takes speech or typed text.
- Visit page: the bar drafts the visit notes, the doctor unticks lines or edits the heard text, and Add to form fills the
  form. Undo restores it. The visit form's own save is the only write.
- Inventory stock list: the bar drafts a new item and opens the existing add-item dialog pre-filled. The dialog's save
  is the only write.
- Everywhere else, and on request on those two pages: commands. They open the existing confirm card.
- Server: `POST /voice-fill/:form/text` for typed text.
- Removed: the header mic, the mobile top-bar mic and the visit toolbar mic. The bar replaces them.
- The bar can be hidden. Hide is offered only while nothing is in flight. A hidden bar is a 32 px strip at the bottom,
  and the strip or `Ctrl+/` brings it back. The choice is remembered per browser.

**Checked by hand** in Chromium on a throwaway database with fake data, model answers stubbed in the browser, at 1440
and 390 px, in the original and branded palettes, keyboard only: typed and spoken command to the confirm card and a
booking; visit draft, untick, apply, undo, failure and retry, page change discards the draft; inventory draft to the
pre-filled dialog and cancel; bar hidden when the status route says voice is not set up.

**Not checked.** A real provider (transcription and extraction quality through the bar). A production build. iOS
Safari and the on-screen keyboard. A blocked or missing microphone in a real browser (unit tests cover the wording).
The stock list itself returned a server error on the throwaway database, which was created with `prisma db push`, so
the bar was checked on that page with the list empty.

**Open for the owner.**
- Booking goes to the existing confirm card, which writes on Confirm. The first plan pre-filled the calendar's own
  booking dialog instead. Say so if that is still wanted.
- The typed route has no rate limit. The app's throttler counts by IP address before the user is known.
- The bar's mic and a per-field dictation mic can be started in the order field first, bar second. Each then records
  on its own.
- If a visit is created while a draft is open, the scope changes and the draft is discarded.

### Notes from the first plan

Design and build plan: [voice-bar/module-map.md](voice-bar/module-map.md), [voice-bar/usage.md](voice-bar/usage.md), [voice-bar/rationale.md](voice-bar/rationale.md), hand-test list in [voice-bar/checklist.md](voice-bar/checklist.md). The reviewer's proposals, the judge's verdict and the lead's decisions are under [voice-bar/notes/](voice-bar/notes/).

Deferred, with the reason:
- Receiving stock by voice. The server overwrites batch and expiry from the stored item, so a new batch cannot be pre-filled without a backend change.
- Removing the `/test-transcribe` page. It carries recent deliberate work.
- Deleting the unused `transcribe/chunk*` routes. The owner has not agreed.
- Spoken read-back. The owner ruled it out.

Open for the owner: whether transcript text with patient names may go to an OpenAI chat model in production.
