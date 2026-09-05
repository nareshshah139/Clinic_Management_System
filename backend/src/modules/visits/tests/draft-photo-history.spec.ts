import { VisitsService } from '../visits.service';
it('lists drafts from every saved date with their original URLs and without modifying records', async () => {
  const db: any = { patient: { findFirst: jest.fn().mockResolvedValue({ id: 'p' }) }, draftAttachment: {
    findMany: jest.fn().mockResolvedValue([
      { id: 'a', dateStr: '20250101', createdAt: new Date('2025-01-01'), position: 'FRONT', displayOrder: 0 },
      { id: 'b', dateStr: '20240101', createdAt: new Date('2024-01-01'), position: 'OTHER', displayOrder: 1 },
    ]),
  } };
  const result = await new VisitsService(db).listAllDraftAttachments('p', 'branch');
  expect(result.items.map(item => item.url)).toEqual(['/visits/photos/draft/p/20250101/a', '/visits/photos/draft/p/20240101/b']);
  expect(db.patient.findFirst).toHaveBeenCalledWith({ where: { id: 'p', branchId: 'branch' }, select: { id: true } });
  expect(db.draftAttachment.findMany.mock.calls[0][0].where).toEqual({ patientId: 'p' });
  expect(db.draftAttachment.findMany.mock.calls[0][0].select).not.toHaveProperty('data');
});
it('does not expose another branch’s draft photos', async () => {
  const db: any = { patient: { findFirst: jest.fn().mockResolvedValue(null) }, draftAttachment: { findMany: jest.fn() } };
  await expect(new VisitsService(db).listAllDraftAttachments('p', 'other-branch')).rejects.toThrow('Patient not found in this branch');
  expect(db.draftAttachment.findMany).not.toHaveBeenCalled();
});
