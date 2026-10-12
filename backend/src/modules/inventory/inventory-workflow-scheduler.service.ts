import { ForbiddenException, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../shared/database/prisma.service';
import { InventoryWorkflowService } from './inventory-workflow.service';
import { InventoryWorkspaceService } from './inventory-workspace.service';
import { InventoryReplenishmentService } from './inventory-replenishment.service';
import { jsonObject } from './inventory-stock';
import { WorkflowActor } from './inventory-workflow.types';
import { InventoryOperation, logInventoryAutomation } from './inventory-observability';

@Injectable()
export class InventoryWorkflowScheduler {
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly workflow: InventoryWorkflowService,
    private readonly workspace: InventoryWorkspaceService, private readonly replenishment: InventoryReplenishmentService) {}

  /**
   * @cc [owner:nareshshah139,label:product] inventory-automation-reviewable-output
   * Disabled automation MUST create no documents. Enabled runs MUST use branch/date request keys,
   * retain outcomes for the UI and create reviewable proposals or orders without supplier dispatch.
   */
  /**
   * @cc [owner:nareshshah139,label:observability] inventory-scheduler-failure-isolation
   * Log branch setup/run failures without blocking later branches. Overlapping ticks MUST skip;
   * scheduler lookup failures MUST be logged and rethrown with the running lock released.
   */
  @Cron('0 */30 * * * *')
  async tick() {
    if (this.running) return;
    this.running = true;
    const tickId = randomUUID(), started = Date.now();
    try {
      const branches = await this.prisma.inventoryWorkflowSettings.findMany();
      for (const config of branches) {
        const settings = jsonObject(config.settings);
        if (!settings.auditEnabled && !settings.autoMinMaxEnabled && !settings.autoPoEnabled) continue;
        const runId = randomUUID(), branchStarted = Date.now();
        let operation: InventoryOperation = 'owner_validation';
        try {
          const owner = settings.ownerId ? await this.prisma.user.findFirst({ where: { id: settings.ownerId, branchId: config.branchId, isActive: true } }) : null;
          if (!owner) {
            logInventoryAutomation({ runId, scheduled: true, operation, outcome: 'failed', reason: 'missing_owner', durationMs: Date.now() - branchStarted });
            operation = 'persist_history';
            await this.record(config.branchId, { id: runId, at: new Date().toISOString(), scheduled: true, outcomes: [{ name: 'Automation owner', status: 'FAILED', message: 'Select an active branch owner in Automation settings' }] });
            continue;
          }
          operation = 'run';
          await this.run({ id: owner.id, branchId: config.branchId, role: owner.role }, true, runId);
        } catch (error) {
          // run() already records its terminal failure; setup/history failures need their own event.
          if (operation !== 'run') logInventoryAutomation({ runId, scheduled: true, operation, outcome: 'failed', error, durationMs: Date.now() - branchStarted });
        }
      }
    } catch (error) {
      logInventoryAutomation({ runId: tickId, scheduled: true, operation: 'scheduler', outcome: 'failed', error, durationMs: Date.now() - started });
      throw error;
    } finally { this.running = false; }
  }

  /**
   * @cc [owner:nareshshah139,label:product] inventory-automation-persisted-outcomes
   * Every completed run MUST retain its actor, time, schedule mode and success/failure outcomes.
   * Updating run history MUST preserve concurrent settings changes and increment the settings revision.
   */
  /**
   * @cc [owner:nareshshah139,label:observability] inventory-automation-diagnostics
   * Each attempted step and completed run MUST emit a payload-free outcome with the persisted run ID.
   * Rejected steps and nested FAILED results MUST mark diagnostics failed even when the HTTP call
   * resolves. Settings/history failures MUST be logged and rethrown; logging MUST NOT alter outcomes.
   */
  async run(actor: WorkflowActor, scheduled = false, runId: string = randomUUID()) {
    const started = Date.now();
    let operation: InventoryOperation = 'load_settings';
    let failed = false;
    try {
      const settings: any = await this.workflow.settings(actor);
      if (!scheduled && !['OWNER', 'ADMIN', 'MANAGER'].includes(actor.role)) throw new ForbiddenException('A manager must run branch automation');
      const today = new Date().toISOString().slice(0, 10), outcomes: any[] = [];
      const attempt = async (name: string, step: InventoryOperation, execute: () => Promise<any>) => {
        const stepStarted = Date.now();
        try {
          const result = await execute();
          const partialFailure = Array.isArray(result?.outcomes) && result.outcomes.some((item: any) => item?.status === 'FAILED');
          failed ||= partialFailure;
          outcomes.push({ name, status: 'SUCCEEDED', documentId: result?.id, results: result?.outcomes || result?.created?.map((d: any) => ({ documentId: d.id, status: 'CREATED' })) || [], at: new Date().toISOString() });
          logInventoryAutomation({ runId, scheduled, operation: step, outcome: partialFailure ? 'failed' : 'succeeded', reason: partialFailure ? 'partial_failure' : undefined, durationMs: Date.now() - stepStarted });
        } catch (error) {
          failed = true;
          outcomes.push({ name, status: 'FAILED', message: (error as Error)?.message, at: new Date().toISOString() });
          logInventoryAutomation({ runId, scheduled, operation: step, outcome: 'failed', error, durationMs: Date.now() - stepStarted });
        }
      };
      if (settings.auditEnabled) await attempt('Daily stock count', 'stock_count', () => this.workspace.createCount(actor, { daily: true, requestKey: `auto-count:${today}` }));
      if (settings.autoMinMaxEnabled && (!settings.lastTargetRun || Date.now() - new Date(settings.lastTargetRun).getTime() >= settings.refreshDays * 86400000)) {
        await attempt('Target proposal', 'target_proposal', () => this.replenishment.proposeTargets(actor, { requestKey: `auto-target:${today}` }));
      }
      if (settings.autoPoEnabled) await attempt('Purchase order drafts', 'purchase_order_drafts', () => this.replenishment.autoPo(actor, { requestKey: `auto-po:${today}` }));
      const run = { id: runId, actorId: actor.id, at: new Date().toISOString(), scheduled, outcomes, disabled: !settings.auditEnabled && !settings.autoMinMaxEnabled && !settings.autoPoEnabled };
      operation = 'persist_history';
      await this.record(actor.branchId, run);
      logInventoryAutomation({ runId, scheduled, operation: 'run', outcome: failed ? 'failed' : run.disabled ? 'disabled' : 'succeeded', reason: failed ? 'partial_failure' : undefined, durationMs: Date.now() - started });
      return run;
    } catch (error) {
      logInventoryAutomation({ runId, scheduled, operation, outcome: 'failed', error, durationMs: Date.now() - started });
      throw error;
    }
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
