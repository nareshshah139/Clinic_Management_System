import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import requestHttp from 'supertest';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { ReviewBookingService } from '../review-booking';
import { VisitsController } from '../visits.controller';
import { VisitsService } from '../visits.service';

jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));

describe('patient photo responses', () => {
  let app: INestApplication;
  const photo = {
    data: Buffer.from('synthetic-photo'),
    contentType: 'image/jpeg',
  };

  beforeAll(async () => {
    const service = {
      getVisitAttachmentBinary: async () => photo,
      getDraftAttachmentBinary: async () => photo,
    };
    const module = await Test.createTestingModule({
      controllers: [VisitsController],
      providers: [
        { provide: VisitsService, useValue: service },
        { provide: ReviewBookingService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      req.user = { id: 'staff', branchId: 'branch', role: 'DOCTOR' };
      next();
    });
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it.each([
    '/visits/visit/photos/attachment',
    '/visits/photos/draft/patient/20261005/attachment',
  ])('tells every cache not to keep %s', async (url) => {
    const res = await requestHttp(app.getHttpServer()).get(url).expect(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(res.body).toString()).toBe('synthetic-photo');
  });
});
