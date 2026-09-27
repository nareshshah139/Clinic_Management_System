import { NotFoundException, ValidationPipe } from '@nestjs/common';
import { CreateVisitDto, UpdateVisitDto } from '../dto/create-visit.dto';
import { VisitsService } from '../visits.service';
import { ConsultationType } from '../consultation';

function fixture() {
  const visits: any[] = [];
  const db: any = {
    patient: { findFirst: jest.fn(async ({ where }) => where.id === 'patient' && where.branchId === 'branch' ? { id: 'patient' } : null) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'doctor' }) },
    visit: {
      findFirst: jest.fn(async ({ where }) => where.id
        ? visits.find(v => v.id === where.id)
        : [...visits].reverse().find(v => v.patientId === where.patientId && v.branchId === where.patient.branchId && v.history?.includes(where.history.contains))),
      create: jest.fn(async ({ data }) => {
        const visit = { ...data, id: `visit-${visits.length}`, branchId: 'branch', createdAt: new Date() };
        visits.push(visit);
        return visit;
      }),
      update: jest.fn(async ({ where, data }) => Object.assign(visits.find(v => v.id === where.id), data)),
      findMany: jest.fn(async () => [...visits].reverse()),
    },
    visitAttachment: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async fn => fn(db)),
  };
  const service = new VisitsService(db);
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const create = async (history?: unknown) => service.create(await pipe.transform({ patientId: 'patient', doctorId: 'doctor', complaints: [{ complaint: 'Synthetic visit' }], history }, { type: 'body', metatype: CreateVisitDto }), 'branch');
  return { db, visits, service, pipe, create };
}

it('saves personal history, exposes it for new visits and snapshots it into the next visit', async () => {
  const { db, service, create, visits } = fixture();
  const personalHistory = 'Vegetarian diet; sleeps 6 hours\nTeacher; sunscreen daily';
  const first = await create({ personalHistory, pastHistory: 'Retained history' });
  // An intervening legacy visit without the field must not hide the last saved value.
  visits.push({ id: 'legacy', patientId: 'patient', branchId: 'branch', history: '{"pastHistory":"Legacy"}' });
  expect(await service.getPatientPersonalHistory('patient', 'branch')).toEqual({ personalHistory });
  const next = await create({ medicationHistory: 'Other current history' });
  expect((await service.findOne(next.id, 'branch')).history).toEqual({ medicationHistory: 'Other current history', personalHistory });
  expect((await service.findOne(first.id, 'branch')).history).toEqual({ personalHistory, pastHistory: 'Retained history' });
  const history = await service.getPatientVisitHistory({ patientId: 'patient' }, 'branch');
  expect(history.visits.find(visit => visit.id === next.id)?.historySummary.personalHistory).toBe(personalHistory);
  expect(db.visit.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { patientId: 'patient', patient: { branchId: 'branch' }, history: { contains: '"personalHistory":' } } }));
});

it.each(['', '  \n  '])('persists an explicit clear %j and carries it forward without reviving older text', async personalHistory => {
  const { service, pipe, create } = fixture();
  const first = await create({ personalHistory: 'Original history', pastHistory: 'Keep' });
  const patch = await pipe.transform({ history: { personalHistory } }, { type: 'body', metatype: UpdateVisitDto });
  await service.update(first.id, patch, 'branch');
  expect((await service.findOne(first.id, 'branch')).history).toEqual({ personalHistory, pastHistory: 'Keep' });
  const next = await create();
  expect((await service.findOne(next.id, 'branch')).history).toEqual({ personalHistory });
  expect(await service.getPatientPersonalHistory('patient', 'branch')).toEqual({ personalHistory });
});

it('prefers the new value, retains legacy text and isolates patients and branches', async () => {
  const { service, create, visits } = fixture();
  await create({ personalHistory: 'Old' });
  const next = await create({ personalHistory: 'New' });
  expect((await service.findOne(next.id, 'branch')).history).toEqual({ personalHistory: 'New' });
  const legacy = await create('Legacy free text');
  expect((await service.findOne(legacy.id, 'branch')).history).toEqual({ legacyText: 'Legacy free text', personalHistory: 'New' });
  visits.push({ id: 'other', patientId: 'other', branchId: 'branch', history: '{"personalHistory":"Other patient"}' });
  visits.push({ id: 'other-branch', patientId: 'patient', branchId: 'other', history: '{"personalHistory":"Other branch"}' });
  expect(await service.getPatientPersonalHistory('patient', 'branch')).toEqual({ personalHistory: 'New' });
  await expect(service.getPatientPersonalHistory('patient', 'other')).rejects.toThrow(NotFoundException);
});

it('returns no default history for a patient who has never recorded it', async () => {
  const { service, create } = fixture();
  expect(await service.getPatientPersonalHistory('patient', 'branch')).toEqual({ personalHistory: null });
  const visit = await create();
  expect(visit.history).toBeNull();
});

it('carries personal history into a consented tele-video visit without bypassing the consent gate', async () => {
  const { db, service, create } = fixture();
  await create({ personalHistory: 'Retain this patient history' });
  db.visit.create.mockClear();
  const input = { patientId: 'patient', doctorId: 'doctor', complaints: [{ complaint: 'Synthetic visit' }], consultationType: ConsultationType.TELE_VIDEO };
  await expect(service.create(input, 'branch', 'staff')).rejects.toThrow(/consent/i);
  expect(db.visit.create).not.toHaveBeenCalled();
  const visit = await service.create({ ...input, teleVideoConsent: true }, 'branch', 'staff');
  expect(await service.findOne(visit.id, 'branch')).toMatchObject({ consultationType: ConsultationType.TELE_VIDEO, teleVideoConsentById: 'staff', history: { personalHistory: 'Retain this patient history' } });
  expect(visit.teleVideoConsentAt).toBeInstanceOf(Date);
});
