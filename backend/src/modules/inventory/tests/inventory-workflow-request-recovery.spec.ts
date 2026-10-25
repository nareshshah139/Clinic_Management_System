import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { InventoryWorkflowController } from '../inventory-workflow.controller';
import { InventoryWorkflowService } from '../inventory-workflow.service';
import { InventoryWorkspaceService } from '../inventory-workspace.service';
import { InventoryReplenishmentService } from '../inventory-replenishment.service';
import { InventoryWorkflowScheduler } from '../inventory-workflow-scheduler.service';
import { InventoryIntakeService } from '../inventory-intake.service';
import { InventoryLabelService } from '../inventory-label.service';

describe('Workflow request recovery lookup', () => {
  let app: INestApplication;
  let permissions: Set<string>;
  let branchId: string;
  let documents: any[];
  const mutate = jest.fn(() => { throw new Error('Lookup must not write'); });
  const prisma: any = { inventoryWorkflowDocument: {
    findUnique: jest.fn(async ({ where }: any) => documents.find(doc => doc.branchId === where.branchId_requestKey.branchId && doc.requestKey === where.branchId_requestKey.requestKey) || null),
    findFirst: jest.fn(async ({ where }: any) => documents.find(doc => doc.branchId === where.branchId && doc.id === where.id) || null),
    create: mutate, update: mutate,
  }, inventoryItem: {update: mutate}, stockTransaction: {create: mutate} };
  const service = new InventoryWorkflowService(prisma);
  beforeAll(async () => {
    jest.spyOn(service, 'permissions').mockImplementation(async () => permissions);
    const module = await Test.createTestingModule({
      controllers: [InventoryWorkflowController],
      providers: [
        {provide: InventoryWorkflowService, useValue: service},
        ...[InventoryWorkspaceService, InventoryReplenishmentService, InventoryWorkflowScheduler, InventoryIntakeService, InventoryLabelService].map(provide => ({provide,useValue:{}})),
      ],
    }).overrideGuard(JwtAuthGuard).useValue({canActivate:()=>true}).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: any) => {req.user = {id:'reader',branchId,role:'PHARMACIST'};next();});
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    branchId = 'clinic-a';
    permissions = new Set(['inventory:item:read']);
    documents = [{id:'saved-loss',requestKey:'retained-key',branchId:'clinic-a',kind:'LOSS',status:'POSTED',version:2,payload:{lines:[]},events:[{action:'POST',version:2}],effects:[{quantityDelta:-2}]}];
  });
  afterAll(async () => {await app.close();});
  it('recovers the saved identity and stock effects for a colleague with read access only', async () => {
    const response = await request(app.getHttpServer()).get('/inventory/workspace/documents/by-request/retained-key').expect(200);
    expect(response.body).toMatchObject({id:'saved-loss',kind:'LOSS',status:'POSTED',version:2,events:[{action:'POST',version:2}],effects:[{quantityDelta:-2}]});
    expect(mutate).not.toHaveBeenCalled();
  });
  it('uses the active branch when identical request keys exist elsewhere', async () => {
    documents.push({...documents[0],id:'other-clinic-loss',branchId:'clinic-b',status:'DRAFT',effects:[]});
    branchId = 'clinic-b';
    const response = await request(app.getHttpServer()).get('/inventory/workspace/documents/by-request/retained-key').expect(200);
    expect(response.body).toMatchObject({id:'other-clinic-loss',status:'DRAFT',effects:[]});
    expect(mutate).not.toHaveBeenCalled();
  });
  it('does not reveal another branch document or certify that missing means safe to repost', async () => {
    branchId = 'clinic-b';
    const response = await request(app.getHttpServer()).get('/inventory/workspace/documents/by-request/retained-key').expect(404);
    expect(response.body.message).toContain('outcome remains unconfirmed');
    expect(response.body).not.toHaveProperty('stockEffect');
    expect(response.body).not.toHaveProperty('id');
    expect(mutate).not.toHaveBeenCalled();
  });
  it('authorizes the saved document kind even if a caller supplies a more permissive kind', async () => {
    documents[0].kind = 'CREDIT_NOTE';
    await request(app.getHttpServer()).get('/inventory/workspace/documents/by-request/retained-key?kind=COUNT').expect(403);
    permissions = new Set(['pharmacy:purchase-ledger:read']);
    const response = await request(app.getHttpServer()).get('/inventory/workspace/documents/by-request/retained-key?kind=COUNT').expect(200);
    expect(response.body.kind).toBe('CREDIT_NOTE');
    expect(mutate).not.toHaveBeenCalled();
  });
});
