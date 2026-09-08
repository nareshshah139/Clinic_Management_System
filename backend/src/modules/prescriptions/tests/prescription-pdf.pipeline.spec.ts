import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { execFileSync, spawn } from 'node:child_process';
import { VisitsService } from '../../visits/visits.service';
import express from 'express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrescriptionsController } from '../prescriptions.controller';
import { PrescriptionsService } from '../prescriptions.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { IdempotencyInterceptor } from '../../../shared/interceptors/idempotency.interceptor';
import { ApiClient } from '../../../../../frontend/src/lib/api';

// Real HTTP, validation, controller, services, interceptor and PDFKit.
// Only authentication and persistence are replaced with isolated synthetic fixtures.
describe('Prescription -> saved readback -> PDF pipeline', () => {
  let app: INestApplication;
  let api: ApiClient;
  let state: any;
  const cache: any[] = [];
  const patient = { id: '00000000-0000-4000-8000-000000000001', name: 'SYNTHETIC TEST PATIENT', branchId: 'pipeline-branch', gender: 'FEMALE', dateOfBirth: '1990-01-01', phone: '', email: '' };
  const doctor = { id: '00000000-0000-4000-8000-000000000002', firstName: 'Test', lastName: 'Doctor', role: 'DOCTOR', branchId: patient.branchId, isActive: true };
  const payload = {
    patientId: patient.id, doctorId: doctor.id, visitId: '00000000-0000-4000-8000-000000000003',
    items: [{ drugName: 'TEST MEDICINE - NOT FOR CLINICAL USE', dosage: 1, dosageUnit: 'TABLET', frequency: 'DAILY', duration: 1, durationUnit: 'DAYS', instructions: 'SYNTHETIC TEST ONLY' }],
    clinicalData: { diagnosis: [{ diagnosis: 'Synthetic test diagnosis' }] },
  };
  const hydrate = (s: any) => s.rx ? { ...s.rx, visit: { ...s.visit, patient, doctor } } : null;
  const client = (getState: () => any): any => ({
    patient: { findFirst: async ({ where }: any) => where.id === patient.id && where.branchId === patient.branchId ? patient : null },
    user: { findFirst: async ({ where }: any) => where.id === doctor.id ? doctor : null },
    visit: {
      findFirst: async ({ where }: any) => where.id === getState().visit.id ? getState().visit : null,
      update: async ({ data }: any) => (getState().visit = { ...getState().visit, ...data }),
    },
    prescription: {
      findFirst: async ({ where }: any) => {
        const s = getState();
        if (where.visit?.patient?.branchId && where.visit.patient.branchId !== patient.branchId) return null;
        return s.rx && (!where.id || where.id === s.rx.id) && (!where.visitId || where.visitId === s.rx.visitId) ? hydrate(s) : null;
      },
      create: async ({ data }: any) => { getState().rx = { id: 'pipeline-rx', ...data }; return hydrate(getState()); },
      update: async ({ data }: any) => { Object.assign(getState().rx, data); return hydrate(getState()); },
    },
    prescriptionPrintEvent: { create: async ({ data }: any) => { getState().events.push(data); return data; }, findMany: async () => getState().events },
    drug: { findMany: async () => [] },
    prescriptionTemplate: {
      count: async ({ where }: any) => getState().templates.filter((t: any) => !where.name || t.name.toLowerCase() === where.name.equals.toLowerCase()).length,
      findMany: async () => getState().templates,
      findFirst: async ({ where }: any) => getState().templates.find((t: any) => t.id === where.id),
      findUnique: async ({ where }: any) => getState().templates.find((t: any) => t.id === where.id),
      create: async ({ data }: any) => { const t = { id: `test-template-${getState().templates.length + 1}`, ...data }; getState().templates.push(t); return t; },
      delete: async ({ where }: any) => { getState().templates = getState().templates.filter((t: any) => t.id !== where.id); },
    },
    templateUsage: { create: async ({ data }: any) => data, deleteMany: async () => ({ count: 0 }) },
    prescriptionTemplateVersion: { findMany: async () => [] },
    layoutVariant: { updateMany: async () => ({ count: 0 }) },
    idempotencyRecord: {
      findFirst: async ({ where }: any) => cache.find(row => Object.entries(where).every(([k, v]) => row[k] === v)),
      create: async ({ data }: any) => { cache.push(data); return data; },
    },
  });

  beforeAll(async () => {
    state = { visit: { id: payload.visitId, patientId: patient.id, doctorId: doctor.id, history: '{}', exam: '{}', plan: '{}', diagnosis: '[]', complaints: '[]' }, rx: null, events: [], templates: [] };
    const db = client(() => state);
    db.$transaction = async (fn: any) => {
      const draft = structuredClone(state);
      const result = await fn(client(() => draft));
      state = draft;
      return result;
    };
    const module = await Test.createTestingModule({
      controllers: [PrescriptionsController],
      providers: [{ provide: PrescriptionsService, useValue: new PrescriptionsService(db, {} as any) }],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    if (process.env.RX_BROWSER_TEST === '1') {
      app.use(express.json());
      app.use(async (req: any, res: any, next: any) => {
        const path = req.path;
        if (path === '/auth/me' || path === `/users/${doctor.id}`) return res.json(doctor);
        if (path === '/patients') return res.json({ patients: [patient], total: 1 });
        if (path === `/patients/${patient.id}`) return res.json(patient);
        if (path === '/users') return res.json({ users: [doctor] });
        if (path === `/visits/${payload.visitId}`) {
          if (req.method === 'PATCH') {
            try { await new VisitsService(db).update(payload.visitId, req.body, patient.branchId); }
            catch (e: any) { return res.status(e.status || 500).json({ message: e.message }); }
          }
          return res.json({ ...state.visit, patient, doctor, prescription: state.rx ? { ...state.rx, items: JSON.parse(state.rx.items) } : null });
        }
        if (path.startsWith('/visits/patient/')) return res.json({ visits: [], pagination: { hasMore: false } });
        if (['/prescriptions/assets', '/prescriptions/printer-profiles', '/prescriptions/fields/autocomplete', '/prescriptions/drugs/autocomplete', '/drugs/autocomplete', '/whatsapp-templates'].includes(path)) return res.json([]);
        if (path.startsWith('/prescriptions/doctor/')) return res.json({ prescriptions: [] });
        if (path === '/reports/alerts') return res.json([]);
        if (path.endsWith('/next-appointment')) return res.json(null);
        if (path === '/billing/invoices') return res.json({ invoices: [] });
        if (path === '/drugs') return res.json({ drugs: [] });
        next();
      });
    }
    app.use((req: any, _res: any, next: () => void) => { req.user = { ...doctor }; next(); });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new IdempotencyInterceptor(db));
    await app.listen(0, '127.0.0.1');
    api = new ApiClient(await app.getUrl());
  });

  afterAll(async () => { await app?.close(); });

  (process.env.RX_BROWSER_TEST === '1' ? it : it.skip)('runs the Chromium prescription download workflow', async () => {
    state.rx = null;
    state.visit.diagnosis = '[]';
    cache.length = 0;
    await new Promise<void>((resolveRun, reject) => {
      const child = spawn(process.execPath, [resolve(__dirname, '../../../../../scripts/diagnostics/prescription-browser.cjs')], {
        env: { ...process.env, RX_TEST_API_URL: api['baseURL'], RX_TEST_VISIT_ID: payload.visitId }, stdio: 'inherit',
      });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Browser workflow exceeded 4 minutes')); }, 240000);
      child.on('error', reject);
      child.on('exit', code => { clearTimeout(timer); code === 0 ? resolveRun() : reject(new Error(`Browser workflow failed (${code})`)); });
    });
  }, 250000);

  (process.env.RX_BROWSER_TEST === '1' ? it.skip : it)('creates, reads back, retries, edits A -> B -> A, and renders current PDF contents', async () => {
    const created = await api.createPrescriptionAndPdf(payload, { idempotencyKey: 'pipeline-create' });
    expect(created.prescription.id).toBe('pipeline-rx');
    const readback: any = await api.getPrescription('pipeline-rx');
    expect(readback.items).toMatchObject(payload.items);
    expect(JSON.parse(state.visit.diagnosis)).toEqual(payload.clinicalData.diagnosis);
    const replay = await api.createPrescriptionAndPdf(payload, { idempotencyKey: 'pipeline-create' });
    expect(replay.prescription.id).toBe(created.prescription.id);

    const verifyPdf = (pdf: any, expected: string, file: string) => {
      const bytes = Buffer.from(pdf.fileUrl.split(',')[1], 'base64');
      expect(bytes.length).toBe(pdf.fileSize);
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      const text = execFileSync(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-', '-'], { input: bytes }).toString();
      expect(text).toContain(patient.name);
      expect(text).toContain('Test Doctor');
      expect(text).toContain(expected);
      const dir = resolve(__dirname, '../../../../../output/pdf');
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, file), bytes);
      return text;
    };
    verifyPdf(created.pdf, payload.items[0].drugName, 'prescription-pipeline.pdf');
    for (const name of ['TEST VERSION A', 'TEST VERSION B', 'TEST VERSION A']) {
      await api.updatePrescription('pipeline-rx', { items: [{ ...payload.items[0], drugName: name }] });
      const pdf = await api.generatePrescriptionPdf('pipeline-rx');
      verifyPdf(pdf, name, 'prescription-pipeline-updated.pdf');
    }
    expect(state.events).toHaveLength(5);
    await expect(api.post('/prescriptions', payload)).rejects.toMatchObject({ status: 400, message: 'Missing Idempotency-Key header' });
    await expect(api.generatePrescriptionPdf('missing')).rejects.toMatchObject({ status: 404 });
  });
});
