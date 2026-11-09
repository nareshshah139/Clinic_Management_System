import fc from "fast-check";
import {
  REPORT_CATALOG,
  REPORT_CATEGORIES,
  findReport,
  isInPage,
  reportsIn,
  searchReports,
} from "./pharmacy-report-catalog";

const titles = (query: string) => searchReports(query).map((report) => report.title);

describe("pharmacy report catalog", () => {
  it("lists every category in the clinic's order, each with at least one report", () => {
    expect(REPORT_CATEGORIES).toEqual(["GST Reports", "Margin Reports", "Stock Reports", "Accounting Reports", "Others"]);
    for (const category of REPORT_CATEGORIES) expect(reportsIn(category).length).toBeGreaterThan(0);
  });

  it("has unique ids and links only to inventory registers", () => {
    expect(new Set(REPORT_CATALOG.map((report) => report.id)).size).toBe(REPORT_CATALOG.length);
    for (const report of REPORT_CATALOG.filter((r) => !isInPage(r))) expect(report.href).toMatch(/^\/dashboard\/inventory\?area=/);
  });

  it("marks the four most used reports, all rendered in the page", () => {
    const mostUsed = REPORT_CATALOG.filter((report) => report.mostUsed);
    expect(mostUsed.map((report) => report.title)).toEqual(["GST Summary", "Day wise Summary", "Item Wise Margin", "Monthly Report"]);
    expect(mostUsed.every(isInPage)).toBe(true);
  });

  it("finds a report by id and nothing for an unknown id", () => {
    expect(findReport("item-margin")?.title).toBe("Item Wise Margin");
    expect(findReport("nope")).toBeUndefined();
    expect(findReport(null)).toBeUndefined();
  });
});

describe("searchReports", () => {
  it("returns everything for an empty or blank query", () => {
    expect(searchReports("")).toHaveLength(REPORT_CATALOG.length);
    expect(searchReports("   ")).toHaveLength(REPORT_CATALOG.length);
  });

  it("matches title words by prefix, ignoring case", () => {
    expect(titles("DAY")).toEqual(["Day wise Summary"]);
    expect(titles("marg")).toEqual(["Item Wise Margin"]);
  });

  it("matches keywords and the category name", () => {
    expect(titles("profit")).toEqual(expect.arrayContaining(["Item Wise Margin", "Monthly Report"]));
    expect(titles("accounting")).toEqual(["Monthly Report", "Supplier payments & dues"]);
  });

  it("requires every word of the query", () => {
    expect(titles("gst summary")).toEqual(["GST Summary", "Day wise Summary"]);
    expect(titles("gst zebra")).toEqual([]);
  });

  it("never returns a report that is not in the catalog, in catalog order", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), (query) => {
        const found = searchReports(query);
        const order = found.map((report) => REPORT_CATALOG.indexOf(report));
        expect(order.every((index) => index >= 0)).toBe(true);
        expect(order).toEqual([...order].sort((a, b) => a - b));
      }),
    );
  });
});
