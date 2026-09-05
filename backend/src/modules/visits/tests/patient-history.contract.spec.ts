import { Prisma } from '@prisma/client';
import { ValidationPipe } from '@nestjs/common';
import { UpdateVisitDto } from '../dto/create-visit.dto';
import { PatientVisitHistoryQueryDto } from '../dto/query-visit.dto';
import { VisitsService } from '../visits.service';
import { mergeClinicalData, mergeClinicalEntries } from '../clinical-data';

describe('Patient history contracts', () => {
  it('preserves structured clinical data through the actual validation pipe', async () => {
    const payload = { history: { pastHistory: 'Past', triggers: 'Trigger', priorTreatments: 'Prior' }, diagnosis: [{ diagnosis: 'A' }, { diagnosis: 'B' }], examination: { dermatology: { skinType: 'III' } }, treatmentPlan: { investigations: ['CBC'], procedurePlanned: 'Review', followUpInstructions: 'Return', followUpDate: '2026-10-01' } };
    const result = await new ValidationPipe({ transform: true, whitelist: true }).transform(payload, { type: 'body', metatype: UpdateVisitDto });
    expect(JSON.parse(JSON.stringify(result))).toEqual(payload);
  });
  it('rejects malformed history and validates real query parameters', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    await expect(pipe.transform({ history: ['invalid'] }, { type: 'body', metatype: UpdateVisitDto })).rejects.toThrow();
    const query = await pipe.transform({ offset: '100', limit: '25', includeAppointments: 'false' }, { type: 'query', metatype: PatientVisitHistoryQueryDto });
    expect(query).toMatchObject({ offset: 100, limit: 25, includeAppointments: false });
    await expect(pipe.transform({ offset: '-1' }, { type: 'query', metatype: PatientVisitHistoryQueryDto })).rejects.toThrow();
  });
  it('merges partial clinical fields without replacing unrelated data or legacy text', () => {
    const original = { dermatology: { labResults: { CBC: 'saved' }, procedures: ['saved'] }, notes: 'keep' };
    expect(mergeClinicalData(original, { dermatology: { counseling: 'new' } })).toEqual({ dermatology: { labResults: { CBC: 'saved' }, procedures: ['saved'], counseling: 'new' }, notes: 'keep' });
    expect(original.dermatology).not.toHaveProperty('counseling');
    expect(mergeClinicalData('legacy history', { triggers: 'new' })).toEqual({ legacyText: 'legacy history', triggers: 'new' });
  });
  it('retains complaint and diagnosis annotations when labels are resubmitted', () => {
    const diagnoses = [{ diagnosis: 'A', icd10Code: 'L70', notes: 'Keep note' }, { diagnosis: 'B', type: 'Secondary' }];
    expect(mergeClinicalEntries(diagnoses, [{ diagnosis: 'A, B' }], 'diagnosis')).toEqual(diagnoses);
    expect(mergeClinicalEntries(diagnoses, [{ diagnosis: 'A' }], 'diagnosis')).toEqual([diagnoses[0]]);
  });
  it('pages visits and appointment-only records together by encounter date, preserving content', async () => {
    const dates = (d: string) => new Date(`2026-09-${d}T00:00:00Z`);
    const visits = [
      { id: 'v1', createdAt: dates('04'), appointment: { id: 'a1', date: dates('01'), status: 'COMPLETED' }, plan: JSON.stringify({ finalNotes: 'Keep final', dermatology: { procedures: [{ type: 'Procedure' }] } }), history: JSON.stringify({ triggers: 'Trigger' }), prescription: { id: 'rx', items: JSON.stringify([{ drugName: 'Drug', dosePattern: '1-0-1' }]), instructions: 'Return in a week' } },
      { id: 'v2', createdAt: dates('02'), appointment: null },
    ];
    const db: any = { patient: { findFirst: jest.fn().mockResolvedValue({ id: 'p' }) }, visit: { findMany: jest.fn(async q => q.select ? visits : visits.filter(v => q.where.id.in.includes(v.id))) }, appointment: { findMany: jest.fn().mockResolvedValue([{ id: 'a2', date: dates('03'), createdAt: dates('01'), status: 'SCHEDULED' }]) }, visitAttachment: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new VisitsService(db);
    const first = await service.getPatientVisitHistory({ patientId: 'p', includeAppointments: true, limit: 2 }, 'branch');
    expect(first.visits.map(v => v.id)).toEqual(['appointment:a2', 'v2']);
    expect(first.pagination).toEqual({ total: 3, offset: 0, limit: 2, hasMore: true });
    const second = await service.getPatientVisitHistory({ patientId: 'p', includeAppointments: true, limit: 2, offset: 2 }, 'branch');
    expect(second.visits).toHaveLength(1);
    const detailQuery = db.visit.findMany.mock.calls.find(([q]) => q.include)?.[0];
    for (const [relation, modelName] of Object.entries({ prescription: 'Prescription', consents: 'Consent', labOrders: 'LabOrder', deviceLogs: 'DeviceLog' })) {
      const fields = Prisma.dmmf.datamodel.models.find(model => model.name === modelName)!.fields.map(field => field.name);
      for (const selected of Object.keys(detailQuery.include[relation].select)) expect(fields).toContain(selected);
    }
    expect(detailQuery.include.labOrders.select.tests).toBe(true);
    expect(detailQuery.include.consents.select.text).toBe(true);
    expect(detailQuery.include.deviceLogs.select.parameters).toBe(true);
    expect(second.visits[0]).toMatchObject({ id: 'v1', encounterDate: dates('01'), history: { triggers: 'Trigger' }, plan: { finalNotes: 'Keep final' }, prescriptionItems: [{ dosePattern: '1-0-1' }], prescriptionMeta: { followUpInstructions: 'Return in a week' } });
    expect(second.pagination.hasMore).toBe(false);
    expect(db.visit.findMany.mock.calls[0][0].where.patient).toEqual({ branchId: 'branch' });
    expect(db.appointment.findMany.mock.calls[0][0].where).toEqual({ patientId: 'p', branchId: 'branch', visit: { is: null } });
    const without = await service.getPatientVisitHistory({ patientId: 'p' }, 'branch');
    expect(without.visits.map(v => v.id)).toEqual(['v2', 'v1']);
  });
});
