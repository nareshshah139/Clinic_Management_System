import { ValidationPipe } from '@nestjs/common';
import { CreateVisitDto, UpdateVisitDto } from '../dto/create-visit.dto';
import { ConsultationType, consultationPatch } from '../consultation';
import { VisitsService } from '../visits.service';
import { PrescriptionsService } from '../../prescriptions/prescriptions.service';
import { CreatePrescriptionDto, UpdatePrescriptionDto } from '../../prescriptions/dto/prescription.dto';

const tele = ConsultationType.TELE_VIDEO;
const person = ConsultationType.IN_PERSON;
const pipe = new ValidationPipe({ transform: true, whitelist: true });
const validate = (body: unknown, metatype: any = CreateVisitDto) => pipe.transform(body, { type: 'body', metatype });

function fixture() {
  let visit: any = { id: 'v', patientId: 'p', doctorId: 'doctor', complaints: '[]', consultationType: person };
  const db: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'rx' }]),
    patient: { findFirst: jest.fn().mockResolvedValue({ id: 'p' }) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'doctor' }) },
    visit: {
      findFirst: jest.fn(async () => visit),
      create: jest.fn(async ({ data }) => (visit = { ...visit, ...data })),
      update: jest.fn(async ({ data }) => (visit = { ...visit, ...data })),
      findMany: jest.fn(async () => [visit]), count: jest.fn().mockResolvedValue(1),
    },
    prescription: { findUnique: jest.fn(async () => ({ status: 'ACTIVE', refills: [], ...(await db.prescription.findFirst()) })), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(async ({ data }) => ({ id: 'rx', ...data })), update: jest.fn(async ({ data }) => ({ id: 'rx', ...data })) },
    $transaction: jest.fn(async fn => fn(db)),
  };
  return { db, service: new VisitsService(db), read: () => visit };
}

it.each([undefined, false, 'true', 1, null])('rejects tele-video without explicit consent (%j), before writes', async consent => {
  const { db, service } = fixture();
  await expect(service.create({ patientId: 'p', doctorId: 'doctor', complaints: [{ complaint: 'Synthetic complaint' }], consultationType: tele, teleVideoConsent: consent } as any, 'branch', 'staff')).rejects.toThrow(/consent/i);
  expect(db.visit.create).not.toHaveBeenCalled();
  expect(db.$transaction).not.toHaveBeenCalled();
});

it('defaults existing and new visits to in-person without a consent receipt', async () => {
  const { service, read } = fixture();
  await service.create({ patientId: 'p', doctorId: 'doctor', complaints: [{ complaint: 'Synthetic complaint' }] }, 'branch', 'staff');
  expect(read()).toMatchObject({ consultationType: person });
  expect(read().teleVideoConsentById).toBeUndefined();
});

it('ignores forged receipt fields, records the actor/time, and preserves the first receipt on edits', async () => {
  const { service, read } = fixture();
  const before = Date.now();
  const input = await validate({ patientId: 'p', doctorId: 'doctor', complaints: [{ complaint: 'Synthetic complaint' }], consultationType: tele, teleVideoConsent: true, teleVideoConsentById: 'forged', teleVideoConsentAt: '2000-01-01' });
  await service.create(input, 'branch', 'authenticated-staff');
  const at = read().teleVideoConsentAt;
  expect(read().teleVideoConsentById).toBe('authenticated-staff');
  expect(at.getTime()).toBeGreaterThanOrEqual(before);
  expect(at.getTime()).toBeLessThanOrEqual(Date.now());
  await service.update('v', { notes: 'Unrelated edit' }, 'branch', 'another-staff');
  await service.update('v', { consultationType: tele, teleVideoConsent: true }, 'branch', 'another-staff');
  expect(read()).toMatchObject({ teleVideoConsentById: 'authenticated-staff', teleVideoConsentAt: at });
  expect(await service.findOne('v', 'branch')).toMatchObject({ consultationType: tele, teleVideoConsentById: 'authenticated-staff', teleVideoConsentAt: at });
});

it('blocks unchecked consent on update; switching back to tele-video requires a new receipt', async () => {
  const { service, db, read } = fixture();
  await expect(service.update('v', { consultationType: tele }, 'branch', 'staff')).rejects.toThrow(/consent/i);
  expect(db.visit.update).not.toHaveBeenCalled();
  await service.update('v', { consultationType: tele, teleVideoConsent: true }, 'branch', 'first-staff');
  await expect(service.update('v', { teleVideoConsent: false }, 'branch', 'staff')).rejects.toThrow(/consent/i);
  await service.update('v', { consultationType: person, teleVideoConsent: false }, 'branch', 'staff');
  expect(read()).toMatchObject({ consultationType: person, teleVideoConsentById: 'first-staff' });
  await expect(service.update('v', { consultationType: tele }, 'branch', 'staff')).rejects.toThrow(/consent/i);
  await service.update('v', { consultationType: tele, teleVideoConsent: true }, 'branch', 'new-staff');
  expect(read()).toMatchObject({ consultationType: tele, teleVideoConsentById: 'new-staff' });
});

it('rejects missing actors, invalid types and invalid consent at validation and service boundaries', async () => {
  expect(() => consultationPatch({ consultationType: tele, teleVideoConsent: true }, undefined)).toThrow(/Sign in/);
  expect(() => consultationPatch({ consultationType: 'OTHER' } as any, undefined, 'staff')).toThrow(/Choose/);
  await expect(validate({ consultationType: 'OTHER' }, UpdateVisitDto)).rejects.toThrow();
  await expect(validate({ teleVideoConsent: 'true' }, UpdateVisitDto)).rejects.toThrow();
});

it.each(['create', 'update'])('enforces consent and records the actor through prescription %s clinicalData', async action => {
  const { db, read } = fixture();
  if (action === 'update') db.prescription.findFirst.mockResolvedValue({ id: 'rx', visitId: 'v', items: '[]', visit: { id: 'v', patient: { id: 'p' }, doctor: { id: 'doctor' } } });
  const service = new PrescriptionsService(db, {} as any);
  const input = { patientId: 'p', doctorId: 'doctor', visitId: 'v', items: [{ drugName: 'Synthetic', dosageUnit: 'TABLET', frequency: 'DAILY', duration: 1, durationUnit: 'DAYS' }], clinicalData: { consultationType: tele, teleVideoConsent: false } };
  const save = async () => {
    const body = await validate(input, action === 'create' ? CreatePrescriptionDto : UpdatePrescriptionDto);
    return action === 'create' ? service.createPrescription(body, 'branch', 'staff') : service.updatePrescription('rx', body, 'branch', 'staff');
  };
  await expect(save()).rejects.toThrow(/consent/i);
  expect(db.prescription[action]).not.toHaveBeenCalled();
  input.clinicalData.teleVideoConsent = true;
  await save();
  expect(read()).toMatchObject({ consultationType: tele, teleVideoConsentById: 'staff' });
});

it('filters visits by consultation type within the authenticated branch', async () => {
  const { service, db } = fixture();
  await service.findAll({ consultationType: tele }, 'branch');
  expect(db.visit.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ consultationType: tele, patient: { branchId: 'branch' } }) }));
});
