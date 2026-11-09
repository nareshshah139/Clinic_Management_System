# CR-33 Pharmacy Report: formal checks

Two machine-checked proofs back the parts of the Pharmacy Report where a wrong answer costs money.

## Money rules (`check_money.py`, z3)

Proved for every non-negative input, over real numbers:

- **GSTR-3B credit set-off** (`setOff` in `backend/src/modules/pharmacy/pharmacy-gst-reports.ts`):
  - every head balances: credit used + cash = liability, and credit used + credit carried forward = credit;
  - the allocation is legal under CGST Act s.49(5), s.49A and rule 88A (permitted routes only; IGST credit pays IGST first; CGST and SGST credit pay their own head before IGST; IGST credit is exhausted before CGST or SGST credit);
  - it is cash-optimal: no legal allocation pays less tax in cash.
- **Daily collection**: for every bill, billed = collected − paid above the bill + still due; a bill is never both due and over-paid; the day is SHORT exactly when the count falls short by half a paisa or more.

A conformance step runs the real TypeScript `setOff` on 400 random inputs and checks that it matches the symbolic model, so the proof is about the shipped code. The code also rounds each step to the paisa; the Jest suites cover that.

Negative controls, which must fail:

- the naive greedy order (IGST credit to CGST before SGST) is shown to pay avoidable cash. This is the bug the proof caught during development: liability CGST 100 + SGST 100 against credit IGST 100 + CGST 100 paid ₹100 in cash that the law lets the clinic pay from credit.
- a CGST-credit-to-SGST route is shown to be illegal.

```bash
python3 -m venv /tmp/z3 && /tmp/z3/bin/pip install z3-solver==5.3.1.0
/tmp/z3/bin/python verification/cr33-pharmacy-report/check_money.py
```

## Cash-count protocol (`CashCount.tla`, TLC)

Several staff can count the same day at once. Each save names the count it was based on. The server appends the new count with the next sequence only if that is still the latest; the unique key on (branch, day, sequence) settles a race between the check and the insert.

| Mode | What it models | Expected |
| --- | --- | --- |
| `correct` | the check plus the unique key, as built | no violation (292 states with 2 staff, 6,833 with 3) |
| `noCheck` | append after whatever is latest | `NoLostUpdate` violated |
| `noUnique` | the check and the insert as separate steps, no unique key | `Contiguous` violated |
| `overwrite` | one row per day, last write wins | `HistoryKept` violated |

Properties: `Contiguous` (sequences run 1..n with no gaps or duplicates), `NoLostUpdate` (every saved count was typed by someone looking at the count it replaces), `HistoryKept` (no saved count is ever erased) and `SomeoneCounted`.

```bash
python3 verification/cr33-pharmacy-report/verify.py --jar /path/to/tla2tools.jar
```

Both checks run in CI: `check_money.py` in the test job, and `verify.py` in `.github/workflows/pharmacy-report-formal.yml`.
