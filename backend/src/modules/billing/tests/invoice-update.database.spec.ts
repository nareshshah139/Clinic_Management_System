import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { BillingService } from '../billing.service';
import { InvoiceNumbersService } from '../../../shared/numbering/invoice-numbers.service';

const databaseTests = process.env.BILLING_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Clinic invoice updates on PostgreSQL', () => {
  const schema = `billing_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let billing: BillingService;
  let created = false;

  beforeAll(async () => {
    const url = new URL(process.env.BILLING_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
      { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url.toString() } });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await db.branch.create({ data: { id: 'branch', name: 'Branch', address: 'Synthetic' } });
    await db.patient.create({ data: { id: 'patient', name: 'Synthetic Patient', gender: 'F', phone: '9000000000', branchId: 'branch' } });
    billing = new BillingService(db as any, new InvoiceNumbersService(db as any));
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  const item = (name: string, unitPrice: number, quantity = 1, extra: object = {}) => ({ name, unitPrice, quantity, gstRate: 10, discount: 0, ...extra });

  it('replaces the items of an existing invoice and recomputes its total and balance', async () => {
    const invoice = await billing.createInvoice({ patientId: 'patient', items: [item('Consultation', 500)] } as any, 'branch');
    await billing.processPayment({ invoiceId: invoice.id, amount: 200, method: 'CASH' } as any, 'branch');

    const updated = await billing.updateInvoice(invoice.id, { items: [item('Consultation', 500), item('Dressing', 150, 2)] } as any, 'branch');

    expect(updated.items.map((i: any) => [i.name, i.qty, i.total]).sort()).toEqual([['Consultation', 1, 500], ['Dressing', 2, 300]]);
    expect(updated.total).toBe(880);
    expect(updated.balance).toBe(680);
    expect(await db.newInvoiceItem.count({ where: { invoiceId: invoice.id } })).toBe(2);
  });

  it('keeps the invoice discount when recomputing the total', async () => {
    const invoice = await billing.createInvoice({ patientId: 'patient', discount: 10, items: [item('Peel', 1000)] } as any, 'branch');
    expect(invoice.total).toBe(1000);
    const updated = await billing.updateInvoice(invoice.id, { items: [item('Peel', 2000)] } as any, 'branch');
    expect(updated.total).toBe(2000);
  });

  it('leaves items untouched when only payment details change', async () => {
    const invoice = await billing.createInvoice({ patientId: 'patient', items: [item('Laser', 3000)] } as any, 'branch');
    const updated = await billing.updateInvoice(invoice.id, { gstin: '36ABCDE1234F1Z5' } as any, 'branch');
    expect(updated.items).toHaveLength(1);
    expect(updated.total).toBe(3300);
  });

  it('applies a changed invoice discount to the stored items', async () => {
    const invoice = await billing.createInvoice({ patientId: 'patient', items: [item('Facial', 1000)] } as any, 'branch');
    const updated = await billing.updateInvoice(invoice.id, { discount: 20 } as any, 'branch');
    expect(updated.discount).toBe(20);
    expect(updated.total).toBe(900);
  });

  it('bills a GST-exempt (0%) service without GST, on create and on update', async () => {
    const invoice = await billing.createInvoice({ patientId: 'patient', items: [item('Exempt consult', 1000, 1, { gstRate: 0 })] } as any, 'branch');
    expect(invoice.total).toBe(1000);
    expect(invoice.items[0].gstRate).toBe(0);
    const updated = await billing.updateInvoice(invoice.id, { items: [item('Exempt consult', 1000, 2, { gstRate: 0 })] } as any, 'branch');
    expect(updated.total).toBe(2000);
  });
});
