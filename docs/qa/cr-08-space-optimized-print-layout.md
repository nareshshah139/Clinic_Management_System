# CR-08: Space-optimized print layout

The prescription print source now puts Chief Complaints, Review Date, and
Follow-up labels beside their values when Space-optimized layout is checked.
Values wrap within their own column, including unbroken words. The normal
layout keeps its original stacked headings and “Follow-up Instructions” label.
Existing blank-field guards, translations, date formatting, and the explicit
Follow-up page break remain in place. Review Date and Follow-up remain separate
rows.

## Verification — 2026-09-27

- Chromium ran the actual local editor and Paged.js preview with every API
  response replaced by synthetic fixtures. No real patient records were used.
- Short, long, and empty scenarios passed normal → optimized → normal checks.
- Each short field occupied one line instead of two; its row height dropped
  from 69 px to 44 px. Total saving across the three fields: 75 px.
- Long complaints included an explicit newline; long follow-up included an
  unbroken word. Visible-word bounds confirmed wrapping beneath the value and
  no overflow beyond its column. Text content was preserved.
- Unticking restored the original labels, values, alignment, and row heights.
- Existing `PrescriptionBuilder.pagedjs.margins.test.tsx`: 29 passed, 7 failed.
  All seven failures also reproduced using the pre-change component snapshot.
  They concern numeric-dosage controls, not these print fields.
- `cc-check format` and `cc-check list` passed for the component, including the
  new `compact-clinical-print-fields` contract. The diagnostic script's `.cjs`
  extension is unsupported, so its contract was checked through an identical
  temporary `.ts` copy inside the repository; the copy was removed afterward.
- Layout scan findings were limited to existing accent borders and the print
  design grid outside this change. `git diff --check` passed.

Reproduce with the local frontend running on port 3000:

```sh
node scripts/diagnostics/cr08-print-layout-browser.cjs
```

Evidence: `output/cr08-print-layout/checks.json`, `short-normal.png`,
`short-optimized.png`, `long-optimized.png`, and `empty-optimized.png`.
