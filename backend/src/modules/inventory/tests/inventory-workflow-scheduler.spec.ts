import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { InventoryWorkflowScheduler } from '../inventory-workflow-scheduler.service';

const actor = { id: 'PRIVATE-actor', branchId: 'PRIVATE-branch', role: 'OWNER' };

describe('inventory automation outcome logging', () => {
  let service: InventoryWorkflowScheduler;
  let workflow: any, workspace: any, replenishment: any, prisma: any;
  let events: any[];
  let output: jest.SpyInstance;
  let record: jest.SpyInstance;
  beforeEach(() => {
    events = [];
    output = jest.spyOn(process.stdout, 'write').mockImplementation(((line: string) => { events.push(JSON.parse(line)); return true; }) as any);
    workflow = { settings: jest.fn().mockResolvedValue({ auditEnabled: true, autoMinMaxEnabled: true, autoPoEnabled: true, refreshDays: 1 }) };
    workspace = { createCount: jest.fn().mockResolvedValue({ id: 'PRIVATE-count' }) };
    replenishment = { proposeTargets: jest.fn().mockResolvedValue({ id: 'PRIVATE-target' }), autoPo: jest.fn().mockResolvedValue({ outcomes: [{ status: 'CREATED', documentId: 'PRIVATE-order' }] }) };
    prisma = { inventoryWorkflowSettings: { findMany: jest.fn() }, user: { findFirst: jest.fn() } };
    service = new InventoryWorkflowScheduler(prisma, workflow, workspace, replenishment);
    record = jest.spyOn(service as any, 'record').mockResolvedValue(undefined);
  });
  afterEach(() => output.mockRestore());

  it('links step outcomes to the persisted run without logging document or actor details', async () => {
    const run = await service.run(actor);
    expect(events).toHaveLength(4);
    expect(events.every(e => e.runId === run.id && e.outcome === 'succeeded' && !e.scheduled)).toBe(true);
    expect(record).toHaveBeenCalledWith(actor.branchId, run);
    expect(JSON.stringify(events)).not.toContain('PRIVATE');
    expect(workspace.createCount).toHaveBeenCalledWith(actor, expect.objectContaining({ daily: true, requestKey: expect.stringMatching(/^auto-count:/) }));
  });

  it('records rejected steps, continues remaining work, and marks the run failed', async () => {
    workspace.createCount.mockRejectedValue(new BadRequestException('PRIVATE failure'));
    const run = await service.run(actor, true);
    expect(run.outcomes[0].status).toBe('FAILED');
    expect(replenishment.autoPo).toHaveBeenCalledTimes(1);
    expect(events[0]).toMatchObject({ operation: 'stock_count', outcome: 'failed', errorCode: 'invalid_request', status: 400 });
    expect(events.at(-1)).toMatchObject({ operation: 'run', outcome: 'failed', runId: run.id });
    expect(JSON.stringify(events)).not.toContain('PRIVATE');
  });

  it('detects nested purchase-order failures even when the service resolves', async () => {
    replenishment.autoPo.mockResolvedValue({ outcomes: [{ status: 'CREATED' }, { status: 'FAILED', message: 'PRIVATE failure' }] });
    const run = await service.run(actor);
    expect(run.outcomes[2].results[1].status).toBe('FAILED');
    expect(events.find(e => e.operation === 'purchase_order_drafts')).toMatchObject({ outcome: 'failed', errorCode: 'partial_failure' });
    expect(events.at(-1).outcome).toBe('failed');
  });

  it('logs history failures and rethrows without claiming a successful completed run', async () => {
    const error = Object.assign(new Error('PRIVATE database message'), { code: 'P2034' });
    record.mockRejectedValue(error);
    await expect(service.run(actor)).rejects.toBe(error);
    expect(events.at(-1)).toMatchObject({ operation: 'persist_history', outcome: 'failed', databaseCode: 'P2034' });
    expect(events.some(e => e.operation === 'run' && e.outcome === 'succeeded')).toBe(false);
  });

  it('logs settings failures and still rejects unauthorized manual execution', async () => {
    workflow.settings.mockRejectedValueOnce(new Error('PRIVATE settings error'));
    await expect(service.run(actor)).rejects.toThrow('PRIVATE settings error');
    expect(events.at(-1)).toMatchObject({ operation: 'load_settings', outcome: 'failed' });
    await expect(service.run({ ...actor, role: 'STAFF' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(workspace.createCount).not.toHaveBeenCalled();
  });

  it('records disabled runs without creating stock documents', async () => {
    workflow.settings.mockResolvedValue({});
    const run = await service.run(actor);
    expect(run.disabled).toBe(true);
    expect(workspace.createCount).not.toHaveBeenCalled();
    expect(events).toEqual([expect.objectContaining({ operation: 'run', outcome: 'disabled' })]);
  });

  it('logs a missing owner and continues after branch history persistence fails', async () => {
    prisma.inventoryWorkflowSettings.findMany.mockResolvedValue([{ branchId: 'PRIVATE-one', settings: { auditEnabled: true } }, { branchId: 'PRIVATE-two', settings: { auditEnabled: true, ownerId: 'PRIVATE-owner' } }]);
    prisma.user.findFirst.mockResolvedValue({ ...actor, branchId: 'PRIVATE-two' });
    record.mockRejectedValueOnce(new Error('PRIVATE history')).mockResolvedValue(undefined);
    await service.tick();
    expect(events).toContainEqual(expect.objectContaining({ operation: 'owner_validation', errorCode: 'missing_owner', outcome: 'failed' }));
    expect(events).toContainEqual(expect.objectContaining({ operation: 'persist_history', outcome: 'failed' }));
    expect(workspace.createCount).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(events)).not.toContain('PRIVATE');
  });

  it('logs scheduler lookup failures and releases the running lock', async () => {
    prisma.inventoryWorkflowSettings.findMany.mockRejectedValueOnce(new Error('PRIVATE connection')).mockResolvedValue([]);
    await expect(service.tick()).rejects.toThrow('PRIVATE connection');
    expect(events).toEqual([expect.objectContaining({ operation: 'scheduler', outcome: 'failed' })]);
    await service.tick();
    expect(prisma.inventoryWorkflowSettings.findMany).toHaveBeenCalledTimes(2);
  });
});
