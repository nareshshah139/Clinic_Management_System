# Invoice review with fewer repeated actions

The batch editor now offers Select all and Clear selection, shows the selected count, and names GST components in its preview. Select all captures the rows currently on the bill. Adding a row later does not silently include it. Individual exclusions, preview, apply and undo remain available.

The existing action bar now includes Previous and Next check. Navigation opens the relevant field, including fields inside disclosures. Its position describes where the operator is looking, not how many values have been approved. Correcting or deleting a row preserves navigation to surviving checks without moving focus during typing.

The navigator derives row checks from current OCR flags and current validation. Persisted line-number-only reconciliation messages remain in the existing review checklist; the navigator does not guess which edited product they describe. The final confirmation, save, review, stock posting, permissions, revision checks and uncertain-outcome readback keep their existing ownership.

Two designs were compared independently. Keeping the worksheet visible with direct check navigation was selected over collapsed product rows, which would add expansion steps during full bill comparison. One implementation owner changed the editor and review helper; separate browser and code reviewers checked the result. Models were inherited rather than selected for diversity. Obscura did not complete the hydrated invoice test, so Chrome supplied the browser evidence.

## Source mapping

The historical stock and intake witness model retains its states, edges, assumptions and assertions. This change adds local navigation and selection controls; neither performs a stock transition or grants review evidence. The source fingerprints for the workbench, its component tests and the review helper are refreshed after semantic review. The source-drift check remains enforced. Older browser and model artifacts retain their original provenance.

## Verification

Validation uses the production frontend build, the frontend regression suite, contract syntax and discoverability checks, and synthetic desktop and phone browser scenarios. Browser fixtures do not establish real OCR accuracy, production ledger quantities or physical mobile-keyboard behavior.

Experience First selected direct check navigation. Subtract Before You Add replaced repeated footer guidance instead of adding a second sticky bar. Model the Domain kept one derived check index and one navigation cursor, separate from approval evidence.
