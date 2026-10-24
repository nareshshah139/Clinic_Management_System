# Inventory recovery: integrated branch validation

The full build passes on the branch integrated with current main. **884 backend tests and 534 frontend tests pass**, with zero failures. The backend total includes **88 PostgreSQL tests** run against a disposable local cluster; test schemas were removed and the cluster stopped afterward.

The change adds fresh-count recovery, explicit ledger checkpoints, restoration of original quarantine holds after linked compensation, confirmed physical identity resolution, receipt validation before review and commit, and revision-safe import metadata updates. It reuses main's existing audited purchase-review reopen API and opening-import retry tracking. Strict backend compilation now runs before SWC; the DTO, Prisma, import, controller and permission-storage errors are fixed. The standalone backend lockfile is repaired and the workspace lockfile passes a Node 20/npm 10 clean-install dry run.

The 30-state recovery model and 22 real-service probes pass with the stated evidence, authority and stable-transaction assumptions. This is a conditional reachability claim, not unconditional completion or reconstruction of missing historical facts. See [state graphs and proofs](report.md).

`cc-check` had not been installed or declared in project dependencies. It is now pinned as `@spolu/cc-check@0.2.0`, with `npm run contracts:format -- <file>` and `npm run contracts:list -- <file>`. Both checks pass on all **38 changed TS/TSX files**. The tool declares Node >=24.16 and npm >=11.11; it is development tooling separate from the Node 20 application runtime. Its unsupported `.cjs` proof runner was manually inspected and executed successfully. Syntax checks do not prove semantic compliance.

Remaining scope limits: three opt-in tests are skipped (live Codex OCR and two Chromium workflows), thirteen legacy backend files remain excluded by the existing Jest configuration, and Next.js skips lint under its current build configuration. No Docker image or production deployment is certified by these local results.

[Validation summary](validation-summary.json), [backend cases](ship-backend-regressions.json), [frontend cases](ship-frontend-regressions.json), [contract evidence](contract-check-results.json), [build output](ship-build.log), and [source fingerprints](ship-source-sha256.json) record the integrated tree. Historical original-checkout results remain in `before-main-*` snapshots; they are not substituted for this branch's validation.
