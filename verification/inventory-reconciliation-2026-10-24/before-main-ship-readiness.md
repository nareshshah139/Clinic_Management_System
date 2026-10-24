# Inventory recovery: build and regression validation

The build and configured regression gates pass. All 60 original backend compiler errors are fixed; backend builds now run strict TypeScript checking before SWC compilation. No type-check bypass was added.

- **Full production build:** shared types, Next.js frontend (including application type checking), Prisma generation, backend TypeScript and Nest compilation pass.
- **Full configured regressions:** 775 backend tests and 465 frontend tests pass, with zero failures. The backend total includes ten tests against a fresh local PostgreSQL cluster, including concurrent receipt retries and transactional rollback. The cluster was stopped and its test schemas removed afterward.
- **Deployment runtime:** a fresh standalone `npm ci` and backend build pass under Node 20.20.2 / npm 10.9.9; 42 focused recovery, database and backend regressions also pass there. These overlap the full-suite total. Docker itself was unavailable, so this verifies runtime/install/build behavior, not a container image.
- **Recovery evidence:** all 22 service probes and all bounded model checks pass. The 30-state graph still satisfies conditional `AG EF Reconciled`; counterexamples to unconditional completion and historical reconstruction remain explicit. Recovery source fingerprints are unchanged. The six state diagrams remain current.
- **Contracts:** `cc-check format` and `cc-check list` pass on all fifty affected TypeScript/TSX files. Syntax/discoverability and semantic compliance are distinct; the changed obligations were reviewed alongside their implementation and regressions.

The compiler fixes align DTOs, imports, controller signatures and Prisma relations with the stored schema. Eight new regressions cover invoice patient/branch scoping, permission filters/default pagination, JSON permission storage and explicit clearing, authenticated statistics/dashboard scope, relational service-revenue allocation across partial payments, invoice update validation, and missing JWT configuration.

The full suites also exposed the missing optional numeric dosage editor; it is restored, preserving positive values and allowing the value to be cleared. Import tests exercise preview before confirmation, and API error tests retain the diagnostic reference contract. The patient-merge test verifies the corrected Prisma relation update.

The standalone backend lockfile was malformed. It is now a valid lockfile using the workspace's direct dependency versions, with the two new declaration packages pinned. The conflicting `iconv-lite` override and direct dependency now both specify 0.6.3. An unused private `@cms/shared-types` peer declaration was removed because a backend-only Docker context cannot resolve it from npm; backend source does not import that package. Workspace clean-install dry runs pass under both the local npm and Node 20/npm 10.

`cc-check` was unavailable because it was neither globally installed nor declared in project dependencies. It is now pinned as `@spolu/cc-check@0.2.0` in root development dependencies. Use:

```sh
npm run contracts:format -- backend/src/modules/inventory/inventory-workflow.service.ts
npm run contracts:list -- backend/src/modules/inventory/inventory-workflow.service.ts
```

The tool declares Node >=24.16 and npm >=11.11; installation used npm 11.11 and validation used Node 25.1. It is development tooling, separate from the validated Node 20 application runtime. Version 0.2.0 does not support `.cjs`; the proof runner was manually inspected and its executable service probes pass.

Scope limits: three opt-in tests were not run in the full suite (live Codex OCR, the prescription Chromium workflow, and the signature browser workflow). Thirteen legacy backend test files remain excluded by the existing Jest configuration. Next.js linting is skipped by the existing build configuration. Production data, deployed configuration, and a full container image were not verified. These limits are not represented as passing checks.

[Machine-readable validation](validation-summary.json), [backend cases](ship-backend-regressions.json), [frontend cases](ship-frontend-regressions.json), [Node 20 cases](ship-node20-regressions.json), [contract results](contract-check-results.json), [build output](ship-build.log), [clean backend build](ship-clean-build.log), and [source fingerprints](ship-source-sha256.json) preserve the evidence. The earlier selected-suite summary is retained in [before-ship-validation-summary.json](before-ship-validation-summary.json).
