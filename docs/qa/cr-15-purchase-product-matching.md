# CR-15 — Purchase invoice product identity

Prepared on 2026-09-27 on `codex/cr15-purchase-matching`, based on `origin/main`. Not deployed by this task. The branch includes the shared name-matching integration required by this fix; unrelated working-tree changes are excluded.

## Behavior

- Suggestions require distinguishing product-name or reviewed-alias evidence. Manufacturer, MRP, pack, strength or generic form words such as “Cream” cannot establish a match. Genuine name typos still appear as possible matches, preserving the existing duplicate-prevention behavior.
- Unmatched lines show **Not in inventory**, **Create new item**, and a manual product search. Legacy responses recommending creation cannot display an unrelated suggested product even if they contain a candidate.
- Labels are **Same product**, **Possible match**, and **Not in inventory**.
- Confirming differing normalized names, known kinds, strengths or pack dimensions returns HTTP 409 before writes unless explicitly acknowledged. The UI displays **These look like different products. Confirm anyway?**, the two identities, and the differences. Cancellation leaves the invoice unchanged.
- Successful confirmation records the original line, selected product, score/reasons, reviewer and acknowledgement in an atomic audit event alongside catalogue updates. Confirmation itself never changes stock. Stock posting retains the existing exact product/pack resolution and transaction safeguards.
- Editing a product name or pack, or removing a line, clears outdated match suggestions. Manual search discards stale responses and distinguishes failure from an empty result.

## Reproduction and validation

The exact Moisturex name was already rejected by the shared matcher in the initial combined working tree; this branch includes that integration. Remaining defects reproduced before the fix: generic `Cream` and metadata-only `50 ml` lines could score 92.32 and 96 against Abzorb; manual Moisturex → Abzorb confirmation succeeded without a mismatch warning. The UI still used numeric confidence and had no manual product search.

- Backend: 100 service, automation, product-catalogue and shared-search tests passed; 48 HTTP permission tests passed, including the new manual-search route.
- Frontend: 57 workbench/product-details tests and 2 manual-search tests passed. Coverage includes warning cancellation, explicit acknowledgement, original identity preservation and stale-search rejection.
- The stock regression posts Moisturex to its own product/batch and verifies that no existing Abzorb inventory is updated.
- Chrome browser check used the actual matching service with a synthetic in-memory catalogue at desktop and 390px mobile widths: no Abzorb suggestion, creation option visible, manual mismatch warning, zero writes after cancellation, no horizontal overflow. Obscura was attempted first but failed React hydration/navigation.
- Frontend production TypeScript check passed. The backend production check reports errors outside the changed purchase files (including main-module imports, appointment DTOs and user/report types); no changed purchase source errors were reported.
- `cc-check format` and `cc-check list` passed for changed production TS/TSX files. The installed tool does not support `.cjs`; diagnostic scripts were reviewed manually. `git diff --check` passed for the changed tracked files.

The isolated commit was rechecked: 148 backend tests and 59 frontend tests passed, as did the frontend production TypeScript check, contract checks, and the desktop/mobile browser regression.

Evidence: [desktop](cr15/no-match-desktop.png), [mobile manual selection](cr15/manual-match-mobile.png), [browser assertions](cr15/browser-check.json), [contract discovery](cr15/contracts.txt).

## Historical production audit

The read-only audit inspected all **8 purchase invoices / 18 lines**, including **2 posted invoices / 4 stock transactions**, retained source maps, draft audit snapshots, catalogue links and current inventory records. No production writes were performed.

- **SB-26-45503**, batch **SGD0183**, contains **Moisturex Hydra Gel Cream, 50 Ml, quantity 10**. Its status is `RECONCILIATION_FAILED`, it has no stock commitment or inventory link, and the **Abzorb 1% Cream** catalogue record has no linked inventory. This invoice has not added stock to Abzorb.
- **AB07664**: retained source “NEVLON INTENSE MOIST LOTION,” posted “Nevlon Intense Moiturising Lotion,” and inventory “Nevlon Intense Moisturising Lotion” retain the same brand, 300ML pack and AB3513 batch. The evidence indicates abbreviation/spelling variation, not another product.
- **SB-26-110614**: three Folitrax lines retain their 5, 7.5 and 10 strengths, expected pack counts and separate inventory/transaction links. Differences include DPC annotations, Tab/Tablet, and omitted mg. The earliest 5mg draft has a truncated batch `AT-24042` versus posted `AT-240426`, so that row lacks an exact original batch join; its transaction and drug link are retained in the report for review.
- **Limitation:** older confirmation actions did not retain their matching scores or original selected-name snapshots. Therefore the exact historical set of low-score or manufacturer-only confirmations cannot be reconstructed. Three source-name differences and one evidence gap are reported rather than silently treated as verified equivalence.

**Stock corrections applied: 0.** The available evidence did not identify a confirmed wrong-product posting to correct. A score or text difference alone is insufficient evidence for changing stock.

The detailed production audit is retained locally in the original workspace at `output/cr15/production-match-audit.json`; raw production records are not included in this commit. Re-run with `node scripts/diagnostics/cr15-purchase-match-audit.cjs`; the script uses a read-only production transaction and never changes stock.

For the synthetic browser regression, run the frontend with `NEXT_PUBLIC_API_PROXY=http://127.0.0.1:4015 npm run dev --workspace=frontend -- --port 3115`, then `CR15_CHROME=1 node scripts/diagnostics/cr15-purchase-match-browser.cjs`. For Obscura, start its CDP server on port 9315 with `--allow-private-network` and omit `CR15_CHROME`.
