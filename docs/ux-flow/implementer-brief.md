# Implementer brief

You are building one unit of a UX simplification of the clinic management app (Next.js frontend in
`frontend/src`, NestJS backend in `backend/src`, Prisma + PostgreSQL). The owner's goal: the app
should feel brainless to use for clinic staff who are not computer people, and it should carry less
subtext (helper lines, descriptions, hints). Your assignment is the file `docs/ux-flow/units/<unit>.md`. It
names the changes accepted for your unit and the ones rejected. Build the accepted ones. Do not
build the rejected ones.

A container restart can stop you at any moment and files on disk are all that survives. Commit
after every change that leaves the tests you touched green, and keep a running note of what is
done and what is next in `NOTES.md` at the root of your worktree (not committed to the final
result; the lead removes it). If your worktree already has commits or a `NOTES.md` when you start,
a previous worker was interrupted: read the note and `git log`, verify what is there, and continue.

## Where you work

- Your own git worktree and branch, named in your assignment. Work only there. Never edit, commit
  or run git writes in `/home/user/Clinic_Management_System` (the main checkout) or in another unit's worktree.
- Commit in your worktree as you finish each change (small commits, plain messages, no AI or model
  names). Do not push. Do not merge.
- `node_modules` in your worktree are symlinks to the main checkout. Do not install or remove packages.

## Read first

- Your unit's critiques under `docs/ux-flow/journeys/` (named in your assignment), in full: scorecard,
  take-away pass, simpler version, clarity issues, the Subtext table and the proposed changes.
- `docs/ux-flow/redundancy.md` sections named in your assignment, and its naming table (section 4.4).
- The journey scripts for your unit in `scripts/ux/journeys/` and `scripts/ux/journeys/lib.cjs`.
- `docs/ux-flow/scorecards/baseline.json`: the action counts measured before any change.

## Rules for the change

- Smallest change that does the job. Prefer deleting to adding. No new dependencies, no new
  abstraction layers, no feature flags, no compatibility shims for the old behaviour.
- Follow the patterns already in the file you touch (components in `frontend/src/components/ui`).
- Product rules are written in the code as `@cc [...]` directives and in `CONTRACTS` files. They
  are the owner's rules. Every one of them must still be true after your change. If an accepted
  change cannot be built without breaking one, do not build it; report it. Never reword or delete a rule.
- Clinical data, money and stock rules do not change unless your assignment says so explicitly.
- Text you write: plain words, sentence case, no exclamation marks, no internal codes (OPD,
  WALKIN, ids). One concept, one name (naming table in `redundancy.md`).
- The owner decided that Quick Guides and tours stay. Where a Subtext table says to cut a Quick
  Guide button, dialog or tour, keep it and rewrite its lines to match the changed screen.
- Subtext: apply your critiques' Subtext tables. "cut" means delete the element and any import it
  leaves unused. "shorten" means use the given wording. "keep" stays. Warnings about safety, money
  or an irreversible action stay even if a table says cut.
- Comments: none, except a short one for a non-obvious why. Delete nothing a test or another
  module still imports without checking with `grep` first.
- Do not edit `scripts/ux/journeys/lib.cjs`, `run-all.cjs`, `seed.cjs` or `serve.cjs`. If the seed
  lacks data you need, report it. Do not touch `backend/prisma/schema.prisma` or migrations unless
  your assignment says so.

## Proof (all of it, in your worktree)

1. **Journeys.** Rewrite each of your journey scripts to the shortest honest path through the new
   UI, starting from `/dashboard` as before, every interaction through `ui.*`, and with the goal
   check at least as strict as it is now. Then replay on a fresh stack:
   `flock /tmp/ux-fresh.lock env UX_TIMEOUT=90000 STACK_DATABASE_URL=postgresql://stack:stack@127.0.0.1:5432/clinic_stack node scripts/ux/journeys/run-all.cjs <unit> --only <ids>`
   Each must print PASS with fewer actions than `baseline.json`, or equal where your assignment
   says no action is saved. Journeys of other units that pass through your screens must not get longer: replay those too.
2. **Eyes.** Open the screenshots the replay saved under `output/ux-journeys/<unit>/<id>/` with
   the Read tool. Check each changed screen at 1366x850: nothing clipped, overlapping or pushed
   off screen, one obvious primary action. Also capture each changed screen at a phone viewport
   (390x844) with a throwaway script in your scratch folder and check it the same way.
3. **Tests.** `cd frontend && npx jest --ci <tests of the files you touched>` while working, then
   the whole suite once at the end (`npx jest --ci --silent --maxWorkers=2`). Where a test asserted text or a
   control you removed on purpose, update the expectation. Never skip, delete or loosen a test to
   get green. If a test encodes a product rule your change breaks, stop and report. Add a test for
   each behaviour you add or fix (call the component the way a user does, assert a literal result).
   Backend changes: `cd backend && npm run typecheck` and the specs for the module you touched
   (database-backed specs read a `*_TEST_DATABASE_URL` variable; the list is in
   `.github/workflows/tests.yml`; use `postgresql://stack:stack@127.0.0.1:5432/clinic_stack`).
4. **Types, lint, contracts.** `cd frontend && npx tsc --noEmit -p tsconfig.json`,
   `npx eslint <changed files>`, and from the worktree root `npm run contracts:check`.
   Baseline results on unchanged code are in
   `/tmp/claude-0/-home-user-Clinic-Management-System/922a752e-0d05-5fdd-b934-22f2a04cd167/scratchpad/base-jest.txt`,
   `base-tsc.txt` and `base-eslint.txt`; a failure that is already there is not yours, a new one is.

Only one fresh stack runs at a time (the `flock`), so replays queue behind other units. Never
stop or kill a `node` process you did not start. Playwright and Chromium are preinstalled; never
run `playwright install`.

## Report back (under 350 words)

- What a staff member now sees or does differently, change by change.
- Before and after action counts per journey, with the PASS lines.
- Tests, type-check, lint and contracts results, with counts. Name any test whose expectation you changed and why.
- Each accepted change you did not build, with the reason.
- Anything you found that the owner must decide.
- Your branch name and the commit list (`git log --oneline main..HEAD` equivalent for your branch).
