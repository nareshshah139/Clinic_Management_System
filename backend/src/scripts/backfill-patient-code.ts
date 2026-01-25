/* eslint-disable no-console */
import { PrismaClient, Prisma } from '@prisma/client';
import { generatePatientCode } from '../shared/ids/patient-code.util';

const prisma = new PrismaClient();

const BATCH_SIZE = 500;
const MAX_RETRIES = 5;

async function assignCode(patientId: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const code = generatePatientCode();
    try {
      const updated = await prisma.$executeRawUnsafe<number>(
        'UPDATE "patients" SET "patientCode" = $1 WHERE "id" = $2 AND ("patientCode" IS NULL OR "patientCode" = \'\')',
        code,
        patientId,
      );
      if (updated === 1) return code;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        Array.isArray((err as any).meta?.target) &&
        (err as any).meta?.target?.includes('patientCode')
      ) {
        if (attempt === MAX_RETRIES) {
          throw new Error(`Failed to generate unique patientCode for ${patientId} after ${MAX_RETRIES} retries`);
        }
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Failed to generate patientCode for ${patientId}`);
}

async function main() {
  let processed = 0;
  let cursor: string | undefined;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const patients = await prisma.patient.findMany({
      where: { OR: [{ patientCode: null }, { patientCode: '' }] },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true },
    });
    if (patients.length === 0) {
      console.log('Backfill complete. Processed:', processed);
      break;
    }
    for (const p of patients) {
      await assignCode(p.id);
      processed += 1;
      if (processed % 100 === 0) {
        console.log(`Progress: ${processed} patients updated`);
      }
    }
    cursor = patients[patients.length - 1]?.id;
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

