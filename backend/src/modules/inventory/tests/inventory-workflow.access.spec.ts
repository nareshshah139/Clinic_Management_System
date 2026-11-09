import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InventoryIntakeService } from '../inventory-intake.service';
import { InventoryLabelService } from '../inventory-label.service';
import { InventoryReplenishmentService } from '../inventory-replenishment.service';
import { InventoryWorkflowController } from '../inventory-workflow.controller';
import { InventoryWorkflowScheduler } from '../inventory-workflow-scheduler.service';
import { InventoryWorkflowService } from '../inventory-workflow.service';
import { InventoryWorkspaceService } from '../inventory-workspace.service';
import { accessApp } from './inventory-access-app';

const base = '/inventory/workspace';

describe('/inventory/workspace access control', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const read = (user: string) =>
    http().get(`${base}/stock`).set('x-user', user);
  const batchChange = (user: string) =>
    http()
      .patch(`${base}/stock/item`)
      .set('x-user', user)
      .send({ location: 'Shelf A' });
  const bulkChange = (user: string) =>
    http().post(`${base}/stock/bulk-location`).set('x-user', user).send({});

  beforeAll(async () => {
    app = await accessApp(InventoryWorkflowController, [
      InventoryWorkflowService,
      InventoryWorkspaceService,
      { provide: InventoryReplenishmentService, useValue: {} },
      { provide: InventoryWorkflowScheduler, useValue: {} },
      { provide: InventoryIntakeService, useValue: {} },
      { provide: InventoryLabelService, useValue: {} },
    ]);
  });
  afterAll(() => app.close());

  it.each(['owner', 'admin', 'doctor'])(
    'lets %s read stock and change a batch',
    async (user) => {
      await read(user).expect(200);
      await batchChange(user).expect(200);
      const bulk = await bulkChange(user);
      expect(bulk.status).toBe(400);
    },
  );

  it.each(['receptionNoGrants', 'nurseNoGrants', 'patientNoGrants'])(
    'refuses %s with no inventory permission',
    async (user) => {
      await read(user).expect(403);
      await batchChange(user).expect(403);
      await bulkChange(user).expect(403);
    },
  );

  it('refuses a patient account even with every inventory permission granted', async () => {
    await read('patient').expect(403);
    await batchChange('patient').expect(403);
    await bulkChange('patient').expect(403);
  });

  it('lets a non-manager with the read permission read but not change stock', async () => {
    await read('pharmacistReader').expect(200);
    await batchChange('pharmacistReader').expect(403);
    await bulkChange('pharmacistReader').expect(403);
  });

  it('lets a non-manager with the update permission change a batch', async () => {
    await batchChange('pharmacistStocker').expect(200);
    expect((await bulkChange('pharmacistStocker')).status).toBe(400);
  });

  it('refuses a token whose role differs from the stored role', async () => {
    await read('receptionNoGrants').set('x-token-role', 'ADMIN').expect(403);
  });

  it('refuses a token from a branch the user does not belong to', async () => {
    await read('doctor').set('x-branch', 'other-branch').expect(403);
  });

  it.each(['owner', 'admin', 'doctor', 'pharmacistStocker'])(
    'offers no delete route to %s',
    async (user) => {
      await http().delete(`${base}/stock/item`).set('x-user', user).expect(404);
      await http()
        .delete(`${base}/documents/doc`)
        .set('x-user', user)
        .expect(404);
    },
  );
});
