import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PatientsService } from './patients.service';

const url = process.env.PATIENT_TEST_DATABASE_URL;
(url ? it : it.skip)('does not expose portal credentials in patient or portal responses', async () => {
  const target = new URL(url!);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !target.pathname.startsWith('/codex_clinic_')) throw new Error('Requires a dedicated local codex_clinic_ database');
  const db = new PrismaClient({ datasourceUrl: url });
  const rollback = new Error('rollback synthetic patient');
  const suffix = randomUUID();
  try {
    await db.$transaction(async tx => {
      const branch = await tx.branch.create({ data: { name: 'Synthetic', address: 'Synthetic' } });
      const user = await tx.user.create({ data: { firstName: 'Portal', lastName: 'User', email: `${suffix}@example.invalid`, password: 'private-password', role: 'PATIENT', branchId: branch.id, metadata: JSON.stringify({ whatsappAccessToken: 'private-token' }), permissions: '["private"]' } });
      const patient = await tx.patient.create({ data: { name: 'Synthetic patient', phone: '1234567890', gender: 'OTHER', branchId: branch.id, portalUserId: user.id } });
      const service = new PatientsService(tx as any, {} as any, {} as any);
      const record = await service.findOne(patient.id, branch.id);
      const portal = await service.getPortalUser(patient.id, branch.id);
      for (const account of [record.portalUser, portal]) {
        expect(account).toMatchObject({ id: user.id, email: user.email });
        expect(account).not.toHaveProperty('password');
        expect(account).not.toHaveProperty('metadata');
        expect(account).not.toHaveProperty('permissions');
      }
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await db.$disconnect(); }
});
