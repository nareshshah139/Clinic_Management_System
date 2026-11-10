import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import { purchaseLine, slabBills } from '../pharmacy-gst-reports';
import {
  INDIAN_MONEY_FORMAT,
  PharmacyReport,
  ReportColumn,
  columnTotals,
  csvField,
  displayCell,
  reportCsv,
  reportFile,
  reportPdf,
  reportWorkbook,
  section,
} from '../pharmacy-report-table';

const columns: ReportColumn[] = [
  { key: 'billNo', label: 'Bill No.', kind: 'text', frozen: true },
  { key: 'billDate', label: 'Bill Date', kind: 'date' },
  { key: 'qty', label: 'Qty', kind: 'number' },
  { key: 'rate', label: 'Rate %', kind: 'percent', total: false },
  { key: 'amount', label: 'Amount', kind: 'money' },
];

const report = (
  sections = [
    section({
      id: 's',
      title: 'Sales Register',
      columns,
      rows: [
        {
          key: '1',
          cells: {
            billNo: 'PHI-2026-536',
            billDate: '2026-11-03',
            qty: 2,
            rate: 12,
            amount: 159656.74,
          },
        },
        {
          key: '2',
          cells: {
            billNo: '=HYPERLINK("x")',
            billDate: '2026-11-04',
            qty: 1,
            rate: 5,
            amount: -27.1,
          },
        },
      ],
    }),
  ],
): PharmacyReport => ({
  id: 'sales-register',
  title: 'Sales Register',
  period: {
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    timeZone: 'Asia/Kolkata',
  },
  headline: { label: 'Total for the period', value: 159629.64 },
  tiles: [],
  sections,
  notes: ['Drafts are excluded.'],
  scope: {
    statuses: ['CONFIRMED'],
    draftsExcluded: true,
    dateBasis: 'Bill date',
  },
  search: null,
});

describe('report totals', () => {
  it('derive every summable column from the rows and label the first text column', () => {
    const totals = report().sections[0].totals!;
    expect(totals).toEqual({
      billNo: 'Total',
      billDate: null,
      qty: 3,
      rate: null,
      amount: 159629.64,
    });
    expect(columnTotals(columns, [])).toMatchObject({ qty: 0, amount: 0 });
  });
});

describe('CSV', () => {
  it('puts the totals row directly under the header, in the screen’s column order, with plain two-decimal money', () => {
    const lines = reportCsv(report()).replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toBe('Bill No.,Bill Date,Qty,Rate %,Amount');
    expect(lines[1]).toBe('Total,,3,,159629.64');
    expect(lines[2]).toBe('PHI-2026-536,2026-11-03,2,12.00,159656.74');
  });

  it('defuses spreadsheet formulas and quotes fields that need it', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField('-27.10')).toBe('-27.10');
    expect(csvField('Shah, Meera')).toBe('"Shah, Meera"');
  });

  it('names each section when a report has several', () => {
    const many = report([
      section({ id: 'a', title: 'B2C small', columns, rows: [] }),
      section({ id: 'b', title: 'HSN summary', columns, rows: [] }),
    ]);
    const text = reportCsv(many);
    expect(text).toContain('B2C small\r\nBill No.');
    expect(text).toContain('\r\n\r\nHSN summary\r\n');
  });
});

describe('Excel', () => {
  const slab = slabBills({
    type: 'PURCHASE',
    gst: 'ALL',
    sales: [],
    purchases: [
      {
        id: '1',
        kind: 'PURCHASE_BILL',
        number: 'SUP/101',
        day: '2026-10-05',
        entryAt: '2026-10-05T06:30:00.000Z',
        distributor: 'Linae Distributors',
        gstin: '36ABCDE1234F1Z5',
        billAmount: 22413.88,
        lines: [
          purchaseLine({
            productName: 'x',
            hsnCode: '3004',
            packUnitType: 'STRIP',
            quantityPurchased: 1,
            taxableAmount: 21345.6,
            cgstPercent: 2.5,
            sgstPercent: 2.5,
            igstPercent: 0,
          }),
        ],
      },
    ],
  });

  it('carries the slab structure: merged group headings, sub-headings, totals, then rows, with Indian digit grouping', () => {
    const book = XLSX.read(
      reportWorkbook(report([slab.section]), 'Linaé Clinic'),
      { type: 'buffer', cellStyles: true, cellNF: true },
    );
    const sheet = book.Sheets[book.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
    });
    expect(rows[0]).toEqual(['Sales Register']);
    const groupRow = rows[2] as unknown[];
    expect(groupRow.filter(Boolean)).toEqual([
      'CESS',
      '0%',
      '5%',
      '12%',
      '18%',
      '28%',
      '40%',
      'Total',
    ]);
    expect((rows[3] as unknown[]).slice(0, 9)).toEqual([
      'Sr No.',
      'Bill No.',
      'Entry Date',
      'Bill Date',
      'Distributor',
      'Base',
      'SGST',
      'CGST',
      'IGST',
    ]);
    const header = rows[3] as string[];
    const totals = rows[4] as unknown[];
    const firstRow = rows[5] as unknown[];
    const fiveBase = header.indexOf('Base', 5 + 4 * 2); // CESS, 0%, then 5%
    expect(totals[fiveBase]).toBe(21345.6);
    expect(firstRow[1]).toBe('SUP/101');
    expect(sheet['!merges']!.length).toBe(8);
    const moneyCell = Object.entries(sheet).find(
      ([address, cell]) =>
        !address.startsWith('!') && (cell as XLSX.CellObject).v === 21345.6,
    )![1] as XLSX.CellObject;
    expect(moneyCell.z).toBe(INDIAN_MONEY_FORMAT);
  });

  it('writes one sheet per section with unique names', () => {
    const many = report([
      section({ id: 'a', title: 'Same name', columns, rows: [] }),
      section({ id: 'b', title: 'Same name', columns, rows: [] }),
    ]);
    const book = XLSX.read(reportWorkbook(many, 'Clinic'), { type: 'buffer' });
    expect(book.SheetNames).toEqual(['Same name', 'Same name 2']);
  });
});

describe('PDF', () => {
  const hasPdftotext = (() => {
    try {
      execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  it('produces a PDF', async () => {
    const pdf = await reportPdf(report(), 'Linaé Clinic');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  (hasPdftotext ? it : it.skip)(
    'prints the totals and every row, and repeats frozen columns on each column page of a wide report',
    async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'report-pdf-'));
      try {
        const wide = slabBills({
          type: 'PURCHASE',
          gst: 'ALL',
          sales: [],
          purchases: Array.from({ length: 3 }, (_, i) => ({
            id: String(i),
            kind: 'PURCHASE_BILL' as const,
            number: `SUP/${100 + i}`,
            day: '2026-10-05',
            entryAt: '2026-10-05T06:30:00.000Z',
            distributor: 'Linae Distributors',
            gstin: null,
            billAmount: 0,
            lines: [
              purchaseLine({
                productName: 'x',
                hsnCode: '3004',
                packUnitType: 'STRIP',
                quantityPurchased: 1,
                taxableAmount: 159656.74,
                cgstPercent: 9,
                sgstPercent: 9,
                igstPercent: 0,
              }),
            ],
          })),
        });
        const file = path.join(dir, 'r.pdf');
        writeFileSync(
          file,
          await reportPdf(report([wide.section]), 'Linaé Clinic'),
        );
        const text = execFileSync('pdftotext', ['-layout', file, '-'], {
          encoding: 'utf8',
        });
        expect(text).toContain('4,78,970.22'); // 3 x 1,59,656.74 in the 18% Base total
        expect(text).toMatch(/columns 1 of [2-9]/);
        expect(text.match(/SUP\/100/g)!.length).toBeGreaterThan(1);
        expect(text).toContain('Drafts are excluded.');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});

describe('downloads', () => {
  it('names every format after the report and its period', async () => {
    for (const format of ['xlsx', 'csv', 'pdf'] as const) {
      const file = await reportFile(report(), format, 'Clinic');
      expect(file.fileName).toBe(
        `sales-register-2026-11-01-to-2026-11-30.${format}`,
      );
      expect(file.data.length).toBeGreaterThan(0);
    }
  });

  it('formats screen and PDF cells with Indian grouping and dd/mm/yyyy dates', () => {
    expect(displayCell(159656.74, 'money')).toBe('1,59,656.74');
    expect(displayCell('2026-11-03', 'date')).toBe('03/11/2026');
    expect(displayCell(null, 'money')).toBe('');
  });
});
