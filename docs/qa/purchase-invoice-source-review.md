# Purchase invoice source review

The invoice form and original file share one screen. Focusing a captured field selects its estimated source region; the source selector and image regions return to the corresponding field. The preview supports rotation, zoom, PDF pages and original download. Mobile has a View source link. Required product matching stays visible, and duplicate reasons for the same field require one confirmation.

New uploads save a source map beside the archived original. Older uploads expose Locate source fields. That action writes only document metadata; it cannot update invoice amounts, review state or stock. Source navigation remains available on committed invoices. Missing or derived values explicitly have no reliable printed location.

Location reads receive only original page images, independently from extraction and verification. Requests contain one page, with at most two concurrent location requests. Geometry cannot replace extraction values or clear review flags. Invalid coordinates are discarded; uncertain row alignment is omitted. Persisted row references preserve the original batch association after reordering, deletion or a later extraction. Original bytes remain unchanged.

## Validation — 14 September 2026

- Original supplied Eucerin invoice: actual browser upload, correction of a misread supplier GSTIN using its highlighted source, supplier/product setup, review and stock commit in an isolated local PostgreSQL database. Two stock entries contained 9 and 7 packs; total 45,602. Original stored/downloaded bytes matched, source references persisted, and stock status survived reload without a second commit. Cash and Pack were explicit local test choices.
- Synthetic 20-row, two-page PDF: real OCR extracted every batch and total 2,240. Initial whole-document annotation timed out at 120 seconds. Per-page annotation succeeded through the older-document endpoint; all 20 batch regions matched their printed column, row and page. Both preview pages reopened; the source map persisted. The successful request took 181 seconds including fresh extraction and verification.
- PostgreSQL regression: additive source migration, 20-row reference persistence through reversal, stock commit, duplicate protection and original retention in a randomly isolated schema.
- Automated checks cover branch/read/create permissions, image-only requests, location failures, partial-page results, ambiguous and reordered batches, malformed coordinates, duplicate confirmations, PDF navigation, edited-value notices and source links on locked forms.
- Desktop and mobile visual checks passed with no horizontal overflow. Frontend/backend production builds passed. Backend standalone TypeScript still has its existing 74 errors; this change adds none.

The schema change adds nullable sourceMap and ocrSourceRef columns. It does not backfill invoice values or change historical stock. Customer photos, extracted records, local credentials and the temporary test route are excluded from the commit.
