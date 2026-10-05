# Inventory and visits repair

Base: production main `2ec721a`. The primary checkout was 27 commits behind production with local changes. Those changes are preserved in `7a0ee1a` on `codex/inventory-visits-fixes`; this release uses `codex/inventory-visits-release`.

## Run checklist

- [x] Read the Principles section of the poteto-mode skill in full.
- [x] Phase A: Frame
- [x] Phase B: Design the workflow
- [ ] Phase C: Run the loop
- [ ] Repair billing atomicity, checkout/payment retries and package stock side effects.
- [ ] Repair visit deletion/completion, draft-photo access and prescription/refill persistence.
- [ ] Repair clinical explicit clears and completion after reload.
- [ ] Make queue reads side-effect free and bounded; preserve stock filtering and pagination.
- [ ] Integrate independently committed slices and run real PostgreSQL regressions.
- [ ] Review contracts, comments, security boundaries and actual diffs independently.
- [ ] Rehearse migrations, run production builds and verify the UI through local authenticated flows.
- [ ] Deploy the reviewed integrated revision and verify both services and normal-auth smoke checks.
- [ ] Phase D: Keep the audit trail
- [ ] Phase E: Verify and hand back

## Throughput checkpoint

Blocking first steps were preserving local work, identifying the production base, reproducing defects and agreeing on additive persistence changes. These are complete apart from rerunning the probes on current main.

Four independent workstreams own billing, backend lifecycle, clinical forms, and inventory/queue reads. Each has a managed worktree and branch. The parent owns integration, combined regressions, release evidence and deployment. Prisma schema changes are restricted to each lane's models and separate migrations, then reconciled by the parent. No worker edits the primary checkout or deploys independently.

This is the smallest useful split because the financial transaction boundary, clinical lifecycle, form edit intent and query semantics are separate invariants. Tests and contracts travel with each slice.

## Design decision

Two independent architecture sketches and a third judge selected extensions of existing services. Invoice and payment records carry durable request keys and canonical payload hashes. All invoice writers share a transaction fence. Posted cancellation is rejected; the existing return workflow preserves financial and stock provenance. Visit completion/deletion and prescription/refill state become actual schema fields. Clinical dirty patches distinguish omitted values from explicit clears. Queue reads use complete filtered queries or an authoritative projection, never page-before-filter or read-triggered writes.

No generic command dispatcher, event bus, event sourcing rewrite or money-column conversion is included. Independent review used inherited models; model-family diversity was not established.

## Done predicate and evidence

All twelve audit issues must have a verified correction or evidence that current main already corrected them. Tests must exercise real PostgreSQL races, retries and lifecycle persistence. Filtered pages and totals must agree with full-population reference results. Normal reads must not write. Clinical fields must clear after save and reload. Branch boundaries must reject foreign draft photos. Contract syntax and discoverability must pass for affected source files.

The integrated revision must pass relevant unit/integration checks, production builds, migration rehearsal and authenticated browser smoke checks. Deployment must show the exact intended application commit on frontend and backend, health checks and migration completion. Historical inconsistencies are reported rather than silently rewritten. The primary checkout's unrelated work remains preserved.

Decision trail: `decisions.tsv`. Evidence locations and final commands are recorded as work completes. A negative or inconclusive check is not a pass.
