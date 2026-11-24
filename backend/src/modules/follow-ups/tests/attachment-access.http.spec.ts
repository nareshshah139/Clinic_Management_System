import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { FollowUpsController } from '../follow-ups.controller';
import { FollowUpsService } from '../follow-ups.service';

describe('GET /follow-ups/attachments/:id admits the Follow-ups roles only (PP-47, PP-87)', () => {
  let app: INestApplication;
  const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const followUps = { attachment: jest.fn(async () => photo) };

  beforeAll(async () => {
    const auth = { canActivate: (ctx: any) => {
      const req = ctx.switchToHttp().getRequest();
      req.user = { id: 'staff', branchId: 'A', role: req.headers['x-role'] };
      return true;
    } };
    const module = await Test.createTestingModule({
      controllers: [FollowUpsController],
      providers: [
        { provide: FollowUpsService, useValue: followUps },
        { provide: APP_GUARD, useValue: auth },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).overrideGuard(JwtAuthGuard).useValue(auth).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => followUps.attachment.mockClear());

  it.each(['PHARMACIST', 'ACCOUNTANT'])('refuses a %s with 403 and never reads the photo', async (role) => {
    await request(app.getHttpServer()).get('/follow-ups/attachments/photo-1').set('x-role', role).expect(403);
    expect(followUps.attachment).not.toHaveBeenCalled();
  });

  it.each(['DOCTOR', 'NURSE', 'RECEPTION', 'MANAGER', 'ADMIN', 'OWNER'])('serves a %s the photo, private and uncached', async (role) => {
    const res = await request(app.getHttpServer()).get('/follow-ups/attachments/photo-1').set('x-role', role).expect(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(res.body)).toEqual(photo);
    expect(followUps.attachment).toHaveBeenCalledWith('photo-1', 'A');
  });
});
