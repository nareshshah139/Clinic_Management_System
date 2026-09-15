import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../shared/database/prisma.service';
import { InventoryWorkflowService } from './inventory-workflow.service';
import { InventoryWorkspaceService } from './inventory-workspace.service';
import { InventoryReplenishmentService } from './inventory-replenishment.service';
import { jsonObject } from './inventory-stock';
import { WorkflowActor } from './inventory-workflow.types';

@Injectable()
export class InventoryWorkflowScheduler {
  private readonly logger = new Logger(InventoryWorkflowScheduler.name);
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly workflow: InventoryWorkflowService,
    private readonly workspace: InventoryWorkspaceService, private readonly replenishment: InventoryReplenishmentService) {}

  /**
   * @cc [owner:nareshshah139,label:product] inventory-automation-reviewable-output
   * Disabled automation MUST create no documents. Enabled runs MUST use branch/date request keys,
   * retain outcomes for the UI and create reviewable proposals or orders without supplier dispatch.
   */
  @Cron('0 */30 * * * *')
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const branches = await this.prisma.inventoryWorkflowSettings.findMany();
      for (const config of branches) {
        const settings = jsonObject(config.settings);
        if (!settings.auditEnabled && !settings.autoMinMaxEnabled && !settings.autoPoEnabled) continue;
        const owner = settings.ownerId ? await this.prisma.user.findFirst({ where: { id: settings.ownerId, branchId: config.branchId, isActive: true } }) : null;
        if (!owner) {
          await this.record(config.branchId, { id: randomUUID(), at: new Date().toISOString(), scheduled: true, outcomes: [{ name: 'Automation owner', status: 'FAILED', message: 'Select an active branch owner in Automation settings' }] });
          continue;
        }
        try { await this.run({ id: owner.id, branchId: config.branchId, role: owner.role }, true); }
        catch { this.logger.warn(`Inventory automation did not finish for branch ${config.branchId}`); }
      }
    } finally { this.running = false; }
  }

  /**
   * @cc [owner:nareshshah139,label:product] inventory-automation-persisted-outcomes
   * Every completed run MUST retain its actor, time, schedule mode and success/failure outcomes.
   * Updating run history MUST preserve concurrent settings changes and increment the settings revision.
   */
  async run(actor: WorkflowActor, scheduled = false) {
    const settings: any = await this.workflow.settings(actor);
    if (!scheduled && !['OWNER', 'ADMIN', 'MANAGER'].includes(actor.role)) throw new ForbiddenException('A manager must run branch automation');
    const today = new Date().toISOString().slice(0, 10), outcomes: any[] = [];
    const attempt = async (name: string, execute: () => Promise<any>) => {
      try {
        const result = await execute();
        outcomes.push({ name, status: 'SUCCEEDED', documentId: result?.id, results: result?.outcomes || result?.created?.map((d: any) => ({ documentId: d.id, status: 'CREATED' })) || [], at: new Date().toISOString() });
      } catch (e) { outcomes.push({ name, status: 'FAILED', message: (e as Error).message, at: new Date().toISOString() }); }
    };
    if (settings.auditEnabled) await attempt('Daily stock count', () => this.workspace.createCount(actor, { daily: true, requestKey: `auto-count:${today}` }));
    if (settings.autoMinMaxEnabled && (!settings.lastTargetRun || Date.now() - new Date(settings.lastTargetRun).getTime() >= settings.refreshDays * 86400000)) {
      await attempt('Target proposal', () => this.replenishment.proposeTargets(actor, { requestKey: `auto-target:${today}` }));
    }
    if (settings.autoPoEnabled) await attempt('Purchase order drafts', () => this.replenishment.autoPo(actor, { requestKey: `auto-po:${today}` }));
    const run = { id: randomUUID(), actorId: actor.id, at: new Date().toISOString(), scheduled, outcomes, disabled: !settings.auditEnabled && !settings.autoMinMaxEnabled && !settings.autoPoEnabled };
    await this.record(actor.branchId, run);
    return run;
  }

  private async record(branchId: string, run: any) {
    await this.workflow.transaction(async tx => {
      const current = await tx.inventoryWorkflowSettings.findUnique({ where: { branchId } });
      const value = jsonObject(current?.settings);
      const settings = JSON.parse(JSON.stringify({ ...value, lastRunAt: run.at, lastOutcomes: run.outcomes,
        automationRuns: [...(value.automationRuns || []), run],
        ...(run.outcomes.some((o: any) => o.name === 'Target proposal' && o.status === 'SUCCEEDED') ? { lastTargetRun: run.at } : {}) }));
      if (current) await tx.inventoryWorkflowSettings.update({ where: { branchId, version: current.version }, data: { settings, version: { increment: 1 } } });
      else await tx.inventoryWorkflowSettings.create({ data: { branchId, settings, updatedBy: run.actorId } });
    });
  }
}
