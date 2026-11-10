import { PrismaClient } from '@prisma/client';
import { localDatabase } from '../testing/local-database';
import { InvoiceNumbersService } from './invoice-numbers.service';

const databaseTests = process.env.INVOICE_NUMBERS_TEST_DATABASE_URL
  ? describe
  : describe.skip;
const quarterPastMidnightIst = new Date('2026-03-31T18:45:00Z');

databaseTests('Invoice number reservation with PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let prisma: PrismaClient;
  let numbers: InvoiceNumbersService;
  const day = new Date('2026-04-10T06:00:00Z');

  beforeAll(async () => {
    fixture = await localDatabase(
      process.env.INVOICE_NUMBERS_TEST_DATABASE_URL!,
    );
    prisma = fixture.prisma;
    numbers = new InvoiceNumbersService(prisma as any);
  }, 120000);
  beforeEach(async () => {
    await prisma.numberSequence.deleteMany({});
  });
  afterAll(async () => {
    await fixture?.cleanup();
  });

  const reserveMany = (
    count: number,
    params: Parameters<InvoiceNumbersService['reserve']>[0],
  ) =>
    Promise.all(Array.from({ length: count }, () => numbers.reserve(params)));

  it('starts each new key at 1 and increases by one per call', async () => {
    const first = await numbers.reserve({
      type: 'BILLING',
      branchId: 'branch-a',
      date: day,
    });
    const second = await numbers.reserve({
      type: 'BILLING',
      branchId: 'branch-a',
      date: day,
    });
    const third = await numbers.reserve({
      type: 'BILLING',
      branchId: 'branch-a',
      date: day,
    });
    expect([first, second, third]).toEqual([
      { sequence: 1, periodKey: '20260410' },
      { sequence: 2, periodKey: '20260410' },
      { sequence: 3, periodKey: '20260410' },
    ]);
  });

  it('gives 20 concurrent callers 20 distinct consecutive numbers for one key', async () => {
    const results = await reserveMany(20, {
      type: 'BILLING',
      branchId: 'branch-a',
      date: day,
    });
    expect(results.map((r) => r.sequence).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(
      (
        await numbers.reserve({
          type: 'BILLING',
          branchId: 'branch-a',
          date: day,
        })
      ).sequence,
    ).toBe(21);
  });

  it('keeps branches and types independent under concurrency', async () => {
    const [a, b, pharmacy] = await Promise.all([
      reserveMany(10, { type: 'BILLING', branchId: 'branch-a', date: day }),
      reserveMany(10, { type: 'BILLING', branchId: 'branch-b', date: day }),
      reserveMany(10, { type: 'PHARMACY', branchId: 'branch-a', date: day }),
    ]);
    const oneToTen = Array.from({ length: 10 }, (_, i) => i + 1);
    for (const results of [a, b, pharmacy])
      expect(results.map((r) => r.sequence).sort((x, y) => x - y)).toEqual(
        oneToTen,
      );
    expect(new Set(pharmacy.map((r) => r.periodKey))).toEqual(
      new Set(['2026']),
    );
  });

  it('restarts BILLING at 1 each day and PHARMACY at 1 each year', async () => {
    await reserveMany(3, { type: 'BILLING', branchId: 'branch-a', date: day });
    await reserveMany(3, { type: 'PHARMACY', branchId: 'branch-a', date: day });
    const nextDay = new Date('2026-04-11T06:00:00Z');
    const nextYear = new Date('2027-01-02T06:00:00Z');

    expect(
      await numbers.reserve({
        type: 'BILLING',
        branchId: 'branch-a',
        date: nextDay,
      }),
    ).toEqual({ sequence: 1, periodKey: '20260411' });
    expect(
      await numbers.reserve({
        type: 'PHARMACY',
        branchId: 'branch-a',
        date: nextDay,
      }),
    ).toEqual({ sequence: 4, periodKey: '2026' });
    expect(
      await numbers.reserve({
        type: 'PHARMACY',
        branchId: 'branch-a',
        date: nextYear,
      }),
    ).toEqual({ sequence: 1, periodKey: '2027' });
    expect(
      await numbers.reserve({
        type: 'BILLING',
        branchId: 'branch-a',
        date: day,
      }),
    ).toEqual({ sequence: 4, periodKey: '20260410' });
    expect(
      await numbers.reserve({ type: 'LAB', branchId: 'branch-a', date: day }),
    ).toEqual({ sequence: 1, periodKey: '20260410' });
  });

  it('files a number under the IST calendar day and year whatever the server timezone', async () => {
    await numbers.reserve({
      type: 'BILLING',
      branchId: 'branch-a',
      date: new Date('2026-03-31T10:00:00Z'),
    });
    const newYearIst = new Date('2026-12-31T19:00:00Z');
    expect([
      await numbers.reserve({
        type: 'BILLING',
        branchId: 'branch-a',
        date: quarterPastMidnightIst,
      }),
      await numbers.reserve({
        type: 'PHARMACY',
        branchId: 'branch-a',
        date: newYearIst,
      }),
    ]).toEqual([
      { sequence: 1, periodKey: '20260401' },
      { sequence: 1, periodKey: '2027' },
    ]);
  });
});
