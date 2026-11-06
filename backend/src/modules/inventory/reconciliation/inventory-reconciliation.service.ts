import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { clinicDay, clinicDayRange, clinicDayStart, compareValues, financialYear, isCalendarDay, money, pageOf, peopleById, registerRangeError } from '../../pharmacy/register-utils';
import { InventoryWorkflowService } from '../inventory-workflow.service';
import { INVENTORY_APPROVERS, WorkflowActor, WorkflowLine } from '../inventory-workflow.types';
import { jsonObject } from '../inventory-stock';
import { displayDay } from '../supplier-return';
import { cycleOn, cycleRequestKey, forecast, planDay, readReconciliation, type PlanBatch } from './reconciliation-cycle';

export const COUNT_STATES = ['ASSIGNED', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'POSTED_NO_DIFF', 'CANCELLED'] as const;
export type CountState = (typeof COUNT_STATES)[number];
const COUNT_SORTS = ['date', 'assignedTo', 'signedAt', 'items', 'differences', 'netValue'] as const;
type CountSort = (typeof COUNT_SORTS)[number];

type Person = { id: string; name: string } | null;
type CountDoc = { id: string; status: string; reference: string; createdBy: string; createdAt: Date; postedAt: Date | null; version: number; payload: any };

const lineDiff = (l: WorkflowLine) => (l.physicalStock === undefined || l.systemStock === undefined ? 0 : l.physicalStock - l.systemStock);

export function countFigures(lines: readonly WorkflowLine[]) {
  const counted = lines.filter((l) => l.physicalStock !== undefined);
  const differing = counted.filter((l) => lineDiff(l) !== 0);
  return {
    items: lines.length,
    counted: counted.length,
    differences: differing.length,
    netUnits: differing.reduce((n, l) => n + lineDiff(l), 0),
    netValue: money(differing.reduce((n, l) => n + lineDiff(l) * (l.unitPrice || 0), 0)),
  };
}

export function countState(doc: Pick<CountDoc, 'status' | 'payload'>): CountState {
  if (doc.status === 'DRAFT') return 'ASSIGNED';
  if (doc.status === 'AWAITING_APPROVAL') return 'AWAITING_APPROVAL';
  if (doc.status === 'REJECTED') return 'REJECTED';
  if (doc.status === 'CANCELLED') return 'CANCELLED';
  if (doc.status === 'POSTED' && !doc.payload?.decision && countFigures(doc.payload?.lines || []).differences === 0) return 'POSTED_NO_DIFF';
  return 'APPROVED';
}

const signedDay = (doc: Pick<CountDoc, 'payload' | 'postedAt'>) => {
  const at = doc.payload?.signOff?.at ?? doc.postedAt;
  return at ? clinicDay(new Date(at)) : null;
};

@Injectable()
export class InventoryReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: InventoryWorkflowService,
  ) {}

  private async storedSettings(branchId: string) {
    const row = await this.prisma.inventoryWorkflowSettings.findUnique({ where: { branchId } });
    return readReconciliation(jsonObject(row?.settings), clinicDay(row?.updatedAt ?? new Date()));
  }

  private async coverage(db: any, branchId: string, cycleStart: string) {
    const [items, docs] = await Promise.all([
      db.inventoryItem.findMany({ where: { branchId, currentStock: { gt: 0 } }, select: { id: true, name: true, metadata: true } }),
      db.inventoryWorkflowDocument.findMany({
        where: {
          branchId,
          kind: 'COUNT',
          OR: [
            { status: 'DRAFT', payload: { path: ['cycle', 'start'], equals: cycleStart } },
            { status: { in: ['AWAITING_APPROVAL', 'APPROVED', 'POSTED'] }, updatedAt: { gte: clinicDayStart(cycleStart) } },
          ],
        },
        select: { id: true, status: true, payload: true, postedAt: true },
      }),
    ]);
    const batches: PlanBatch[] = items.map((item: any) => ({ id: item.id, name: item.name, lastCountedAt: jsonObject(item.metadata).lastCountAt ?? null }));
    const covered = new Set<string>();
    const reserved = new Set<string>();
    for (const doc of docs as CountDoc[]) {
      const ids = (doc.payload?.lines || []).map((l: WorkflowLine) => l.inventoryId);
      if (doc.status === 'DRAFT') ids.forEach((id: string) => reserved.add(id));
      else if ((signedDay(doc) ?? '') >= cycleStart) ids.forEach((id: string) => covered.add(id));
    }
    return { batches, covered, reserved };
  }

  /**
   * @cc [owner:nareshshah139,label:product] reconciliation-daily-plan
   * Each IST clinic day a branch with reconciliation on MUST give every active assignee holding the
   * reconciliation permission at most items-per-day uncounted in-stock batches, disjoint from other
   * assignees and from open cycle counts. Repeated or concurrent runs on the same day create nothing more.
   */
  async ensureToday(branchId: string, plannedBy: string) {
    const settings = await this.storedSettings(branchId);
    if (!settings.enabled) return 0;
    const today = clinicDay(new Date());
    const cycle = cycleOn(settings, today);
    const staff = new Map((await this.workflow.countStaff(branchId)).map((person) => [person.id, person]));
    const assigneeIds = settings.assigneeIds.filter((id) => staff.has(id));
    const planned = await this.prisma.inventoryWorkflowDocument.findMany({
      where: { branchId, requestKey: { in: assigneeIds.map((id) => cycleRequestKey(cycle, today, id)) } },
      select: { requestKey: true },
    });
    if (planned.length === assigneeIds.length) return 0;
    const plannedToday = new Set(assigneeIds.filter((id) => planned.some((doc) => doc.requestKey === cycleRequestKey(cycle, today, id))));
    try {
      return await this.workflow.transaction(async (tx) => {
        const { batches, covered, reserved } = await this.coverage(tx, branchId, cycle.start);
        const plan = planDay({ settings: { ...settings, assigneeIds }, today, batches, covered, reserved, plannedToday });
        let created = 0;
        for (const assignment of plan.assignments) {
          const person = staff.get(assignment.assigneeId)!;
          const doc = await this.workflow.createCycleCount(tx, { id: person.id, branchId, role: person.role }, {
            requestKey: assignment.requestKey,
            reference: `Stock count ${displayDay(today)} · ${person.name}`.slice(0, 160),
            cycleStart: cycle.start,
            day: today,
            inventoryIds: assignment.batchIds,
            plannedBy,
          });
          if (doc) created++;
        }
        return created;
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') return 0;
      throw error;
    }
  }

  private async openCounts(branchId: string, where: Record<string, unknown>) {
    return (await this.prisma.inventoryWorkflowDocument.findMany({
      where: { branchId, kind: 'COUNT', ...where },
      select: { id: true, status: true, reference: true, createdBy: true, createdAt: true, postedAt: true, version: true, payload: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })) as CountDoc[];
  }

  private async approvalQueue(actor: WorkflowActor) {
    const waiting = await this.openCounts(actor.branchId, { status: 'AWAITING_APPROVAL' });
    const sole = !(await this.otherApprovers(actor)).length;
    const mine = waiting.filter((doc) => sole || (doc.payload?.signOff?.by || doc.createdBy) !== actor.id);
    return { count: mine.length, netValue: money(mine.reduce((n, doc) => n + countFigures(doc.payload?.lines || []).netValue, 0)) };
  }

  private otherApprovers(actor: WorkflowActor) {
    return this.prisma.user.findMany({
      where: { branchId: actor.branchId, isActive: true, role: { in: [...INVENTORY_APPROVERS] as any }, id: { not: actor.id } },
      select: { id: true, firstName: true, lastName: true },
    });
  }

  private assignedSummary(doc: CountDoc) {
    const figures = countFigures(doc.payload?.lines || []);
    return { id: doc.id, reference: doc.reference, day: doc.payload?.date ?? clinicDay(doc.createdAt), origin: doc.payload?.origin ?? 'ON_DEMAND', version: doc.version, items: figures.items, counted: figures.counted };
  }

  async summary(actor: WorkflowActor) {
    await this.workflow.authorize(actor, 'COUNT');
    await this.ensureToday(actor.branchId, actor.id);
    const [settingsRow, caps] = await Promise.all([this.workflow.settings(actor), this.workflow.capabilities(actor)]);
    const settings = settingsRow.reconciliation;
    const today = clinicDay(new Date());
    const cycle = cycleOn(settings, today);
    const { batches, covered } = await this.coverage(this.prisma, actor.branchId, cycle.start);
    const coveredInStock = batches.filter((b) => covered.has(b.id)).length;
    const mine = (await this.openCounts(actor.branchId, { status: 'DRAFT', payload: { path: ['assigneeId'], equals: actor.id } })).map((doc) => this.assignedSummary(doc));
    return {
      today,
      settings,
      settingsVersion: settingsRow.version,
      cycle,
      forecast: forecast(settings, cycle, batches.length, coveredInStock),
      mine,
      approvals: caps.approve ? await this.approvalQueue(actor) : null,
      canCount: !!caps.kinds.COUNT?.write,
      canApprove: caps.approve,
      canConfigure: caps.settings,
      staff: caps.settings ? await this.workflow.countStaff(actor.branchId) : null,
    };
  }

  /**
   * @cc [owner:nareshshah139,label:product] reconciliation-today-reminder
   * Today MUST remind, never block: the signed-in assignee's due count, an approver's queue of
   * counts signed by someone else with the net value, and a behind or short cycle for whoever
   * configures it. Users without count access see none of these.
   */
  async todayCards(actor: WorkflowActor) {
    const caps = await this.workflow.capabilities(actor);
    if (!caps.kinds.COUNT?.read) return null;
    await this.ensureToday(actor.branchId, actor.id);
    const mine = await this.openCounts(actor.branchId, { status: 'DRAFT', payload: { path: ['assigneeId'], equals: actor.id } });
    const due = mine.length
      ? { counts: mine.length, items: mine.reduce((n, doc) => n + countFigures(doc.payload?.lines || []).items - countFigures(doc.payload?.lines || []).counted, 0) }
      : null;
    let behind = null;
    if (caps.settings) {
      const settings = await this.storedSettings(actor.branchId);
      if (settings.enabled) {
        const cycle = cycleOn(settings, clinicDay(new Date()));
        const { batches, covered } = await this.coverage(this.prisma, actor.branchId, cycle.start);
        const outlook = forecast(settings, cycle, batches.length, batches.filter((b) => covered.has(b.id)).length);
        if (outlook.short || outlook.behind) behind = { remaining: outlook.remaining, message: outlook.message };
      }
    }
    return { due, approvals: caps.approve ? await this.approvalQueue(actor) : null, behind };
  }

  private row(doc: CountDoc, people: Map<string, { id: string; name: string }>) {
    const person = (id: string | undefined | null): Person => (id ? people.get(id) ?? { id, name: 'Former staff member' } : null);
    const figures = countFigures(doc.payload?.lines || []);
    const decision = doc.payload?.decision;
    return {
      id: doc.id,
      reference: doc.reference,
      day: doc.payload?.date ?? clinicDay(doc.createdAt),
      origin: doc.payload?.origin ?? 'ON_DEMAND',
      assignedTo: person(doc.payload?.assigneeId ?? doc.createdBy),
      signedBy: person(doc.payload?.signOff?.by),
      signedAt: doc.payload?.signOff?.at ?? null,
      decidedBy: person(decision?.by),
      decidedAt: decision?.at ?? null,
      ...figures,
      state: countState(doc),
    };
  }

  async register(actor: WorkflowActor, q: Record<string, any>) {
    await this.workflow.authorize(actor, 'COUNT');
    const approvals = q.view === 'approvals';
    const fy = financialYear(clinicDay(new Date()));
    const from = isCalendarDay(String(q.from ?? '')) ? String(q.from) : fy.from;
    const to = isCalendarDay(String(q.to ?? '')) ? String(q.to) : fy.to;
    const rangeError = registerRangeError(from, to);
    if (rangeError) throw new BadRequestException(rangeError);
    const docs = await this.openCounts(actor.branchId, approvals ? { status: 'AWAITING_APPROVAL' } : { createdAt: clinicDayRange(from, to) });
    const people = await peopleById(this.prisma, docs.flatMap((doc) => [doc.payload?.assigneeId ?? doc.createdBy, doc.payload?.signOff?.by, doc.payload?.decision?.by]));
    const all = docs.map((doc) => this.row(doc, people));
    const personOptions = [...new Map(all.flatMap((r) => [r.assignedTo, r.signedBy]).filter((p): p is { id: string; name: string } => !!p).map((p) => [p.id, p])).values()].sort((a, b) => compareValues(a.name, b.name));
    const state = COUNT_STATES.includes(q.state) ? (q.state as CountState) : null;
    const filtered = all.filter((r) => (!q.person || r.assignedTo?.id === q.person || r.signedBy?.id === q.person) && (!state || r.state === state));
    const sortBy: CountSort = COUNT_SORTS.includes(q.sortBy) ? q.sortBy : 'date';
    const dir = q.sortDir === 'asc' ? 1 : -1;
    const key = (r: (typeof all)[number]): string | number =>
      sortBy === 'assignedTo' ? r.assignedTo?.name ?? '' : sortBy === 'signedAt' ? r.signedAt ?? '' : sortBy === 'date' ? `${r.day}|${r.signedAt ?? ''}` : r[sortBy];
    filtered.sort((a, b) => dir * compareValues(key(a), key(b)) || compareValues(a.reference, b.reference));
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
    return {
      rows: pageOf(filtered, page, limit),
      total: filtered.length,
      page,
      limit,
      from,
      to,
      personOptions,
      totals: { counts: filtered.length, differences: filtered.reduce((n, r) => n + r.differences, 0), netValue: money(filtered.reduce((n, r) => n + r.netValue, 0)) },
    };
  }

  async detail(actor: WorkflowActor, id: string) {
    const doc = await this.workflow.document(actor, id);
    if (doc.kind !== 'COUNT') throw new BadRequestException('This document is not a stock count');
    const lines: WorkflowLine[] = doc.payload.lines || [];
    const ids = lines.map((l) => l.inventoryId);
    const [items, audits, caps, others] = await Promise.all([
      this.prisma.inventoryItem.findMany({ where: { branchId: actor.branchId, id: { in: ids } }, select: { id: true, currentStock: true, storageLocation: true, name: true } }),
      this.prisma.inventoryAudit.findMany({ where: { branchId: actor.branchId, itemId: { in: ids } }, orderBy: { createdAt: 'desc' }, select: { itemId: true, variance: true, notes: true } }),
      this.workflow.capabilities(actor),
      this.otherApprovers(actor),
    ]);
    const stock = new Map(items.map((i) => [i.id, i]));
    const history = (inventoryId: string) => {
      const past = audits.filter((a) => a.itemId === inventoryId && jsonObject(a.notes).workflowDocumentId !== doc.id).slice(0, 4);
      const differed = past.filter((a) => a.variance !== 0).length;
      return past.length >= 2 && differed >= 2 ? `${differed} of the last ${past.length} counts differed` : null;
    };
    const people = await peopleById(this.prisma, [doc.payload.assigneeId ?? doc.createdBy, doc.payload.signOff?.by, doc.payload.decision?.by, ...doc.events.map((e: any) => e.actorId)]);
    const row = this.row(doc, people);
    const signer = doc.payload.signOff?.by;
    return {
      ...row,
      version: doc.version,
      reason: doc.payload.reason,
      signOffNote: doc.payload.signOff?.note ?? '',
      decisionReason: doc.payload.decision?.reason ?? '',
      selfApproval: doc.payload.decision?.selfApproval === true,
      lines: lines.map((l) => {
        const item = stock.get(l.inventoryId);
        const diff = l.physicalStock === undefined ? null : l.physicalStock - (l.systemStock ?? 0);
        return {
          id: l.id,
          inventoryId: l.inventoryId,
          name: l.name,
          batchNumber: l.batchNumber,
          expiryDate: l.expiryDate,
          unit: l.unit,
          location: item?.storageLocation ?? l.location ?? '',
          currentStock: item?.currentStock ?? null,
          systemStock: l.systemStock ?? null,
          physicalStock: l.physicalStock ?? null,
          difference: diff,
          unitCost: l.unitPrice ?? 0,
          value: diff === null ? null : money(diff * (l.unitPrice ?? 0)),
          note: l.note ?? '',
          history: history(l.inventoryId),
        };
      }),
      events: doc.events.map((e: any) => ({ action: e.action, at: e.createdAt, by: people.get(e.actorId)?.name ?? 'Former staff member', detail: { reason: e.detail?.reason, note: e.detail?.note, selfApproval: e.detail?.selfApproval } })),
      can: {
        count: doc.status === 'DRAFT' && !!caps.kinds.COUNT?.write && (doc.payload.assigneeId ?? doc.createdBy) === actor.id,
        decide: doc.status === 'AWAITING_APPROVAL' && caps.approve && (signer !== actor.id || !others.length),
        decideOwn: doc.status === 'AWAITING_APPROVAL' && caps.approve && signer === actor.id && !others.length,
      },
      approvers: doc.status === 'AWAITING_APPROVAL' && signer === actor.id ? others.map((o) => `${o.firstName} ${o.lastName}`.trim()) : [],
    };
  }

  async saveProgress(actor: WorkflowActor, id: string, input: Record<string, any>) {
    await this.workflow.saveCountProgress(actor, id, input);
    return this.detail(actor, id);
  }
  async signOff(actor: WorkflowActor, id: string, input: Record<string, any>) {
    await this.workflow.signOffCount(actor, id, input);
    return this.detail(actor, id);
  }
  async decide(actor: WorkflowActor, id: string, decision: 'APPROVE' | 'REJECT', input: Record<string, any>) {
    await this.workflow.decideCount(actor, id, decision, input);
    return this.detail(actor, id);
  }
}
