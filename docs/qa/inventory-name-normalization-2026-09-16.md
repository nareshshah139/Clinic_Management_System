# Reviewed inventory names — 16 September 2026

The production inventory audit identified spelling, capitalization, spacing, abbreviation and embedded-price variants. The reviewed plan standardizes 46 presentation-name groups across 120 batch records; 77 recorded names change. Repeated batches remain separate records.

The complete mapping and deferred candidates are in `scripts/diagnostics/inventory-name-rules-20260916.json`. Examples include Maxich/Maxrich → Max Rich Yu Cream, Corofit/Carofit → Carofit Plus Tablet, Tricoslik → Tricosilk Pro Hair Solution, and Deepwhite → Depiwhite (cream and eye gel remain separate).

## Boundaries

- Only `InventoryItem.name`, `metadata.nameNormalization` and `updatedAt` change. Every updated row has an atomic before/after audit attributed to the authorized actor and operation ID.
- The original inventory/catalog names remain searchable aliases on their original rows. Aliases are not propagated across packs or used as evidence for drug identity.
- A reviewed inventory name takes precedence in inventory display. Existing loose-tablet/capsule labels stay visible. Pack text removed from a source name is retained as a display label without assigning pack conversion factors.
- Quantities, held stock, pack units/factors, prices, batch numbers, expiry, product IDs, mappings, stock movements and purchase history are preserved and compared inside the write transaction.
- Drug catalog names are unchanged. This avoids breaking exact-name OCR resolution or merging billing units. Pharmacy Drug Search and future OCR matching do not acquire a new alias-based identity resolver from this change.
- All batches stay visible. Same-name records may still have different catalog IDs; the batch-history screen continues to group by verified identity and pack.
- Incomplete brands/forms, missing strengths, kit variants, 300 ml versus 300 g lotion and conflicting embedded Obagi batch/date text remain deferred. No fuzzy auto-merge is performed.

## Validation

The local production-copy rehearsal changed all 120 planned records and compared every protected field before/after. All 120 old-name lookups and 120 canonical display checks passed. Explicit failure after seven writes, a later stale revision, and attempted unrelated-metadata changes rolled back completely, including audits. A successful rollback-only rehearsal left the database unchanged; replaying the committed local plan wrote zero records and zero additional audits.

Twelve backend stock/name and pharmacy invoice regression tests passed. The configured backend SWC build passed. `cc-check` format/discovery passed for the naming/display and search contracts; the CJS write contract was checked through a byte-identical TypeScript copy because the checker does not discover CJS declarations. These checks do not assert that the repository-wide optional TypeScript audit is clean.

Contracts: `inventory-reviewed-name-is-presentation`, `inventory-name-normalization-audit`, `inventory-search-not-identity`, `workspace-item-metadata-audit`, `inventory-master-not-balance`, and `inventory-sibling-batch-identity`.

Execution requires a captured snapshot and a reviewed, immutable plan. The script validates each saved revision and protected-data digest, rejects stale plans, and writes all rows/audits in one serializable transaction. Production source/plan/readback artifacts are kept privately under `output/diagnostics/inventory-name-normalization-2026-09-16/` and are not committed. Deployment and production execution receipts must be read from those artifacts; this document describes the tested change, not a production execution claim.
