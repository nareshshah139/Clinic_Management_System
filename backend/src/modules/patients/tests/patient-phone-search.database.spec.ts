import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { PatientsService } from '../patients.service';

const databaseTests = process.env.PATIENT_SEARCH_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Patient phone search on PostgreSQL', () => {
  const schema = `patient_search_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let patients: PatientsService;
  let created = false;

  const search = async (term: string, branchId = 'A') =>
    (await patients.findAll({ page: 1, limit: 20, search: term }, branchId)).data.map((p) => p.name).sort();

  beforeAll(async () => {
    const url = new URL(process.env.PATIENT_SEARCH_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
      { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url.toString() } });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    patients = new PatientsService(db as any, {} as any, {} as any);

    for (const id of ['A', 'B']) await db.branch.create({ data: { id, name: `Branch ${id}`, address: 'Synthetic' } });
    // Phones are stored digits only; one number carries the 91 country code.
    await db.patient.create({ data: { id: 'ten', name: 'TenDigit Patient', gender: 'F', phone: '9876543210', email: 'ten@example.test', branchId: 'A' } });
    await db.patient.create({ data: { id: 'cc', name: 'CountryCode Patient', gender: 'M', phone: '919876500001', branchId: 'A' } });
    await db.patient.create({ data: { id: 'other', name: 'Other Patient', gender: 'M', phone: '9123456789', branchId: 'A' } });
    await db.patient.create({ data: { id: 'elsewhere', name: 'Elsewhere Patient', gender: 'M', phone: '9876543210', branchId: 'B' } });
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('matches a stored number from a formatted term', async () => {
    expect(await search('+91 98765 43210')).toEqual(['TenDigit Patient']);
    expect(await search('98765-43210')).toEqual(['TenDigit Patient']);
    expect(await search('(98765) 43210')).toEqual(['TenDigit Patient']);
  });

  it('matches a 10-digit stored number from a term with the 91 country code', async () => {
    expect(await search('919876543210')).toEqual(['TenDigit Patient']);
    expect(await search('+919876543210')).toEqual(['TenDigit Patient']);
  });

  it('matches a stored number with the 91 prefix from a 10-digit term', async () => {
    expect(await search('9876500001')).toEqual(['CountryCode Patient']);
    expect(await search('98765 00001')).toEqual(['CountryCode Patient']);
    expect(await search('919876500001')).toEqual(['CountryCode Patient']);
  });

  it('still matches a plain digit prefix and stays inside the branch', async () => {
    expect(await search('98765')).toEqual(['TenDigit Patient']);
    expect(await search('98765', 'B')).toEqual(['Elsewhere Patient']);
  });

  it('keeps name, email, and patient code search unchanged', async () => {
    expect(await search('tendigit')).toEqual(['TenDigit Patient']);
    expect(await search('ten@example')).toEqual(['TenDigit Patient']);
    const { patientCode } = (await db.patient.findUniqueOrThrow({ where: { id: 'cc' }, select: { patientCode: true } }));
    if (patientCode) expect(await search(patientCode)).toEqual(['CountryCode Patient']);
  });

  it('does not treat digits inside a name search as a phone', async () => {
    expect(await search('Patient 9')).toEqual([]);
  });
});
