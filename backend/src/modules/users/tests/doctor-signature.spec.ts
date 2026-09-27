import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import { UsersController } from '../users.controller';
import { UsersService } from '../users.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { PrescriptionsService } from '../../prescriptions/prescriptions.service';
import { PrescriptionsController } from '../../prescriptions/prescriptions.controller';
import express from 'express';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { cpSync, mkdirSync, mkdtempSync, symlinkSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('Doctor signature authorization, uploads and exports', () => {
  let app: INestApplication;
  let assets: any[];
  let png: Buffer;
  let jpeg: Buffer;
  let activeDoctor: boolean;
  let sequence = 0;
  const notifications = { sendEmail: jest.fn(), sendWhatsAppDocument: jest.fn(), sendWhatsApp: jest.fn() };
  const events: any[] = [];
  const matches = (asset: any, where: any) => Object.entries(where).every(([key, value]) => key === 'owner' ? activeDoctor && asset.branchId === (value as any).branchId : asset[key] === value);
  const db: any = {
    user: { findFirst: jest.fn(async ({ where }) => activeDoctor && where.branchId === 'branch' && where.id.startsWith('doctor') && where.role === 'DOCTOR'
      ? { id: where.id, firstName: where.id === 'doctor-1' ? 'Praneeta' : 'Another', lastName: 'Jain' } : null) },
    clinicAsset: {
      findFirst: jest.fn(async ({ where }) => [...assets].reverse().find(asset => matches(asset, where)) || null),
      updateMany: jest.fn(async ({ where, data }) => { assets.filter(asset => matches(asset, where)).forEach(asset => Object.assign(asset, data)); return { count: 1 }; }),
      create: jest.fn(async ({ data }) => { const asset = { id: `signature-${++sequence}`, isActive: true, ...data }; assets.push(asset); return asset; }),
      update: jest.fn(), delete: jest.fn(),
    },
    prescription: { findFirst: jest.fn(async ({ where }) => where.id === 'rx' && where.visit.patient.branchId === 'branch' ? {
      id: 'rx', items: '[]', visit: { doctorId: 'doctor-1', doctor: { id: 'doctor-1', firstName: 'Praneeta', lastName: 'Jain' }, patient: { name: 'SYNTHETIC PATIENT' } },
    } : null) },
    prescriptionPrintEvent: { create: jest.fn(async ({ data }) => { events.push(data); return data; }) },
  };
  db.$transaction = async (fn: any) => fn(db);

  beforeAll(async () => {
    png = await sharp({ create: { width: 40, height: 20, channels: 4, background: { r: 10, g: 20, b: 60, alpha: 0.5 } } }).png().toBuffer();
    jpeg = await sharp(png).jpeg().toBuffer();
    const module = await Test.createTestingModule({ controllers: [UsersController, PrescriptionsController], providers: [
      { provide: UsersService, useValue: new UsersService(db, {} as any) },
      { provide: PrescriptionsService, useValue: new PrescriptionsService(db, notifications as any) },
    ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => {
      const req = context.switchToHttp().getRequest();
      if (process.env.CR06_BROWSER_TEST === '1' && req.headers.cookie?.includes('auth_token=synthetic-signature')) {
        req.user = { id: 'doctor-1', role: 'DOCTOR', branchId: 'branch' };
        return true;
      }
      if (!req.headers['x-user']) return false;
      req.user = { id: req.headers['x-user'], role: req.headers['x-role'] || 'DOCTOR', branchId: req.headers['x-branch'] || 'branch' };
      return true;
    } }).compile();
    app = module.createNestApplication();
    if (process.env.CR06_BROWSER_TEST === '1') {
      const patient = { id: '00000000-0000-4000-8000-000000000001', name: 'SYNTHETIC SIGNATURE TEST', branchId: 'branch', gender: 'FEMALE', phone: '+10000000000', email: 'synthetic@example.test' };
      const doctor = { id: 'doctor-1', firstName: 'Praneeta', lastName: 'Jain', role: 'DOCTOR', branchId: 'branch', isActive: true };
      const prescription = { id: 'rx', items: [{ drugName: 'SYNTHETIC TEST MEDICINE', dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 7, durationUnit: 'DAYS' }] };
      const visit = { id: '00000000-0000-4000-8000-000000000003', patientId: patient.id, doctorId: doctor.id, date: new Date().toISOString(), history: '{}', exam: '{}', plan: '{}', diagnosis: '[]', complaints: '[]', prescription, patient, doctor };
      app.use(express.json());
      app.use((req: any, res: any, next: any) => {
        const path = req.path;
        if (path === '/auth/me' || path === '/users/doctor-1') return res.json(doctor);
        if (path === '/patients') return res.json({ patients: [patient], total: 1 });
        if (path === '/patients/00000000-0000-4000-8000-000000000001') return res.json(patient);
        if (path === '/users') return res.json({ users: [doctor] });
        if (path === '/visits/00000000-0000-4000-8000-000000000003') { if (req.method === 'PATCH') Object.assign(visit, req.body); return res.json(visit); }
        if (path === '/prescriptions/rx') { if (req.method === 'PATCH') Object.assign(prescription, req.body); return res.json(prescription); }
        if (path.startsWith('/visits/patient/')) return res.json({ visits: [], pagination: { hasMore: false } });
        if (['/prescriptions/assets', '/prescriptions/printer-profiles', '/prescriptions/fields/autocomplete', '/prescriptions/drugs/autocomplete', '/drugs/autocomplete', '/whatsapp-templates', '/whatsapp/templates'].includes(path)) return res.json([]);
        if (path === '/prescriptions/templates' || path === '/prescriptions/templates/combined') return res.json({ templates: [] });
        if (path.startsWith('/prescriptions/doctor/')) return res.json({ prescriptions: [] });
        if (path === '/prescriptions/rx/print-events' && req.method === 'GET') return res.json({ totals: {} });
        if (path === '/reports/alerts') return res.json([]);
        if (path.endsWith('/next-appointment')) return res.json(null);
        if (path === '/billing/invoices') return res.json({ invoices: [] });
        if (path === '/drugs') return res.json({ drugs: [] });
        next();
      });
    }
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => { assets = []; events.length = 0; activeDoctor = true; jest.clearAllMocks(); });
  const upload = (user = 'doctor-1', role = 'DOCTOR', buffer?: Buffer, type = 'image/png') => request(app.getHttpServer()).post('/users/me/signature')
    .set('x-user', user).set('x-role', role).attach('file', buffer || png, { filename: 'signature.png', contentType: type });

  it('serves the supplied default PNG only for Dr. Praneeta Jain in the requested branch', async () => {
    const response = await request(app.getHttpServer()).get('/users/doctor-1/signature').set('x-user', 'staff').expect(200);
    const expected = readFileSync(resolve(__dirname, '../assets/Dr_Praneeta_Jain_signature.png'));
    expect(Buffer.from(response.body.signature.url.split(',')[1], 'base64')).toEqual(expected);
    expect(response.body.signature).toMatchObject({ id: 'default:doctor-1', width: 548, height: 350 });
    expect((await sharp(expected).metadata()).hasAlpha).toBe(true);
    expect(assets).toHaveLength(0);
    for (const [doctor, branch] of [['doctor-2', 'branch'], ['doctor-1', 'other'], ['missing', 'branch']]) {
      const result = await request(app.getHttpServer()).get(`/users/${doctor}/signature`).set('x-user', 'staff').set('x-branch', branch).expect(200);
      expect(result.body.signature).toBeNull();
    }
    activeDoctor = false;
    expect((await request(app.getHttpServer()).get('/users/doctor-1/signature').set('x-user', 'staff')).body.signature).toBeNull();
  });

  it('persists default removal and lets the doctor replace it with an upload', async () => {
    await request(app.getHttpServer()).delete('/users/me/signature').set('x-user', 'doctor-1').expect(200);
    expect((await request(app.getHttpServer()).get('/users/doctor-1/signature').set('x-user', 'staff')).body.signature).toBeNull();
    const uploaded = await upload().expect(201);
    expect((await request(app.getHttpServer()).get('/users/doctor-1/signature').set('x-user', 'staff')).body.signature.url).toBe(uploaded.body.signature.url);
    await request(app.getHttpServer()).delete('/users/me/signature').set('x-user', 'doctor-1').expect(200);
    expect((await request(app.getHttpServer()).get('/users/doctor-1/signature').set('x-user', 'staff')).body.signature).toBeNull();
  });

  it('uses the default in signed PDFs without an upload and omits it when unticked', async () => {
    for (const showSignature of [true, false]) {
      const response = await request(app.getHttpServer()).post('/prescriptions/rx/pdf').set('x-user', 'doctor-1').send({ showSignature }).expect(201);
      expect(Buffer.from(response.body.fileUrl.split(',')[1], 'base64').toString('latin1').includes('/Subtype /Image')).toBe(showSignature);
    }
    expect(assets).toHaveLength(0);
  });

  it('accepts PNG alpha, scopes ownership to the session, and replaces/removes only that doctor’s signature', async () => {
    await upload('doctor-2').expect(201);
    const response = await upload().field('ownerId', 'doctor-2').field('branchId', 'other').expect(201);
    expect(assets.at(-1).ownerId).toBe('doctor-1');
    const metadata = await sharp(Buffer.from(response.body.signature.url.split(',')[1], 'base64')).metadata();
    expect(metadata.hasAlpha).toBe(true);
    await upload('doctor-1', 'DOCTOR', jpeg, 'image/jpeg').expect(201);
    expect(assets.filter(asset => asset.ownerId === 'doctor-1' && asset.isActive)).toHaveLength(1);
    await request(app.getHttpServer()).delete('/users/me/signature').set('x-user', 'doctor-1').expect(200);
    expect(assets.filter(asset => asset.ownerId === 'doctor-1' && asset.isActive)).toHaveLength(0);
    expect(assets.filter(asset => asset.ownerId === 'doctor-2' && asset.isActive)).toHaveLength(1);
  });

  it.each(['RECEPTION', 'NURSE', 'ADMIN', 'OWNER'])('rejects %s signature upload and removal', async role => {
    await upload('doctor-1', role).expect(403);
    await request(app.getHttpServer()).delete('/users/me/signature').set('x-user', 'doctor-1').set('x-role', role).expect(403);
    expect(db.clinicAsset.create).not.toHaveBeenCalled();
    expect(db.clinicAsset.updateMany).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated and inactive doctors, and provides no endpoint to upload for another doctor', async () => {
    await request(app.getHttpServer()).post('/users/me/signature').attach('file', png, 'signature.png').expect(403);
    activeDoctor = false;
    await upload().expect(403);
    await request(app.getHttpServer()).post('/users/doctor-2/signature').set('x-user', 'doctor-1').attach('file', png, 'signature.png').expect(404);
  });

  it('rejects missing, corrupt, oversized and disguised non-raster uploads', async () => {
    await request(app.getHttpServer()).post('/users/me/signature').set('x-user', 'doctor-1').expect(400);
    await upload('doctor-1', 'DOCTOR', Buffer.from('not an image')).expect(400);
    await upload('doctor-1', 'DOCTOR', Buffer.alloc(2 * 1024 * 1024 + 1)).expect(413);
    await upload('doctor-1', 'DOCTOR', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"></svg>')).expect(400);
    await upload('doctor-1', 'DOCTOR', png, 'image/svg+xml').expect(400);
    expect(assets).toHaveLength(0);
  });

  it('reads only the requested doctor in the current branch and rejects unsafe legacy URLs', async () => {
    await upload().expect(201);
    const own = await request(app.getHttpServer()).get('/users/doctor-1/signature').set('x-user', 'staff').expect(200);
    expect(own.body.signature.url).toMatch(/^data:image\/png;base64,/);
    for (const [doctor, branch] of [['doctor-2', 'branch'], ['doctor-1', 'other']]) {
      const result = await request(app.getHttpServer()).get(`/users/${doctor}/signature`).set('x-user', 'staff').set('x-branch', branch).expect(200);
      expect(result.body.signature).toBeNull();
    }
    assets[0].url = 'https://example.test/signature.svg';
    expect((await request(app.getHttpServer()).get('/users/doctor-1/signature').set('x-user', 'staff')).body.signature).toBeNull();
  });

  it('prevents creating, retyping, or deleting signatures through generic assets', async () => {
    const response = await upload().expect(201);
    const signature = response.body.signature;
    for (const payload of [{ type: 'SIGNATURE', url: signature.url, name: 'New' }, { id: signature.id, type: 'LOGO', url: signature.url, name: 'Rename bypass' }]) {
      await request(app.getHttpServer()).post('/prescriptions/assets').set('x-user', 'doctor-2').send(payload).expect(403);
    }
    await request(app.getHttpServer()).delete(`/prescriptions/assets/${signature.id}`).set('x-user', 'doctor-2').expect(403);
    await request(app.getHttpServer()).post('/prescriptions/assets').set('x-user', 'doctor-2').set('x-branch', 'other').send({ id: signature.id, type: 'LOGO', url: signature.url }).expect(404);
    expect(db.clinicAsset.update).not.toHaveBeenCalled();
    expect(db.clinicAsset.delete).not.toHaveBeenCalled();
  });

  it('embeds the prescribing doctor’s signature only when requested in generated PDF and server shares', async () => {
    await upload().expect(201);
    await upload('doctor-2').expect(201);
    for (const showSignature of [false, true, false]) {
      const response = await request(app.getHttpServer()).post('/prescriptions/rx/pdf').set('x-user', 'doctor-2').send({ showSignature }).expect(201);
      const bytes = Buffer.from(response.body.fileUrl.split(',')[1], 'base64');
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(bytes.toString('latin1').includes('/Subtype /Image')).toBe(showSignature);
      if (showSignature) expect(db.clinicAsset.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerId: 'doctor-1', branchId: 'branch' }) }));
    }
    for (const channel of ['EMAIL', 'WHATSAPP']) {
      await request(app.getHttpServer()).post('/prescriptions/rx/share').set('x-user', 'doctor-1').send({ channel, to: 'synthetic@example.test', includePdf: true, showSignature: true }).expect(201);
    }
    expect(notifications.sendEmail.mock.calls[0][0].attachments[0].content.toString('latin1')).toContain('/Subtype /Image');
    expect(notifications.sendWhatsAppDocument.mock.calls[0][0].pdfBuffer.toString('latin1')).toContain('/Subtype /Image');
  });

  it('attaches the exact preview PDF bytes in Email and WhatsApp, with branch checks before sending', async () => {
    const pdf = Buffer.from('%PDF-1.7\nsynthetic preview bytes');
    for (const channel of ['EMAIL', 'WHATSAPP']) {
      await request(app.getHttpServer()).post('/prescriptions/rx/share-preview').set('x-user', 'doctor-1').field('channel', channel).field('to', 'synthetic@example.test').attach('file', pdf, { filename: 'preview.pdf', contentType: 'application/pdf' }).expect(201);
    }
    expect(notifications.sendEmail.mock.calls[0][0].attachments[0].content).toEqual(pdf);
    expect(notifications.sendWhatsAppDocument.mock.calls[0][0].pdfBuffer).toEqual(pdf);
    notifications.sendEmail.mockClear();
    await request(app.getHttpServer()).post('/prescriptions/rx/share-preview').set('x-user', 'doctor-1').set('x-branch', 'other').field('channel', 'EMAIL').field('to', 'synthetic@example.test').attach('file', pdf, { filename: 'preview.pdf', contentType: 'application/pdf' }).expect(404);
    await request(app.getHttpServer()).post('/prescriptions/rx/share-preview').set('x-user', 'doctor-1').field('channel', 'EMAIL').field('to', 'synthetic@example.test').attach('file', png, { filename: 'preview.pdf', contentType: 'application/pdf' }).expect(400);
    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });

  (process.env.CR06_BROWSER_TEST === '1' ? it : it.skip)('runs browser upload, print, PDF, WhatsApp and Email using the supplied PNG', async () => {
    const root = resolve(__dirname, '../../../../..');
    // Freeze the UI under test so concurrent workspace edits cannot hot-reload
    // a live paginated document midway through this acceptance workflow.
    const snapshot = mkdtempSync(resolve(tmpdir(), 'cr06-signature-'));
    const frontendDir = resolve(snapshot, 'frontend');
    mkdirSync(frontendDir);
    for (const entry of ['src', 'public', 'package.json', 'next.config.ts', 'tsconfig.json', 'tsconfig.build.json', 'postcss.config.mjs']) {
      cpSync(resolve(root, 'frontend', entry), resolve(frontendDir, entry), { recursive: true });
    }
    symlinkSync(resolve(root, 'node_modules'), resolve(snapshot, 'node_modules'), 'dir');
    symlinkSync(resolve(root, 'frontend/node_modules'), resolve(frontendDir, 'node_modules'), 'dir');
    const frontendPort = process.env.CR06_FRONTEND_PORT || '3016';
    const frontendUrl = `http://127.0.0.1:${frontendPort}`;
    const frontend = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--port', frontendPort, '--hostname', '127.0.0.1'], {
      cwd: frontendDir, env: { ...process.env, NEXT_PUBLIC_API_PROXY: await app.getUrl() }, stdio: 'inherit',
    });
    try {
      const deadline = Date.now() + 90000;
      while (true) {
        try { if ((await fetch(`${frontendUrl}/login`)).ok) break; } catch {}
        if (frontend.exitCode !== null || Date.now() > deadline) throw new Error('Signature test frontend did not start');
        await new Promise(resolveWait => setTimeout(resolveWait, 500));
      }
      await new Promise<void>((resolveRun, reject) => {
        const child = spawn(process.execPath, [resolve(root, 'scripts/diagnostics/cr06-signature-browser.cjs')], { env: process.env, stdio: 'inherit' });
        const timer = setTimeout(() => { child.kill(); reject(new Error('Signature browser test timed out')); }, 240000);
        child.on('error', reject);
        child.on('exit', code => { clearTimeout(timer); code === 0 ? resolveRun() : reject(new Error(`Signature browser failed (${code})`)); });
      });
      expect(notifications.sendEmail).toHaveBeenCalled();
      expect(notifications.sendEmail.mock.calls.at(-1)![0].attachments[0].content.subarray(0, 5).toString()).toBe('%PDF-');
    } finally {
      frontend.kill('SIGTERM');
      await Promise.race([
        new Promise(resolveExit => frontend.once('exit', resolveExit)),
        new Promise(resolveExit => setTimeout(resolveExit, 3000)),
      ]);
      if (frontend.exitCode === null) frontend.kill('SIGKILL');
      rmSync(snapshot, { recursive: true, force: true });
    }
  }, 350000);
});
