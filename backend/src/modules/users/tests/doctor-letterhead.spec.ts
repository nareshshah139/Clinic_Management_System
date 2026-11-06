import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import { UsersController } from '../users.controller';
import { UsersService } from '../users.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { PrescriptionsService } from '../../prescriptions/prescriptions.service';
import { BUNDLED_LETTERHEAD_URL } from '../doctor-letterhead';

const DOCTORS: Record<string, { firstName: string; lastName: string }> = {
  praneeta: { firstName: 'Dr. Praneeta', lastName: 'Jain' },
  rahul: { firstName: 'Rahul', lastName: 'Mehta' },
};

describe('Per-doctor letterheads', () => {
  let app: INestApplication;
  let assets: any[];
  let png: Buffer;
  let sequence = 0;
  const matches = (asset: any, where: any) => Object.entries(where).every(([key, value]) =>
    key === 'owner' ? DOCTORS[asset.ownerId] && asset.branchId === (value as any).branchId : asset[key] === value);
  const db: any = {
    user: { findFirst: jest.fn(async ({ where }) => where.branchId === 'branch' && DOCTORS[where.id] && (where.role ?? 'DOCTOR') === 'DOCTOR'
      ? { id: where.id, ...DOCTORS[where.id] } : null) },
    clinicAsset: {
      findFirst: jest.fn(async ({ where }) => [...assets].reverse().find(asset => matches(asset, where)) || null),
      updateMany: jest.fn(async ({ where, data }) => { const hit = assets.filter(asset => matches(asset, where)); hit.forEach(asset => Object.assign(asset, data)); return { count: hit.length }; }),
      create: jest.fn(async ({ data }) => { const asset = { id: `asset-${++sequence}`, isActive: true, ...data }; assets.push(asset); return asset; }),
      update: jest.fn(), delete: jest.fn(),
    },
  };
  db.$transaction = async (fn: any) => fn(db);
  const prescriptions = new PrescriptionsService(db, {} as any);

  const as = (user: string, role = 'DOCTOR') => ({ 'x-user': user, 'x-role': role });
  const read = (doctor: string, by = doctor) => request(app.getHttpServer()).get(`/users/${doctor}/letterhead`).set(as(by));
  const upload = (user: string, file: Buffer, name = 'letterhead.png', role = 'DOCTOR') =>
    request(app.getHttpServer()).post('/users/me/letterhead').set(as(user, role)).attach('file', file, name);
  const remove = (user: string, role = 'DOCTOR') => request(app.getHttpServer()).delete('/users/me/letterhead').set(as(user, role));

  beforeAll(async () => {
    png = await sharp({ create: { width: 800, height: 1100, channels: 4, background: { r: 20, g: 80, b: 140, alpha: 1 } } }).png().toBuffer();
    const module = await Test.createTestingModule({ controllers: [UsersController], providers: [
      { provide: UsersService, useValue: new UsersService(db, {} as any) },
    ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => {
      const req = context.switchToHttp().getRequest();
      if (!req.headers['x-user']) return false;
      req.user = { id: req.headers['x-user'], role: req.headers['x-role'], branchId: 'branch' };
      return true;
    } }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => { assets = []; });

  it('keeps the bundled letterhead for Dr. Praneeta Jain', async () => {
    const res = await read('praneeta');
    expect(res.body.letterhead).toEqual({ id: 'default:praneeta', url: BUNDLED_LETTERHEAD_URL, source: 'bundled' });
  });

  it('never gives another doctor Dr. Praneeta Jain\'s letterhead', async () => {
    expect((await read('rahul')).body.letterhead).toBeNull();
    expect((await read('rahul', 'praneeta')).body.letterhead).toBeNull();
  });

  it('prints each doctor on their own uploaded letterhead', async () => {
    const uploaded = await upload('rahul', png);
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.letterhead.url).toMatch(/^data:image\/jpeg;base64,/);
    const own = (await read('rahul')).body.letterhead;
    expect(own).toMatchObject({ source: 'uploaded', url: uploaded.body.letterhead.url });
    expect((await read('praneeta')).body.letterhead.url).toBe(BUNDLED_LETTERHEAD_URL);
  });

  it('lets Dr. Praneeta Jain replace and then remove her letterhead without the default coming back', async () => {
    await upload('praneeta', png);
    expect((await read('praneeta')).body.letterhead.source).toBe('uploaded');
    expect((await remove('praneeta')).body).toEqual({ letterhead: null });
    expect((await read('praneeta')).body.letterhead).toBeNull();
  });

  it('allows only the logged-in doctor to change a letterhead', async () => {
    expect((await upload('reception', png, 'letterhead.png', 'RECEPTION')).status).toBe(403);
    expect((await remove('praneeta', 'ADMIN')).status).toBe(403);
    expect(assets).toHaveLength(0);
  });

  it('rejects files that are not PNG or JPG images', async () => {
    const res = await upload('rahul', Buffer.from('not an image'), 'letterhead.txt');
    expect(res.status).toBe(400);
    expect(assets).toHaveLength(0);
  });

  it('blocks the shared asset editor from changing a doctor letterhead', async () => {
    await expect(prescriptions.upsertClinicAsset('branch', 'rahul', { type: 'LETTERHEAD' as any, name: 'x', url: 'data:' })).rejects.toThrow('letterhead');
    await upload('rahul', png);
    const id = assets[0].id;
    await expect(prescriptions.deleteClinicAsset('branch', id)).rejects.toThrow('letterhead');
    await expect(prescriptions.upsertClinicAsset('branch', 'rahul', { id, type: 'LOGO', name: 'x', url: 'data:' })).rejects.toThrow('letterhead');
  });
});
