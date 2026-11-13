import { PrismaClient } from '@prisma/client';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import { PharmacyComplianceService } from '../pharmacy-compliance.service';
import { PharmacyReportsService } from '../pharmacy-reports.service';
import type { PharmacyReportQueryDto } from '../dto/pharmacy-reports.dto';

const databaseTests = process.env.PHARMACY_REPORTS_TEST_DATABASE_URL
  ? describe
  : describe.skip;

/**
 * CR-33 Pharmacy Report against a real PostgreSQL schema: the clinic-day boundary in Asia/Kolkata,
 * posted-only scope, branch isolation, the cash-count sequence under a race, the downloads, and the
 * migration applied twice onto a schema that did not have the table.
 */
databaseTests('Pharmacy Report on PostgreSQL', () => {
  const schema = `pharmacy_reports_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let fixtures: string;
  let created = false;
  let reports: PharmacyReportsService;
  const actor = { branchId: 'branch', id: 'asha', role: 'PHARMACIST' };
  const q = (
    from: string,
    to = from,
    extra: Partial<PharmacyReportQueryDto> = {},
  ) => ({ from, to, ...extra }) as PharmacyReportQueryDto;

  beforeAll(async () => {
    const url = new URL(process.env.PHARMACY_REPORTS_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Database tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    fixtures = mkdtempSync(path.join(tmpdir(), 'pharmacy-reports-'));
    const before = readFileSync(path.resolve('prisma/schema.prisma'), 'utf8')
      .replace(
        /\/\/\/[^\n]*\n\/\/\/[^\n]*\nmodel PharmacyCashCount \{[\s\S]*?\n\}\n/,
        '',
      )
      .replace(/^\s*pharmacyCashCounts\s.*\n/m, '');
    expect(before).not.toContain('PharmacyCashCount');
    writeFileSync(path.join(fixtures, 'before.prisma'), before);
    const prisma = (...args: string[]) =>
      execFileSync(
        process.execPath,
        [require.resolve('prisma/build/index.js'), ...args],
        {
          stdio: 'pipe',
          env: {
            ...process.env,
            DATABASE_URL: url.toString(),
            PRISMA_GENERATE_SKIP_AUTOINSTALL: '1',
          },
        },
      );
    prisma(
      'db',
      'push',
      '--skip-generate',
      '--schema',
      path.join(fixtures, 'before.prisma'),
    );
    for (let run = 0; run < 2; run++)
      prisma(
        'db',
        'execute',
        '--url',
        url.toString(),
        '--file',
        path.resolve(
          'prisma/migrations/20261109150000_pharmacy_cash_counts/migration.sql',
        ),
      );
    db = new PrismaClient({ datasourceUrl: url.toString() });

    await db.branch.create({
      data: {
        id: 'branch',
        name: 'Linaé Skin Clinic',
        address: 'Synthetic',
        state: 'Telangana',
        gstNumber: '36ABCDE1234F1Z5',
      },
    });
    await db.branch.create({
      data: { id: 'other-branch', name: 'Other Clinic', address: 'Synthetic' },
    });
    await db.user.create({
      data: {
        id: 'asha',
        firstName: 'Asha',
        lastName: 'Rao',
        email: 'asha@example.test',
        password: 'x',
        role: 'PHARMACIST',
        branchId: 'branch',
      },
    });
    await db.user.create({
      data: {
        id: 'doc',
        firstName: 'Praneeta',
        lastName: 'Jain',
        email: 'doc@example.test',
        password: 'x',
        role: 'DOCTOR',
        branchId: 'branch',
      },
    });
    for (const branchId of ['branch', 'other-branch'])
      await db.patient.create({
        data: {
          id: `patient-${branchId}`,
          name: 'Meera Shah',
          gender: 'F',
          phone: '9876543210',
          branchId,
        },
      });
    await db.drug.create({
      data: {
        id: 'drug',
        name: 'Adapalene Gel 15 Gm',
        price: 100,
        manufacturerName: 'Synthetic',
        packSizeLabel: '15 gm',
        branchId: 'branch',
      },
    });
    await db.inventoryItem.create({
      data: {
        id: 'batch',
        branchId: 'branch',
        name: 'Adapalene Gel 15 Gm',
        type: 'MEDICINE',
        costPrice: 60,
        sellingPrice: 100,
        unit: 'TUBES',
        currentStock: 10,
        stockStatus: 'IN_STOCK',
        hsnCode: '30049099',
        gstRate: 12,
        expiryDate: new Date('2099-01-01'),
      },
    });

    // 2 x 100 at 12%: taxable 200, GST 24, total 224.
    const line = {
      drugId: 'drug',
      inventoryItemId: 'batch',
      quantity: 2,
      unitPrice: 100,
      discountAmount: 0,
      taxPercent: 12,
      taxAmount: 24,
      totalAmount: 224,
    };
    const invoice = async (
      id: string,
      status: any,
      invoiceDate: string,
      payments: { method: any; amount: number; paymentDate: string }[],
      branchId = 'branch',
      total = 224,
    ) =>
      db.pharmacyInvoice.create({
        data: {
          id,
          invoiceNumber: id,
          patientId: `patient-${branchId}`,
          doctorId: branchId === 'branch' ? 'doc' : undefined,
          branchId,
          subtotal: 200,
          taxAmount: 24,
          totalAmount: total,
          paymentMethod: 'CASH',
          billingName: 'Meera Shah',
          billingPhone: '9876543210',
          status,
          invoiceDate: new Date(invoiceDate),
          createdAt: new Date(invoiceDate),
          items: {
            create: [
              {
                ...line,
                ...(branchId === 'branch'
                  ? {}
                  : { inventoryItemId: null, drugId: null, itemType: 'DRUG' }),
                totalAmount: total,
              },
            ],
          },
          payments: {
            create: payments.map((p) => ({
              ...p,
              status: 'COMPLETED' as const,
              paymentDate: new Date(p.paymentDate),
            })),
          },
        },
      });
    await invoice('PHI-2026-536', 'CONFIRMED', '2026-11-05T05:00:00Z', [
      { method: 'CASH', amount: 224, paymentDate: '2026-11-05T05:01:00Z' },
    ]);
    await invoice('PHI-2026-537', 'CANCELLED', '2026-11-05T06:00:00Z', []);
    // 00:10 on 6 Nov in Asia/Kolkata, though still 5 Nov in UTC.
    await invoice('PHI-2026-538', 'CONFIRMED', '2026-11-05T18:40:00Z', [
      { method: 'CARD', amount: 224, paymentDate: '2026-11-05T18:41:00Z' },
    ]);
    await invoice('PHI-2026-530', 'COMPLETED', '2026-11-03T05:00:00Z', [
      { method: 'UPI', amount: 224, paymentDate: '2026-11-05T09:00:00Z' },
    ]);
    await invoice('PHI-2026-539', 'DRAFT', '2026-11-05T07:00:00Z', []);
    await invoice(
      'OTHER-1',
      'CONFIRMED',
      '2026-11-05T05:00:00Z',
      [{ method: 'CASH', amount: 999, paymentDate: '2026-11-05T05:00:00Z' }],
      'other-branch',
      999,
    );

    const wfLine = {
      inventoryId: 'batch',
      name: 'Adapalene Gel 15 Gm',
      unit: 'TUBES',
      quantity: 1,
      unitPrice: 100,
      taxable: 100,
      tax: 12,
      total: 112,
      gstRate: 12,
    };
    const workflow = (
      id: string,
      kind: string,
      status: string,
      payload: object,
      extra: object = {},
    ) =>
      db.inventoryWorkflowDocument.create({
        data: {
          id,
          branchId: 'branch',
          kind,
          status,
          reference: id,
          payload: { lines: [wfLine], ...payload },
          totalAmount: 112,
          requestKey: id,
          createdBy: 'asha',
          createdAt: new Date('2026-11-05T08:00:00Z'),
          ...extra,
        },
      });
    await workflow('CS-1', 'COUNTER_SALE', 'POSTED', {
      date: '2026-11-05',
      paymentMode: 'CARD',
      customerName: 'Walk-in',
      doctorName: 'Dr. Visiting',
    });
    await workflow('CS-DRAFT', 'COUNTER_SALE', 'DRAFT', {
      date: '2026-11-05',
      paymentMode: 'CASH',
    });
    await workflow('RET-1', 'SALES_RETURN', 'POSTED', {
      date: '2026-11-05',
      refundMode: 'CASH',
      customerName: 'Meera Shah',
    });
    await workflow(
      'SR-1',
      'SUPPLIER_RETURN',
      'POSTED',
      { date: '2026-11-05' },
      { supplierGstin: '36AAAAA0000A1Z5' },
    );

    const purchase = (id: string, status: any) =>
      db.pharmacyPurchaseInvoice.create({
        data: {
          id,
          branchId: 'branch',
          distributorName: 'Sri Sai Pharma',
          distributorGstin: '36AAAAA0000A1Z5',
          distributorDlNo: 'DL',
          invoiceNumber: id,
          invoiceDate: new Date('2026-11-05T04:00:00Z'),
          createdAt: new Date('2026-11-05T04:30:00Z'),
          billType: 'CREDIT',
          doctorNameOrRegNo: 'x',
          status,
          grossAmount: 1000,
          taxableAmount: 1000,
          totalGst: 120,
          netPayable: 1120.4,
          items: {
            create: [
              {
                lineNumber: 1,
                productName: 'Adapalene Gel 15 Gm',
                manufacturer: 'Synthetic',
                packSize: '15',
                packUnitType: 'TUBE',
                hsnCode: '30049099',
                batchNumber: 'B1',
                expiryMonth: 1,
                expiryYear: 2099,
                quantityPurchased: 20,
                mrp: 150,
                discountPercent: 0,
                purchaseRate: 50,
                taxableAmount: 1000,
                cgstPercent: 6,
                sgstPercent: 6,
                gstAmount: 120,
                lineTotal: 1120,
              },
            ],
          },
        },
      });
    await purchase('SUP-101', 'STOCK_COMMITTED');
    await purchase('SUP-DRAFT', 'DRAFT');

    reports = new PharmacyReportsService(
      db as any,
      new PharmacyComplianceService(db as any),
    );
  }, 120_000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created)
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
    if (fixtures) rmSync(fixtures, { recursive: true, force: true });
  });

  const rowsOf = (report: any, sectionId?: string) =>
    (sectionId
      ? report.sections.find((s: any) => s.id === sectionId)
      : report.sections[0]
    ).rows.map((r: any) => r.cells);

  it('lists posted bills and counter sales of the clinic day only, from this branch only', async () => {
    const report = await reports.report(
      'sales-register',
      q('2026-11-05'),
      actor,
    );
    expect(rowsOf(report).map((r: any) => r.billNo)).toEqual([
      'PHI-2026-536',
      'CS-1',
    ]);
    expect(report.headline!.value).toBe(336);
    const next = await reports.report('sales-register', q('2026-11-06'), actor);
    expect(rowsOf(next).map((r: any) => r.billNo)).toEqual(['PHI-2026-538']);
  });

  it('nets the customer return when asked for all documents', async () => {
    const report = await reports.report(
      'sales-register',
      q('2026-11-05', '2026-11-05', { type: 'ALL' }),
      actor,
    );
    expect(rowsOf(report).map((r: any) => [r.billNo, r.total])).toEqual([
      ['PHI-2026-536', 224],
      ['CS-1', 112],
      ['RET-1 (return)', -112],
    ]);
    expect(report.headline!.value).toBe(224);
  });

  it('applies the Sales Register filters to the rows, the headline, the note and keeps the doctor choices of the whole period', async () => {
    const report = await reports.report(
      'sales-register',
      q('2026-11-05', '2026-11-05', { source: 'COUNTER_SALE' }),
      actor,
    );
    expect(rowsOf(report).map((r: any) => r.billNo)).toEqual(['CS-1']);
    expect(report.headline!.value).toBe(112);
    expect(report.notes[0]).toBe('Showing only: counter sales.');
    expect(report.filterChoices!.doctor).toEqual(['Dr. Visiting', 'Praneeta Jain']);
  });

  it('builds Purchase Bills and the Purchase Register from stock-committed bills, with supplier returns negative', async () => {
    const bills = await reports.report(
      'purchase-bills',
      q('2026-11-01', '2026-11-30'),
      actor,
    );
    expect(
      rowsOf(bills).map((r: any) => [
        r.billNo,
        r['r12.taxable'],
        r['r12.cgst'],
      ]),
    ).toEqual([
      ['SUP-101', 1000, 60],
      ['SR-1 (supplier return)', -100, -6],
    ]);
    const register = await reports.report(
      'purchase-register',
      q('2026-11-01', '2026-11-30'),
      actor,
    );
    expect(rowsOf(register)[0]).toMatchObject({
      billNo: 'SUP-101',
      taxable: 1000,
      tax: 120,
      other: 0.4,
      billAmount: 1120.4,
    });
  });

  it('reports GSTR-1 as B2C at the clinic’s state, with HSN and the cancelled bill in Table 13', async () => {
    const report = await reports.report('gstr-1', q('2026-11-05'), actor);
    expect(rowsOf(report, 'b2cs')).toEqual([
      {
        type: 'OE',
        place: '36-Telangana',
        rate: 12,
        taxable: 200,
        cgst: 12,
        sgst: 12,
        cess: 0,
      },
    ]);
    expect(rowsOf(report, 'hsn')[0]).toMatchObject({
      hsn: '30049099',
      quantity: 2,
      taxable: 200,
    });
    expect(rowsOf(report, 'docs')).toEqual(
      expect.arrayContaining([
        {
          nature: 'Invoices for outward supply',
          from: 'PHI-2026-536',
          to: 'PHI-2026-537',
          total: 2,
          cancelled: 1,
          net: 1,
        },
      ]),
    );
  });

  it('sets GSTR-3B output tax off against ITC from the supplier bills', async () => {
    const report: any = await reports.report('gstr-3b', q('2026-11-05'), actor);
    const outward = Object.fromEntries(
      report.sections[0].rows.map((r: any) => [r.key, r.cells]),
    );
    expect(outward['3.1a']).toMatchObject({ taxable: 200, cgst: 12, sgst: 12 });
    expect(outward['4a5']).toMatchObject({ cgst: 54, sgst: 54 });
    const payment = Object.fromEntries(
      report.sections[1].rows.map((r: any) => [r.key, r.cells]),
    );
    expect(payment.cash).toMatchObject({ cgst: 0, sgst: 0 });
    expect(payment.carry).toMatchObject({ cgst: 42, sgst: 42 });
  });

  it('reconciles the day’s collection by mode across bills, earlier bills, counter sales and refunds', async () => {
    const report = await reports.dailyCollection('2026-11-05', actor);
    const modes = Object.fromEntries(
      report.collection.modes.map((m) => [m.mode, m]),
    );
    expect(modes.CASH).toMatchObject({
      onTodaysBills: 224,
      refunds: 112,
      expected: 112,
    });
    expect(modes.UPI).toMatchObject({ onEarlierBills: 224, expected: 224 });
    // The card payment at 00:11 on 6 Nov belongs to the next clinic day.
    expect(modes.CARD).toMatchObject({
      onTodaysBills: 0,
      counterSales: 112,
      expected: 112,
    });
    expect(report.collection.billing).toMatchObject({
      billCount: 1,
      billed: 224,
      counterSales: 112,
      dueAtDayEnd: 0,
    });
    expect(report.collection.status).toBe('NOT_COUNTED');
    expect(report.canRecordCount).toBe(true);
  });

  it('adds the clinic’s consultation and procedure takings and the whole day for a doctor, and not for a pharmacist', async () => {
    const clinicBill = (id: string, branchId: string, createdAt: string, total: number, payments: [string, number, string][], status = 'DRAFT') =>
      db.newInvoice.create({
        data: {
          id, invoiceNo: id, branchId, patientId: `patient-${branchId}`, total, balance: total, status, createdAt: new Date(createdAt),
          payments: { create: payments.map(([mode, amount, at]) => ({ mode: mode as any, amount, reconStatus: 'COMPLETED', createdAt: new Date(at) })) },
        },
      });
    await clinicBill('INV-C1', 'branch', '2026-11-05T04:00:00Z', 500, [['CASH', 500, '2026-11-05T04:05:00Z']]);
    await clinicBill('INV-C2', 'branch', '2026-11-05T05:00:00Z', 800, [['UPI', 300, '2026-11-05T05:05:00Z']]);
    await clinicBill('INV-C3', 'branch', '2026-11-04T05:00:00Z', 1000, [['CARD', 200, '2026-11-04T05:05:00Z'], ['CARD', 800, '2026-11-05T06:00:00Z']]);
    await clinicBill('INV-C4', 'branch', '2026-11-05T07:00:00Z', 900, [], 'CANCELLED');
    // 00:30 on 6 Nov in the clinic's time zone.
    await clinicBill('INV-C5', 'branch', '2026-11-05T19:00:00Z', 700, [['CASH', 700, '2026-11-05T19:00:00Z']]);
    await clinicBill('INV-O1', 'other-branch', '2026-11-05T04:00:00Z', 999, [['CASH', 999, '2026-11-05T04:00:00Z']]);

    const doctor = await reports.dailyCollection('2026-11-05', { branchId: 'branch', id: 'doc', role: 'DOCTOR' });
    expect(doctor.clinic!.modes.map((m) => [m.mode, m.net])).toEqual([['CASH', 500], ['UPI', 300], ['CARD', 800]]);
    expect([doctor.clinic!.billCount, doctor.clinic!.billed, doctor.clinic!.dueAtDayEnd, doctor.clinic!.net]).toEqual([2, 1300, 500, 1600]);
    expect(doctor.wholeDay!.modes.map((m) => [m.mode, m.clinic, m.pharmacy, m.total])).toEqual([
      ['CASH', 500, 112, 612],
      ['UPI', 300, 224, 524],
      ['CARD', 800, 112, 912],
    ]);
    expect([doctor.wholeDay!.total, doctor.headline]).toEqual([2048, { label: 'Whole day', value: 2048 }]);
    expect(doctor.sections.map((s) => s.id)).toEqual(['whole-day', 'clinic-modes', 'clinic-bills', 'modes', 'billing', 'documents']);
    expect(doctor.sections[2].rows.map((r) => r.cells.number)).toEqual(['INV-C3', 'INV-C1', 'INV-C2']);
    expect(doctor.collection.expectedTotal).toBe(448);

    const pharmacist = await reports.dailyCollection('2026-11-05', actor);
    expect([pharmacist.clinic, pharmacist.wholeDay, pharmacist.headline]).toEqual([null, null, { label: 'Pharmacy expected in hand', value: 448 }]);
    expect(pharmacist.sections.map((s) => s.id)).toEqual(['modes', 'billing', 'documents']);
  });

  it('takes a cash refund on Tuesday for Monday’s revised bill out of Tuesday’s expected cash', async () => {
    await db.pharmacyInvoice.create({
      data: {
        id: 'revised-bill',
        invoiceNumber: 'PHI-2026-600',
        patientId: 'patient-branch',
        branchId: 'branch',
        subtotal: 150,
        totalAmount: 150,
        paymentMethod: 'CASH',
        billingName: 'Meera Shah',
        billingPhone: '9876543210',
        status: 'CONFIRMED',
        invoiceDate: new Date('2026-11-09T05:00:00Z'),
        createdAt: new Date('2026-11-09T05:00:00Z'),
        payments: {
          create: [
            { requestKey: 'paid', method: 'CASH', amount: 200, status: 'COMPLETED', paymentDate: new Date('2026-11-09T05:01:00Z') },
            { requestKey: 'refund:back', method: 'CASH', amount: -50, status: 'REFUNDED', paymentDate: new Date('2026-11-10T06:00:00Z') },
          ],
        },
      },
    });
    const cash = async (day: string) => {
      const { collection } = await reports.dailyCollection(day, actor);
      const line = collection.modes.find((m) => m.mode === 'CASH')!;
      return [line.onTodaysBills, line.refunds, line.expected, collection.billing.paidAboveBill];
    };
    expect([await cash('2026-11-09'), await cash('2026-11-10')]).toEqual([
      [200, 0, 200, 50],
      [0, 50, -50, 0],
    ]);
  });

  it('reports a bill-discounted bill at the value the tax was charged on, in every GST report', async () => {
    // 1000 at 12% with a 10% bill discount: taxable 900, GST 108, total 1008.
    await db.pharmacyInvoice.create({
      data: {
        id: 'bill-discounted',
        invoiceNumber: 'PHI-2026-700',
        patientId: 'patient-branch',
        doctorId: 'doc',
        branchId: 'branch',
        subtotal: 1000,
        discountAmount: 100,
        billDiscountKind: 'PERCENT',
        billDiscountValue: 10,
        billDiscountAmount: 100,
        taxAmount: 108,
        totalAmount: 1008,
        paymentMethod: 'CASH',
        billingName: 'Meera Shah',
        billingPhone: '9876543210',
        status: 'CONFIRMED',
        invoiceDate: new Date('2026-11-12T05:00:00Z'),
        createdAt: new Date('2026-11-12T05:00:00Z'),
        items: {
          create: [
            {
              drugId: 'drug',
              inventoryItemId: 'batch',
              quantity: 1,
              unitPrice: 1000,
              discountAmount: 0,
              billDiscountAmount: 100,
              taxPercent: 12,
              taxAmount: 108,
              totalAmount: 1008,
            },
          ],
        },
      },
    });
    const day = q('2026-11-12');
    const one = async (id: any, sectionId?: string) => rowsOf(await reports.report(id, day, actor), sectionId)[0];
    const gstr3b: any = await reports.report('gstr-3b', day, actor);
    expect({
      register: await one('sales-register'),
      bills: await one('sales-bills'),
      b2cs: await one('gstr-1', 'b2cs'),
      hsn: await one('hsn-wise'),
      gstr3b: gstr3b.sections[0].rows.find((r: any) => r.key === '3.1a').cells,
      dayWise: await one('day-wise-summary'),
    }).toMatchObject({
      register: { billNo: 'PHI-2026-700', gross: 1000, discount: 100, taxable: 900, cgst: 54, sgst: 54, total: 1008 },
      bills: { 'r12.taxable': 900, 'r12.cgst': 54, 'r12.sgst': 54 },
      b2cs: { rate: 12, taxable: 900, cgst: 54, sgst: 54 },
      hsn: { hsn: '30049099', taxable: 900 },
      gstr3b: { taxable: 900, cgst: 54, sgst: 54 },
      dayWise: { 'r12.taxable': 900, 'r12.cgst': 54, 'total.amount': 1008 },
    });
  });

  it('leaves a cancelled draft, which never got a bill number, out of the Sales Register and GSTR-1 documents issued', async () => {
    const at = '2026-11-14T05:00:00Z';
    const base = {
      patientId: 'patient-branch',
      branchId: 'branch',
      subtotal: 200,
      taxAmount: 24,
      totalAmount: 224,
      paymentMethod: 'CASH' as const,
      billingName: 'Meera Shah',
      billingPhone: '9876543210',
      invoiceDate: new Date(at),
      createdAt: new Date(at),
    };
    await db.pharmacyInvoice.create({ data: { ...base, id: 'issued-800', invoiceNumber: 'PHI-2026-800', status: 'CONFIRMED' } });
    await db.pharmacyInvoice.create({
      data: { ...base, id: 'cancelled-draft', invoiceNumber: 'DRAFT-4b1d8c2e-93f0-4a57-8d1e-6c2b9f0a7e31', status: 'CANCELLED' },
    });
    const day = q('2026-11-14');
    const register = await reports.report('sales-register', q('2026-11-14', '2026-11-14', { type: 'ALL' }), actor);
    const gstr1 = await reports.report('gstr-1', day, actor);
    expect([rowsOf(register).map((r: any) => r.billNo), rowsOf(gstr1, 'docs')]).toEqual([
      ['PHI-2026-800'],
      [
        {
          nature: 'Invoices for outward supply',
          from: 'PHI-2026-800',
          to: 'PHI-2026-800',
          total: 1,
          cancelled: 0,
          net: 1,
        },
      ],
    ]);
  });

  it('appends counts by sequence and refuses a stale or racing count without overwriting', async () => {
    const day = '2026-11-05';
    const first = await reports.recordCount(
      day,
      {
        counted: { CASH: 100, UPI: '224', CARD: 112 },
        basedOnSequence: 0,
        note: 'Drawer short',
      },
      actor,
    );
    expect(first.collection).toMatchObject({
      countedTotal: 436,
      difference: -12,
      status: 'SHORT',
    });
    expect(first.collection.count).toMatchObject({
      sequence: 1,
      note: 'Drawer short',
      countedBy: { name: 'Asha Rao' },
    });

    await expect(
      reports.recordCount(
        day,
        { counted: { CASH: 112 }, basedOnSequence: 0 },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const racers = await Promise.allSettled([
      reports.recordCount(
        day,
        { counted: { CASH: 112, UPI: 224, CARD: 112 }, basedOnSequence: 1 },
        actor,
      ),
      reports.recordCount(
        day,
        { counted: { CASH: 111, UPI: 224, CARD: 112 }, basedOnSequence: 1 },
        actor,
      ),
    ]);
    expect(racers.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (racers.find((r) => r.status === 'rejected') as PromiseRejectedResult)
        .reason,
    ).toBeInstanceOf(ConflictException);

    const stored = await db.pharmacyCashCount.findMany({
      where: { branchId: 'branch', day },
      orderBy: { sequence: 'asc' },
    });
    expect(stored.map((c) => c.sequence)).toEqual([1, 2]);
    const latest = await reports.dailyCollection(day, actor);
    expect(latest.collection.history.map((c) => c.sequence)).toEqual([2, 1]);
  });

  it('rejects a count for a day not yet started, an unknown mode, a negative amount or an empty count', async () => {
    const now = new Date('2026-11-05T12:00:00Z');
    await expect(
      reports.recordCount(
        '2026-11-06',
        { counted: { CASH: 1 }, basedOnSequence: 0 },
        actor,
        now,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      reports.recordCount(
        '2026-11-04',
        { counted: { BITCOIN: 1 }, basedOnSequence: 0 },
        actor,
        now,
      ),
    ).rejects.toThrow('Unknown payment mode');
    await expect(
      reports.recordCount(
        '2026-11-04',
        { counted: { CASH: -1 }, basedOnSequence: 0 },
        actor,
        now,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      reports.recordCount(
        '2026-11-04',
        { counted: { CASH: '' }, basedOnSequence: 0 },
        actor,
        now,
      ),
    ).rejects.toThrow('at least one');
    expect(
      await db.pharmacyCashCount.count({ where: { day: '2026-11-04' } }),
    ).toBe(0);
  });

  it('downloads carry the same figures as the screen', async () => {
    const screen = await reports.report(
      'sales-register',
      q('2026-11-05'),
      actor,
    );
    const csv = (
      await reports.file('sales-register', q('2026-11-05'), actor, 'csv')
    ).data.toString('utf8');
    expect(csv.split('\r\n')[1]).toBe(
      'Total,,,,300.00,0.00,300.00,0.00,18.00,18.00,0.00,336.00',
    );
    const book = XLSX.read(
      (await reports.file('sales-register', q('2026-11-05'), actor, 'xlsx'))
        .data,
      { type: 'buffer' },
    );
    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      book.Sheets[book.SheetNames[0]],
      { header: 1, blankrows: false },
    );
    expect((rows[3] as unknown[]).at(-1)).toBe(screen.headline!.value);
    const pdf = await reports.file('gstr-1', q('2026-11-05'), actor, 'pdf');
    expect(pdf.data.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.fileName).toBe('gstr-1-2026-11-05-to-2026-11-05.pdf');
  });

  it('serves the day-wise, margin, doctor-wise and expiring-stock reports in the same shape', async () => {
    const dayWise = await reports.report(
      'day-wise-summary',
      q('2026-11-04', '2026-11-05'),
      actor,
    );
    expect(rowsOf(dayWise).map((r: any) => [r.date, r.count])).toEqual([
      ['2026-11-04', 0],
      ['2026-11-05', 1],
    ]);
    const doctors = await reports.report(
      'doctor-wise-sales',
      q('2026-11-05'),
      actor,
    );
    // The customer return names no doctor, so it nets off under No doctor recorded, listed last.
    expect(rowsOf(doctors).map((r: any) => [r.doctor, r.total])).toEqual([
      ['Praneeta Jain', 224],
      ['Dr. Visiting', 112],
      ['No doctor recorded', -112],
    ]);
    const margin = await reports.report('item-margin', q('2026-11-05'), actor);
    expect(margin.tiles.map((t) => t.label)).toEqual([
      'Total Sale Amount',
      'Total Purchase',
      'Total Net GST',
      'Total Profit',
    ]);
    const expiring = await reports.report(
      'expiring-stock',
      q('2026-11-05', '2026-11-05', { window: 'expired' }),
      actor,
    );
    expect(expiring.sections[0].rows).toEqual([]);
  });
});
