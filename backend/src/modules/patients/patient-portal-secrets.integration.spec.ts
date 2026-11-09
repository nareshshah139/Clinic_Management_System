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

(url ? it : it.skip)('links an existing same-branch patient account by email and rejects reassignment', async () => {
  const target = new URL(url!);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !target.pathname.startsWith('/codex_clinic_')) throw new Error('Requires a dedicated local codex_clinic_ database');
  const db = new PrismaClient({ datasourceUrl: url });
  const rollback = new Error('rollback synthetic portal links');
  const suffix = randomUUID();
  try {
    await db.$transaction(async tx => {
      const branch = await tx.branch.create({ data: { name: 'Synthetic', address: 'Synthetic' } });
      const otherBranch = await tx.branch.create({ data: { name: 'Other', address: 'Synthetic' } });
      const user = await tx.user.create({ data: { firstName: 'Portal', lastName: 'User', email: `${suffix}@example.invalid`, password: 'private-password', role: 'PATIENT', branchId: branch.id } });
      const foreign = await tx.user.create({ data: { firstName: 'Foreign', lastName: 'User', email: `foreign-${suffix}@example.invalid`, password: 'private-password', role: 'PATIENT', branchId: otherBranch.id } });
      const staff = await tx.user.create({ data: { firstName: 'Staff', lastName: 'User', email: `staff-${suffix}@example.invalid`, password: 'private-password', role: 'DOCTOR', branchId: branch.id } });
      const patient = await tx.patient.create({ data: { name: 'Synthetic patient', phone: '1234567890', gender: 'OTHER', branchId: branch.id } });
      const other = await tx.patient.create({ data: { name: 'Other patient', phone: '1234567891', gender: 'OTHER', branchId: branch.id } });
      const service = new PatientsService(tx as any, {} as any, {} as any);
      await expect(service.linkUser(patient.id, { email: foreign.email }, branch.id)).rejects.toMatchObject({ status: 404 });
      await expect(service.linkUser(patient.id, { email: staff.email }, branch.id)).rejects.toMatchObject({ status: 404 });
      const linked = await service.linkUser(patient.id, { email: user.email.toUpperCase() }, branch.id);
      expect(linked.portalUser).toMatchObject({ id: user.id });
      expect(linked.portalUser).not.toHaveProperty('password');
      await expect(service.linkUser(other.id, { email: user.email }, branch.id)).rejects.toMatchObject({ status: 409 });
      await expect(service.linkUser(patient.id, { email: user.email }, branch.id)).rejects.toMatchObject({ status: 409 });
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await db.$disconnect(); }
});
