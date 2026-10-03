# Inventory verification colors

Red indicates a correction or known mismatch; amber indicates a pending check or an unsaved proposal; green indicates an explicit confirmation or a known match. Gray remains available for unchecked or depleted stock. Each indicator has a visible label and an icon, with separate light and dark colors.

OCR checks retain a green Checked row after the user confirms the current value in the current editor session. Editing the value, changing dependent values such as expiry year, or receiving the flag again removes green. Reloading does not invent a previous human confirmation. Invoice fields turn green only after final human confirmation or a server-reviewed/committed status. Unknown stock outcomes and stale revisions suppress that global success state. Removing a product line now clears final approval as other edits already do.

Totals, supplier identity comparisons, product matches and saved-invoice statuses use the same indicators, with comparison results labelled as matches. No OCR flags alone does not imply verification. Stock rows distinguish expired/negative (red), held/inactive/unverified (amber), current on-hand (green) and depleted (gray). Unsaved corrections are amber and explicitly labelled Not saved yet.

## Verification

- 98 focused tests passed across the final invoice workbench, OCR checklist, supplier, review summary, review utility, stock list and stock-state suites. The broader inventory suites also passed; one prior class-name assertion was updated to the intended new stock color and passed on rerun.
- Production frontend build, including TypeScript checking, passed.
- Contract format and discovery checks passed for the 12 affected production source files. State transitions were checked against their contracts.
- Synthetic browser acceptance passed for red → amber → green → amber after editing, and for the existing scan/save/review/stock-correction/approval flow. No page errors or horizontal overflow at 1440px and 390px.
- Measured indicator text contrast is at least 8.73:1 in light mode and 13.26:1 in dark mode; borders are at least 3.08:1. Colors are redundant with labels and distinct icons.
- Desktop, mobile and dark-mode screenshots were inspected. The inventory surface now supplies its dark background so its text remains readable against the surrounding dashboard. The mechanical UI detector found no issues.

The browser uses synthetic local data, without clinic records or an external OCR request. Obscura previously stalled on this Next.js route, so Chrome remains the verified fallback. No backend, database schema, permissions or stock-writing API changed.

Run the existing inventory fixture and local frontend instructions from `inventory-simplicity-2026-10-03.md`, then run `node scripts/diagnostics/inventory-status-browser.cjs`. Evidence is in [verification.json](../../output/inventory-status/verification.json).
