import {
  type DayWiseReport,
  type MarginRow,
  billCell,
  clinicToday,
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
