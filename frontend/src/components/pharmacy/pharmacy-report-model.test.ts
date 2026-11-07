import {
  type DayWiseReport,
  type MarginRow,
  billCell,
  clinicToday,
  dayWiseCsvRows,
  nextMarginSort,
  sortMarginRows,
} from "./pharmacy-report-model";

const bills = (overrides: Partial<DayWiseReport["rows"][number]["bills"]> = {}) => ({
  billCount: 0, ranges: [], missing: [], missingCount: 0, numbers: [], otherReferences: [], ...overrides,
});

describe("billCell", () => {
  it("shows the day's bill range with the missing number and its status", () => {
    const cell = billCell(
      {
        noBills: false,
        bills: bills({
          billCount: 4,
          ranges: [{ prefix: "PHI-2026-", from: 536, to: 540 }],
          missing: [{ invoiceNumber: "PHI-2026-538", status: "DRAFT" }],
          missingCount: 1,
          otherReferences: [
            { kind: "COUNTER_SALE", reference: "CS-11" },
            { kind: "COUNTER_SALE", reference: "CS-12" },
            { kind: "SALES_RETURN", reference: "SR-2" },
          ],
        }),
      },
      "SALES",
    );

    expect(cell).toEqual({
      primary: "536 - 540",
      gap: "gap: 538 (draft)",
      extras: "+ 2 counter sales, + 1 customer return",
      title: "4 bills: PHI-2026-536 to PHI-2026-540. Not issued: PHI-2026-538 (draft). Also posted: CS-11, CS-12, SR-2",
    });
  });

  it("drops leading zeros and caps the listed gaps", () => {
    const cell = billCell(
      {
        noBills: false,
        bills: bills({
          billCount: 2,
          ranges: [{ prefix: "PHI-2026-", from: 3, to: 9 }],
          missing: ["004", "005", "006", "007", "008"].map((n) => ({ invoiceNumber: `PHI-2026-${n}`, status: null })),
          missingCount: 5,
        }),
      },
      "SALES",
    );

    expect([cell.primary, cell.gap]).toEqual(["3 - 9", "gap: 4, 5, 6 +2 more"]);
  });

  it("lists supplier bill numbers for purchases and marks empty days", () => {
    expect(billCell({ noBills: false, bills: bills({ billCount: 2, numbers: ["APX/0457", "DM-88231"] }) }, "PURCHASE").primary).toBe(
      "2 bills: APX/0457, DM-88231",
    );
    expect(billCell({ noBills: true, bills: bills() }, "SALES").primary).toBe("No bills");
  });
});

describe("dayWiseCsvRows", () => {
  it("writes one row per day plus a total row with every slab band", () => {
    const zero = { taxableAmount: 0, cgst: 0, sgst: 0, igst: 0, totalGst: 0, grossAmount: 0 };
    const twelve = { slabPercent: 12, taxableAmount: 220, cgst: 13.2, sgst: 13.2, igst: 0, totalGst: 26.4, grossAmount: 246.4 };
    const report: DayWiseReport = {
      type: "SALES",
      period: { startDate: "2026-11-05", endDate: "2026-11-06", timeZone: "Asia/Kolkata" },
      columns: [12],
      rows: [
        { date: "2026-11-05", noBills: false, bills: bills({ billCount: 1, ranges: [{ prefix: "PHI-2026-", from: 536, to: 536 }] }), slabs: [twelve], total: twelve, amount: 246.4 },
        { date: "2026-11-06", noBills: true, bills: bills(), slabs: [{ slabPercent: 12, ...zero }], total: zero, amount: 0 },
      ],
      totals: { slabs: [twelve], total: twelve, amount: 246.4, billCount: 1, missingCount: 0, noBillDays: 1 },
    };

    expect(dayWiseCsvRows(report)).toEqual([
      { "Bill Date": "2026-11-05", "Bill No.": "536", "Bill Count": 1, "CESS Base": 0, "CESS SGST": 0, "CESS CGST": 0, "CESS IGST": 0, "12% Base": 220, "12% SGST": 13.2, "12% CGST": 13.2, "12% IGST": 0, "Total Base": 220, "Total SGST": 13.2, "Total CGST": 13.2, "Total IGST": 0, "Total Amount": 246.4 },
      { "Bill Date": "2026-11-06", "Bill No.": "No bills", "Bill Count": 0, "CESS Base": 0, "CESS SGST": 0, "CESS CGST": 0, "CESS IGST": 0, "12% Base": 0, "12% SGST": 0, "12% CGST": 0, "12% IGST": 0, "Total Base": 0, "Total SGST": 0, "Total CGST": 0, "Total IGST": 0, "Total Amount": 0 },
      { "Bill Date": "Total", "Bill No.": "", "Bill Count": 1, "CESS Base": 0, "CESS SGST": 0, "CESS CGST": 0, "CESS IGST": 0, "12% Base": 220, "12% SGST": 13.2, "12% CGST": 13.2, "12% IGST": 0, "Total Base": 220, "Total SGST": 13.2, "Total CGST": 13.2, "Total IGST": 0, "Total Amount": 246.4 },
    ]);
  });
});

describe("margin sorting", () => {
  const row = (name: string, profitPercent: number | null, salesAmount: number) =>
    ({ name, profitPercent, salesAmount }) as MarginRow;
  const rows = [row("Calamine", null, 112), row("Adapalene", 15, 224), row("Sunscreen", 20, 590)];

  it("puts the highest margin first and rows without a cost last in either direction", () => {
    expect(sortMarginRows(rows, { key: "profitPercent", direction: "desc" }).map((r) => r.name)).toEqual(["Sunscreen", "Adapalene", "Calamine"]);
    expect(sortMarginRows(rows, { key: "profitPercent", direction: "asc" }).map((r) => r.name)).toEqual(["Adapalene", "Sunscreen", "Calamine"]);
  });

  it("flips direction on the same column and starts text columns ascending", () => {
    expect(nextMarginSort({ key: "profitPercent", direction: "desc" }, "profitPercent")).toEqual({ key: "profitPercent", direction: "asc" });
    expect(nextMarginSort({ key: "profitPercent", direction: "desc" }, "name")).toEqual({ key: "name", direction: "asc" });
    expect(sortMarginRows(rows, nextMarginSort({ key: "profitPercent", direction: "desc" }, "salesAmount")).map((r) => r.name)).toEqual(["Sunscreen", "Adapalene", "Calamine"]);
  });
});

it("uses the Asia/Kolkata calendar day", () => {
  expect(clinicToday(new Date("2026-11-06T19:00:00.000Z"))).toBe("2026-11-07");
});
