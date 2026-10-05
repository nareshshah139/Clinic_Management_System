import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import requestHttp from 'supertest';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { VisitsController } from '../visits.controller';
import { VisitsService } from '../visits.service';

jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));

const request = { branchId: 'active-branch', user: { id: 'staff', branchId: 'home-branch', role: 'DOCTOR' } };
function controller() {
  const db: any = {
    patient: { findFirst: async ({ where }: any) => where.id === 'foreign-patient' && where.branchId === 'home-branch' ? { id: where.id } : null },
    draftAttachment: {
      findMany: async () => [],
      findFirst: async () => { throw new Error('Foreign storage was accessed'); },
      create: async () => { throw new Error('Foreign storage was accessed'); },
      delete: async () => { throw new Error('Foreign storage was accessed'); },
    },
  };
  return new VisitsController(new VisitsService(db));
}

it('uses the active request branch for upload, list, binary and deletion before attachment access', async () => {
  const api = controller();
  await expect(api.uploadDraftPhotos('foreign-patient', [], request)).rejects.toThrow(NotFoundException);
  await expect(api.listDraftPhotos('foreign-patient', 'false', request)).rejects.toThrow(NotFoundException);
  await expect(api.listDraftPhotos('foreign-patient', 'true', request)).rejects.toThrow(NotFoundException);
  await expect(api.getDraftPhoto('foreign-patient', '20261005', 'file', request)).rejects.toThrow(NotFoundException);
  await expect(api.deleteDraftPhoto('foreign-patient', '20261005', 'file', request)).rejects.toThrow(NotFoundException);
});

it('supports the existing authenticated user branch when no request branch is installed', async () => {
  expect(await controller().listDraftPhotos('foreign-patient', 'true', { user: request.user })).toEqual({ attachments: [], items: [] });
});

it('routes legacy deletion correctly and returns the mutation version instead of a later list version', async () => {
  const service = {
    deleteLegacyAttachment: async (_id: string, url: string, branchId: string) => {
      if (url !== '/uploads/visits/test.jpg' || branchId !== 'active-branch') throw new Error('Wrong deletion target');
      return { ok: true, visitVersion: 2 };
    },
    deleteVisitAttachment: async () => ({ ok: true, visitVersion: 3 }),
    listAttachments: async () => ({ items: [], attachments: [], visitVersion: 8 }),
  };
  const module = await Test.createTestingModule({ controllers: [VisitsController], providers: [{ provide: VisitsService, useValue: service }] })
    .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true }).compile();
  const app = module.createNestApplication();
  app.use((req: any, _res: any, next: () => void) => { Object.assign(req, request); next(); });
  await app.init();
  try {
    const legacy = await requestHttp(app.getHttpServer()).delete('/visits/visit/photos/legacy').send({ url: '/uploads/visits/test.jpg' }).expect(200);
    expect(legacy.body).toEqual({ items: [], attachments: [], visitVersion: 2 });
    const binary = await requestHttp(app.getHttpServer()).delete('/visits/visit/photos/file-id').expect(200);
    expect(binary.body).toEqual({ items: [], attachments: [], visitVersion: 3 });
  } finally { await app.close(); }
});
