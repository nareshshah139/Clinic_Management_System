# Inventory names, batch visibility and search — 16 September 2026

The change keeps **all batches visible by default**, as requested. It does not merge inventory, rename database records or adjust quantities. Production inspection used a read-only database transaction. The checks below were completed locally before release; they do not verify a subsequent production deployment.

## Production findings

At 06:23 UTC, the clinic had 430 inventory records: 208 with positive stock and 222 with zero stock. Two positive balances were expired. There were 86 repeated normalized-name groups, which is not a count of duplicate products: different batches and pack sizes legitimately share a name. There were 84 unmapped legacy inventory records and no inventory records linked to multiple catalog entries.

Examples from the actual records:

- **Max Rich Yu Cream, 100 g:** five empty source batches and one current source batch, `7B260057`, with 17 packs. A broader search also finds a legacy name variant.
- **Photostable Pro+ SPF 80+ Hydrogel Sunscreen, 50 g:** five empty batches and one with 18 packs.
- **T-Bact Ointment, 15 g:** one empty batch and two current batches containing two and 20 packs. The 5 g variant must stay separate.
- **Sebium Moussant (M-1599), 200 ml:** two same-name/same-pack source rows link to different catalog IDs. This is a candidate for identity review, not proof that records can safely be merged solely by name.

The backfill retained source identifiers and historical records deliberately. It did not infer that every zero balance arose from a sale. Opening snapshots, counts, loss and returns can also establish or reduce a balance. Historical sales must not be fabricated from the snapshot.

## UI changes

- All batches remain the default list. Optional views allow current/on-hand or previous/depleted batches to be inspected separately.
- Positive, verified active stock has green rows; zero-stock batches have grey rows. Expired, inactive, negative or expiry-unverified stock has amber rows. Each row has a text state; color is not the only cue. Fully held physical stock remains on hand and is labeled held.
- Multiple positive batches remain current simultaneously. Creation time does not determine which stock exists, and a newer receipt does not hide an earlier batch.
- Product names use the single linked catalog identity where one exists. The recorded inventory name remains visible when different. Pack sizes and stock units remain explicit.
- Opening a product now includes sibling batches with the same single catalog identity, branch, stock unit and exact pack even if a legacy inventory category differs. It does not group by fuzzy name. Unmapped and ambiguous records stay isolated.
- List, CSV export and count requests use identical effective filters. Selection survives pagination and clears when the filter scope changes.
- The stock page now displays expiry using the stored UTC calendar date, fixing the observed India-timezone rollover from month end to the next month.

## Search and prevention of naming issues

| Path | Behavior |
| --- | --- |
| Production stock lookup before this change | Case-insensitive phrase/substring matching against inventory fields. |
| Stock lookup after this local change | Word matching in any order, punctuation normalization, linked catalog names, source names and source codes. Explicit `inventory:` codes resolve the exact branch item. No record merging or typo-based automatic identity assignment. |
| Pharmacy Drug Search | Separate token-based queries and ranked autocomplete. It does not share the stock lookup implementation. |
| OCR candidate suggestions | Separate approximate scoring using name/token/edit similarity plus pack, manufacturer, strength and form signals. Candidate retrieval is limited; this is not a guarantee of exhaustive typo-tolerant matching. |
| OCR enrichment / stock commitment | Active catalog lookup by case-insensitive exact name, canonical pack and optional manufacturer. Missing or ambiguous matches require review. |
| New product from OCR | Blocks an existing exact-name match, but does not establish persistent aliases or eliminate spelling/abbreviation variants. |

**The current intake reduces naming errors but does not fully prevent them.** A durable next change would store a reviewed product ID on each purchase line and retain supplier/source-name aliases pointing to that identity. Approximate search can suggest candidates; stock posting should use a verified identity and preserve strength, dosage form and stock-unit/pack boundaries. Existing same-name records need a reviewable mapping decision before any merge. These identity changes are not included in this UI update.

## Sale deductions

The existing pharmacy invoice confirmation path plans stock deductions by linked drug identity and earliest eligible expiry, then records a SALE transaction for each allocated inventory batch with a negative quantity delta. Each batch balance is decremented within the transaction with concurrency checks. Draft/PENDING invoices acquire stock effects when transitioned to a stock-posting state.

The counter-sale workflow uses the selected inventory batch ID. It requires a reason to bypass an earlier-expiry batch of the same identity/unit/pack. A posted sale deducts paid and free quantities from that batch. Returns refer back to the original sale movement. A zero balance subsequently renders as previous/depleted; no batch is deleted.

No production sale was created as a test. Sale behavior was checked in existing service tests and the isolated local database workflow suite.

## Validation and contracts

- 9 backend tests passed: stock scopes, pagination/valuation, lookup, sibling identity, invoice deduction/expiry behavior and invoice print allocations.
- 6 frontend tests passed: all-batch default, row colors, pack labels, navigation, count scope, selection preservation/reset, batch states and UTC expiry display, including `TZ=Asia/Kolkata`.
- 13 isolated local database workflow checks passed, including counter-sale deductions, source-linked returns, stock-shortage rollback and concurrent repeated-post protection.
- Backend's configured SWC build passed. Frontend TypeScript check passed.
- Backend's optional full TypeScript audit has 67 existing diagnostics. Comparing the changed service with HEAD produced the same 67 diagnostics and **zero introduced diagnostics**. This is not a claim that the repository-wide TypeScript audit is clean.
- Replaying the read-only production records through the changed stock service returned all 430 rows, 208 on-hand rows and 222 depleted rows; reordered product-word searches found the expected source and legacy variants.
- The real stock component was rendered locally with actual read-only batch balances for Obscura desktop (1440 px) and mobile (390 px) checks. No page-level horizontal overflow was observed; the wide table retains horizontal scrolling. This is a component rendering check, not a new production deployment test. Prices were omitted from this fixture and appear as zero in its screenshots.
- `cc-check format` and discovery passed for the modified declarations; the UI detector reported no findings. Semantic checks are covered by the tests above.

New contracts: `inventory-batch-view-scope`, `inventory-search-not-identity`, `inventory-sibling-batch-identity`, `stock-page-default-scope`, `batch-state-physical-not-recency`, `batch-color-has-label`, `stock-expiry-calendar-date`. Existing stock filter, expiry, valuation, item-history and sale-posting contracts were inspected. API consumers retain all batches when no view is specified. Existing batch identity protections remain in place.

Local verification artifacts (retained in the workspace, not included in the Git commit):

- [Read-only production inventory snapshot](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-names-2026-09-16/production-readonly.json)
- [Source-record lookup replay](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-names-2026-09-16/source-replay.json)
- [TypeScript comparison](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-names-2026-09-16/typescript-comparison.json)
- [Visual check measurements](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-names-2026-09-16/visual-check.json)
- [Desktop component preview](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-names-2026-09-16/batches-desktop.png)
- [Mobile component preview](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-names-2026-09-16/batches-mobile.png)
- [Local database workflow results](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-names-2026-09-16/local-workflow-results.json)
