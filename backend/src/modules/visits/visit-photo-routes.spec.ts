import { Test } from '@nestjs/testing';
import request from 'supertest';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));

it('routes legacy photo deletion to the legacy handler', async () => {
  const service = {
    deleteLegacyAttachment: jest.fn(),
    deleteVisitAttachment: jest.fn(),
    listAttachments: jest.fn().mockResolvedValue({ items: [] }),
  };
  const module = await Test.createTestingModule({
    controllers: [VisitsController],
    providers: [{ provide: VisitsService, useValue: service }],
  }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => {
    context.switchToHttp().getRequest().user = { id: 'doctor', role: 'DOCTOR', branchId: 'branch' };
    return true;
  } }).compile();
  const app = module.createNestApplication();
  await app.init();
  try {
    await request(app.getHttpServer()).delete('/visits/visit-1/photos/legacy')
      .send({ url: '/uploads/old.jpg' }).expect(200);
    expect(service.deleteLegacyAttachment).toHaveBeenCalledWith('visit-1', '/uploads/old.jpg', 'branch');
    expect(service.deleteVisitAttachment).not.toHaveBeenCalled();
    await request(app.getHttpServer()).delete('/visits/visit-1/photos/attachment-1').expect(200);
    expect(service.deleteVisitAttachment).toHaveBeenCalledWith('visit-1', 'attachment-1', 'branch');
    await request(app.getHttpServer()).delete('/visits/visit-1/photos/legacy').send({}).expect(400);
    expect(service.deleteLegacyAttachment).toHaveBeenCalledTimes(1);
  } finally {
    await app.close();
  }
});
