# UX auto-improve ledger

| Section | Date | Status | Branch | Videos |
|---|---|---|---|---|
| Voice intake and output (visits, appointments, inventory) | 2026-11-16 | In progress: wire and backend built, bar core and pages not started | `ux-voice/voice-bar` | none yet |

## Voice intake and output

Design and build plan: [voice-bar/module-map.md](voice-bar/module-map.md), [voice-bar/usage.md](voice-bar/usage.md), [voice-bar/rationale.md](voice-bar/rationale.md), hand-test list in [voice-bar/checklist.md](voice-bar/checklist.md). The reviewer's proposals, the judge's verdict and the lead's decisions are under [voice-bar/notes/](voice-bar/notes/).

Deferred, with the reason:
- Receiving stock by voice. The server overwrites batch and expiry from the stored item, so a new batch cannot be pre-filled without a backend change.
- Removing the `/test-transcribe` page. It carries recent deliberate work.
- Deleting the unused `transcribe/chunk*` routes. The owner has not agreed.
- Spoken read-back. The owner ruled it out.

Open for the owner: whether transcript text with patient names may go to an OpenAI chat model in production.
