import {
  PurchaseDoc,
  ReportLine,
  SaleDoc,
  billLine,
  compositionReport,
  documentsIssued,
  doctorWiseSales,
  gstr1,
  gstr2a,
  gstr2b,
  gstr3b,
  hsnSummary,
  isGstin,
  placeOfSupply,
  purchaseLine,
  purchaseRegister,
  salesRegister,
  setOff,
  signedLine,
  slabBills,
  splitIntraState,
  workflowLine,
} from '../pharmacy-gst-reports';
import { columnTotals } from '../pharmacy-report-table';

const GSTIN = '36ABCDE1234F1Z5';
const OTHER_STATE_GSTIN = '27ABCDE1234F1Z5';

const bill = (
  overrides: Partial<SaleDoc> & { lines: ReportLine[] },
): SaleDoc => ({
  id: overrides.number ?? 'b',
  kind: 'BILL',
  number: 'PHI-2026-001',
  day: '2026-11-03',
  entryAt: '2026-11-03T05:00:00.000Z',
  customer: 'Meera Shah',
  mobile: '9876543210',
  doctor: 'Dr. Praneeta Jain',
  ...overrides,
});

const sale = (
  unitPrice: number,
  quantity: number,
  discountPercent: number,
  rate: number,
  extra: Partial<Parameters<typeof billLine>[0]> = {},
) => {
  const gross = quantity * unitPrice;
  const discountAmount = (gross * discountPercent) / 100;
  const taxAmount = ((gross - discountAmount) * rate) / 100;
  return billLine({
    name: 'Adapalene Gel 15 Gm',
    hsn: '30049099',
    unit: 'TUBE',
    quantity,
    unitPrice,
    discountAmount,
    taxPercent: rate,
    taxAmount,
    totalAmount: gross - discountAmount + taxAmount,
    ...extra,
  });
};

const purchase = (
  overrides: Partial<PurchaseDoc> & { lines: ReportLine[] },
): PurchaseDoc => ({
  id: overrides.number ?? 'p',
  kind: 'PURCHASE_BILL',
  number: 'SUP/101',
  day: '2026-10-05',
  entryAt: '2026-10-05T06:30:00.000Z',
  distributor: 'Linae Distributors',
  gstin: GSTIN,
  billAmount: overrides.lines.reduce((sum, line) => sum + line.total, 0),
  ...overrides,
});

const intra = (taxableAmount: number, rate: number) =>
  purchaseLine({
    productName: 'Isotroin 10 Capsule',
    hsnCode: '30049099',
    packUnitType: 'STRIP',
    quantityPurchased: 10,
    taxableAmount,
    cgstPercent: rate / 2,
    sgstPercent: rate / 2,
    igstPercent: 0,
  });
const inter = (taxableAmount: number, rate: number) =>
  purchaseLine({
    productName: 'Sunscreen SPF 50',
    hsnCode: '33049910',
    packUnitType: 'BOTTLE',
    quantityPurchased: 5,
    taxableAmount,
    cgstPercent: 0,
    sgstPercent: 0,
    igstPercent: rate,
  });

describe('line normalisation', () => {
  it('splits intra-state tax evenly, rounding CGST half up as the Day-wise Summary does, so the halves always sum to the tax', () => {
    expect(splitIntraState(10.01)).toEqual({ cgst: 5.01, sgst: 5, igst: 0 });
    expect(
      splitIntraState(10.01).cgst + splitIntraState(10.01).sgst,
    ).toBeCloseTo(10.01, 2);
  });

  it('derives Taxable = Gross - Disc. and Total = Taxable + tax for a bill line', () => {
    const line = sale(100, 3, 10, 12);
    expect(line).toMatchObject({
      gross: 300,
      discount: 30,
      taxable: 270,
      cgst: 16.2,
      sgst: 16.2,
      igst: 0,
      total: 302.4,
    });
  });

  it('taxes a bill line on its value after the bill discount, so taxable + tax is the stored line total', () => {
    // 1000 at 12% with a 10% bill discount: the line's share of the bill discount is 100.
    const line = billLine({
      name: 'Isotroin 10 Capsule',
      hsn: '30049099',
      unit: 'STRIP',
      quantity: 1,
      unitPrice: 1000,
      discountAmount: 0,
      billDiscountAmount: 100,
      taxPercent: 12,
      taxAmount: 108,
      totalAmount: 1008,
    });
    expect([line.gross, line.discount, line.taxable, line.cgst, line.sgst, line.total]).toEqual([1000, 100, 900, 54, 54, 1008]);
  });

  it('never shows a negative discount on a refund priced from the original sale', () => {
    const line = workflowLine({
      name: 'x',
      hsn: null,
      unit: null,
      quantity: 1,
      unitPrice: 90,
      taxable: 100,
      tax: 12,
      gstRate: 12,
    });
    expect(line.gross).toBe(100);
    expect(line.discount).toBe(0);
  });

  it('flips every amount of a return', () => {
    const line = signedLine(sale(100, 1, 0, 5), -1);
    expect(line).toMatchObject({
      quantity: -1,
      gross: -100,
      taxable: -100,
      cgst: -2.5,
      sgst: -2.5,
      total: -105,
    });
  });
});

describe('CR-33b Sales Register', () => {
  const docs: SaleDoc[] = [
    bill({ id: 'a', number: 'PHI-2026-001', lines: [sale(100, 2, 0, 12)] }),
    bill({
      id: 'b',
      number: 'PHI-2026-002',
      customer: 'Ravi Kumar',
      mobile: '9000000001',
      lines: [sale(250, 1, 10, 18), sale(40, 5, 0, 0)],
    }),
    {
      ...bill({
        id: 'c',
        number: 'RET-1',
        lines: [signedLine(sale(100, 1, 0, 12), -1)],
      }),
      kind: 'SALES_RETURN',
    },
  ];

  it('lists one row per bill with the flat money columns in the reference order', () => {
    const { section } = salesRegister(docs, { type: 'SALES' });
    expect(section.columns.map((c) => c.label)).toEqual([
      'Bill No.',
      'Bill Date',
      'Customer',
      'Mobile',
      'Gross',
      'Disc.',
      'Taxable',
      'CESS',
      'SGST',
      'CGST',
      'IGST',
      'Total',
    ]);
    expect(section.rows.map((r) => r.cells.billNo)).toEqual([
      'PHI-2026-001',
      'PHI-2026-002',
    ]);
  });

  it('reconciles every row and the totals: Taxable = Gross - Disc. and Total = Taxable + taxes, Total matches the headline', () => {
    const { section, total } = salesRegister(docs, { type: 'ALL' });
    for (const cells of [
      ...section.rows.map((r) => r.cells),
      section.totals!,
    ]) {
      const n = (k: string) => Number(cells[k]);
      expect(n('taxable')).toBeCloseTo(n('gross') - n('discount'), 2);
      expect(n('total')).toBeCloseTo(
        n('taxable') + n('cess') + n('sgst') + n('cgst') + n('igst'),
        2,
      );
    }
    expect(total).toBe(section.totals!.total);
    expect(section.totals).toEqual(columnTotals(section.columns, section.rows));
  });

  it('shows returns as negative rows and nets them in ALL', () => {
    const all = salesRegister(docs, { type: 'ALL' });
    const sales = salesRegister(docs, { type: 'SALES' });
    const returns = salesRegister(docs, { type: 'RETURNS' });
    expect(returns.section.rows[0].cells.billNo).toBe('RET-1 (return)');
    expect(returns.total).toBe(-112);
    expect(all.total).toBeCloseTo(sales.total + returns.total, 2);
  });

  it('filters by customer name and recalculates the totals, so one patient’s month reads off directly', () => {
    const { section, total } = salesRegister(docs, {
      type: 'SALES',
      search: 'ravi',
    });
    expect(section.rows).toHaveLength(1);
    expect(total).toBe(Number(section.rows[0].cells.total));
    expect(
      salesRegister(docs, { type: 'SALES', search: '9000000001' }).section.rows,
    ).toHaveLength(1);
  });
});

describe('CR-33a Purchase Bills (slab bands)', () => {
  // The clinic's worked example: 5% Base 27,317.10 SGST 533.64 CGST 533.64 IGST 298.58; 18% Base 1,59,656.74
  // SGST 14,369.11 CGST 14,369.11; grand total Base 1,86,973.84 SGST 14,902.75 CGST 14,902.75 IGST 298.58.
  const purchases: PurchaseDoc[] = [
    purchase({ id: 'p1', number: 'SUP/101', lines: [intra(21345.6, 5)] }),
    purchase({
      id: 'p2',
      number: 'MH/88',
      gstin: OTHER_STATE_GSTIN,
      distributor: 'Mumbai Pharma',
      lines: [inter(5971.5, 5)],
    }),
    purchase({ id: 'p3', number: 'SUP/102', lines: [intra(159656.74, 18)] }),
  ];
  const { section, rates, total } = slabBills({
    type: 'PURCHASE',
    gst: 'ALL',
    sales: [],
    purchases,
  });

  it('reproduces the reference totals row under the header', () => {
    const t = section.totals!;
    expect([t['r5.taxable'], t['r5.sgst'], t['r5.cgst'], t['r5.igst']]).toEqual(
      [27317.1, 533.64, 533.64, 298.58],
    );
    expect([
      t['r18.taxable'],
      t['r18.sgst'],
      t['r18.cgst'],
      t['r18.igst'],
    ]).toEqual([159656.74, 14369.11, 14369.11, 0]);
    expect([
      t['total.taxable'],
      t['total.sgst'],
      t['total.cgst'],
      t['total.igst'],
    ]).toEqual([186973.84, 14902.75, 14902.75, 298.58]);
    expect(total).toBe(t['total.amount']);
  });

  it('lays out frozen columns then CESS, every standard slab and Total, each Base / SGST / CGST / IGST', () => {
    expect(rates).toEqual([0, 5, 12, 18, 28, 40]);
    expect(section.columns.filter((c) => c.frozen).map((c) => c.label)).toEqual(
      ['Sr No.', 'Bill No.', 'Entry Date', 'Bill Date', 'Distributor'],
    );
    const groups = [
      ...new Set(section.columns.filter((c) => c.group).map((c) => c.group)),
    ];
    expect(groups).toEqual([
      'CESS',
      '0%',
      '5%',
      '12%',
      '18%',
      '28%',
      '40%',
      'Total',
    ]);
    expect(
      section.columns.filter((c) => c.group === '12%').map((c) => c.label),
    ).toEqual(['Base', 'SGST', 'CGST', 'IGST']);
  });

  it('puts each bill in its own slab with zeros elsewhere, and its Total band equals the sum of its slabs', () => {
    const row = section.rows.find((r) => r.cells.billNo === 'SUP/101')!.cells;
    expect(row['r5.taxable']).toBe(21345.6);
    expect(row['r18.taxable']).toBe(0);
    for (const r of section.rows) {
      const sumOf = (field: string) =>
        rates.reduce((s, rate) => s + Number(r.cells[`r${rate}.${field}`]), 0);
      for (const field of ['taxable', 'sgst', 'cgst', 'igst'])
        expect(Number(r.cells[`total.${field}`])).toBeCloseTo(sumOf(field), 2);
    }
  });

  it('adds a column for a rate outside the standard list, since rates change', () => {
    const odd = slabBills({
      type: 'PURCHASE',
      gst: 'ALL',
      sales: [],
      purchases: [purchase({ lines: [intra(100, 3)] })],
    });
    expect(odd.rates).toContain(3);
  });

  it('filters bills with and without GST', () => {
    const mixed = [
      ...purchases,
      purchase({ id: 'p0', number: 'NIL/1', lines: [intra(500, 0)] }),
    ];
    expect(
      slabBills({
        type: 'PURCHASE',
        gst: 'WITHOUT_GST',
        sales: [],
        purchases: mixed,
      }).section.rows.map((r) => r.cells.billNo),
    ).toEqual(['NIL/1']);
    expect(
      slabBills({
        type: 'PURCHASE',
        gst: 'WITH_GST',
        sales: [],
        purchases: mixed,
      }).section.rows,
    ).toHaveLength(3);
  });

  it('serves the sales side as Sales Bills with a Customer column', () => {
    const sales = slabBills({
      type: 'SALES',
      gst: 'ALL',
      sales: [bill({ lines: [sale(100, 1, 0, 12)] })],
      purchases: [],
    });
    expect(sales.section.title).toBe('Sales Bills');
    expect(sales.section.columns.find((c) => c.key === 'party')!.label).toBe(
      'Customer',
    );
    expect(sales.total).toBe(112);
  });
});

describe('Purchase Register', () => {
  it('shows TCS and rounding as Other so the Bill Amount matches the supplier bill', () => {
    const { section } = purchaseRegister([
      purchase({ lines: [intra(1000, 12)], billAmount: 1121 }),
    ]);
    expect(section.rows[0].cells).toMatchObject({
      taxable: 1000,
      cgst: 60,
      sgst: 60,
      tax: 120,
      other: 1,
      billAmount: 1121,
    });
  });
});

describe('HSN wise GST', () => {
  it('groups by HSN and rate, and lists missing HSN codes last as a warning', () => {
    const lines = [
      sale(100, 2, 0, 12),
      sale(50, 1, 0, 12, { name: 'Tretinoin Cream' }),
      sale(80, 1, 0, 18, { hsn: null, name: 'Serum' }),
    ];
    const { section, missingHsnGroups } = hsnSummary(lines);
    expect(section.rows.map((r) => r.cells.hsn)).toEqual([
      '30049099',
      'Not recorded',
    ]);
    expect(section.rows[0].cells).toMatchObject({
      quantity: 3,
      taxable: 250,
      cgst: 15,
      sgst: 15,
      value: 280,
    });
    expect(missingHsnGroups).toBe(1);
    expect(section.rows[1].tone).toBe('warning');
  });
});

describe('GSTR-1', () => {
  it('reports every sale as B2C small, rate-wise and net of returns, at the clinic’s place of supply', () => {
    const docs: SaleDoc[] = [
      bill({ lines: [sale(100, 2, 0, 12), sale(100, 1, 0, 18)] }),
      {
        ...bill({
          id: 'r',
          number: 'RET-1',
          lines: [signedLine(sale(100, 1, 0, 12), -1)],
        }),
        kind: 'SALES_RETURN',
      },
    ];
    const result = gstr1({
      sales: docs,
      cancelledBillNumbers: [],
      place: placeOfSupply(GSTIN),
    });
    const b2cs = result.sections[0];
    expect(
      b2cs.rows.map((r) => [r.cells.place, r.cells.rate, r.cells.taxable]),
    ).toEqual([
      ['36-Telangana', 12, 100],
      ['36-Telangana', 18, 100],
    ]);
  });

  it('counts the bill series with the cancelled bills inside it (Table 13)', () => {
    const docs = [
      bill({ id: '1', number: 'PHI-2026-536', lines: [] }),
      bill({ id: '2', number: 'PHI-2026-540', lines: [] }),
    ];
    const docsIssued = documentsIssued({
      sales: docs,
      cancelledBillNumbers: ['PHI-2026-538'],
    });
    expect(docsIssued.rows[0].cells).toEqual({
      nature: 'Invoices for outward supply',
      from: 'PHI-2026-536',
      to: 'PHI-2026-540',
      total: 3,
      cancelled: 1,
      net: 2,
    });
  });
});

describe('GSTR-3B', () => {
  it('splits taxable and nil-rated supplies and sets output tax off against ITC', () => {
    const result = gstr3b({
      sales: [bill({ lines: [sale(1000, 1, 0, 12), sale(200, 1, 0, 0)] })],
      purchases: [
        purchase({ lines: [intra(500, 12)] }),
        purchase({
          id: 'x',
          number: 'NOGST',
          gstin: null,
          lines: [intra(100, 12)],
        }),
      ],
    });
    const rows = Object.fromEntries(
      result.sections[0].rows.map((r) => [r.key, r.cells]),
    );
    expect(rows['3.1a']).toMatchObject({ taxable: 1000, cgst: 60, sgst: 60 });
    expect(rows['3.1c']).toMatchObject({ taxable: 200 });
    expect(rows['4a5']).toMatchObject({ cgst: 30, sgst: 30 });
    expect(rows['4d']).toMatchObject({ cgst: 6, sgst: 6 });
    expect(result.setOff.cash).toEqual({
      igst: 0,
      cgst: 30,
      sgst: 30,
      cess: 0,
    });
    expect(result.blockedDocuments).toBe(1);
  });
});

describe('credit set-off (rule 88A)', () => {
  it('steers IGST credit to SGST when CGST credit can pay CGST, so no cash is paid', () => {
    const result = setOff(
      { igst: 0, cgst: 100, sgst: 100, cess: 0 },
      { igst: 100, cgst: 100, sgst: 0, cess: 0 },
    );
    expect(result.cash).toEqual({ igst: 0, cgst: 0, sgst: 0, cess: 0 });
    expect(result.utilised.igst).toMatchObject({ sgst: 100, cgst: 0 });
    expect(result.utilised.cgst).toMatchObject({ cgst: 100 });
  });

  it('exhausts IGST credit before touching CGST credit', () => {
    const result = setOff(
      { igst: 0, cgst: 100, sgst: 0, cess: 0 },
      { igst: 60, cgst: 100, sgst: 0, cess: 0 },
    );
    expect(result.utilised.igst.cgst).toBe(60);
    expect(result.utilised.cgst.cgst).toBe(40);
    expect(result.carriedForward).toEqual({
      igst: 0,
      cgst: 60,
      sgst: 0,
      cess: 0,
    });
  });

  it('never uses CGST credit for SGST', () => {
    const result = setOff(
      { igst: 0, cgst: 0, sgst: 100, cess: 0 },
      { igst: 0, cgst: 100, sgst: 0, cess: 0 },
    );
    expect(result.cash.sgst).toBe(100);
    expect(result.carriedForward.cgst).toBe(100);
  });

  it('balances every head on random inputs: paid by credit + cash = liability, credit used + carried = credit', () => {
    let seed = 7;
    const rnd = () =>
      ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 1000;
    for (let i = 0; i < 2000; i++) {
      const L = {
        igst: Math.round(rnd() * 100) / 100,
        cgst: Math.round(rnd() * 100) / 100,
        sgst: Math.round(rnd() * 100) / 100,
        cess: 0,
      };
      const C = {
        igst: Math.round(rnd() * 100) / 100,
        cgst: Math.round(rnd() * 100) / 100,
        sgst: Math.round(rnd() * 100) / 100,
        cess: 0,
      };
      const r = setOff(L, C);
      for (const head of ['igst', 'cgst', 'sgst'] as const) {
        expect(r.paidByCredit[head] + r.cash[head]).toBeCloseTo(L[head], 2);
        const used =
          r.utilised[head].igst +
          r.utilised[head].cgst +
          r.utilised[head].sgst +
          r.utilised[head].cess;
        expect(used + r.carriedForward[head]).toBeCloseTo(C[head], 2);
      }
      expect(r.utilised.cgst.sgst).toBe(0);
      expect(r.utilised.sgst.cgst).toBe(0);
    }
  });
});

describe('GSTR-2A / 2B as per books', () => {
  const docs: PurchaseDoc[] = [
    purchase({ id: '1', lines: [intra(1000, 12), intra(500, 5)] }),
    purchase({
      id: '2',
      number: 'X1',
      gstin: 'BADGSTIN',
      distributor: 'Unregistered Store',
      lines: [intra(100, 12)],
    }),
    {
      ...purchase({
        id: '3',
        number: 'CN-9',
        lines: [signedLine(intra(200, 12), -1)],
      }),
      kind: 'CREDIT_NOTE',
    },
  ];

  it('lists one row per invoice and rate, with credit notes in their own section', () => {
    const { sections } = gstr2a(docs);
    expect(sections[0].rows.map((r) => [r.cells.number, r.cells.rate])).toEqual(
      [
        ['SUP/101', 5],
        ['SUP/101', 12],
        ['X1', 12],
      ],
    );
    expect(sections[1].rows[0].cells).toMatchObject({
      number: 'CN-9',
      taxable: -200,
    });
  });

  it('sums ITC per supplier and marks a missing or invalid GSTIN as not claimable', () => {
    const rows = gstr2b(docs).sections[0].rows;
    const linae = rows.find((r) => r.cells.supplier === 'Linae Distributors')!;
    expect(linae.cells).toMatchObject({
      documents: 2,
      taxable: 1300,
      itc: 121,
    });
    expect(
      rows.find((r) => r.cells.supplier === 'Unregistered Store')!.tone,
    ).toBe('warning');
    expect(isGstin(GSTIN)).toBe(true);
    expect(isGstin('BADGSTIN')).toBe(false);
  });
});

describe('Composition and doctor-wise', () => {
  it('charges the composition rate on monthly turnover, split evenly into CGST and SGST', () => {
    const { section, total } = compositionReport({
      sales: [
        bill({ lines: [sale(1000, 1, 0, 12)] }),
        bill({ id: 'n', day: '2026-12-02', lines: [sale(500, 1, 0, 0)] }),
      ],
      ratePercent: 1,
    });
    expect(
      section.rows.map((r) => [
        r.cells.month,
        r.cells.turnover,
        r.cells.cgst,
        r.cells.sgst,
      ]),
    ).toEqual([
      ['2026-11', 1000, 5, 5],
      ['2026-12', 500, 2.5, 2.5],
    ]);
    expect(total).toBe(15);
  });

  it('ranks doctors by sales with unattributed sales last, and shares sum to 100', () => {
    const { section } = doctorWiseSales([
      bill({ id: '1', doctor: 'Dr. A', lines: [sale(100, 1, 0, 0)] }),
      bill({ id: '2', doctor: 'Dr. B', lines: [sale(300, 1, 0, 0)] }),
      bill({ id: '3', doctor: null, lines: [sale(600, 1, 0, 0)] }),
    ]);
    expect(section.rows.map((r) => r.cells.doctor)).toEqual([
      'Dr. B',
      'Dr. A',
      'No doctor recorded',
    ]);
    expect(
      section.rows.reduce((s, r) => s + Number(r.cells.share), 0),
    ).toBeCloseTo(100, 1);
  });
});
