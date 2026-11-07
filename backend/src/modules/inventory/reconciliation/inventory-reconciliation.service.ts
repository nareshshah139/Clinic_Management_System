import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { clinicDay, clinicDayRange, clinicDayStart, compareValues, financialYear, isCalendarDay, money, pageOf, peopleById, registerRangeError } from '../../pharmacy/register-utils';
import { InventoryWorkflowService, observationOutdated } from '../inventory-workflow.service';
import { COUNT_APPROVERS, WorkflowActor, WorkflowLine } from '../inventory-workflow.types';
import { jsonObject } from '../inventory-stock';
import { displayDay } from '../supplier-return';
import { randomUUID } from 'node:crypto';
import { logInventoryAutomation } from '../inventory-observability';
import { cycleOn, cycleRequestKey, forecast, planDay, readReconciliation, type PlanBatch, type ReconciliationSettings } from './reconciliation-cycle';

export const COUNT_STATES = ['ASSIGNED', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'POSTED_NO_DIFF', 'CANCELLED'] as const;
export type CountState = (typeof COUNT_STATES)[number];
const COUNT_SORTS = ['date', 'assignedTo', 'signedAt', 'items', 'differences', 'shortValue', 'netValue'] as const;
type CountSort = (typeof COUNT_SORTS)[number];

type Person = { id: string; name: string } | null;
type CountDoc = { id: string; status: string; reference: string; createdBy: string; createdAt: Date; postedAt: Date | null; version: number; payload: any };

const lineDiff = (l: WorkflowLine) => (l.physicalStock === undefined || l.systemStock === undefined ? 0 : l.physicalStock - l.systemStock);

/** Shortages and surpluses are kept apart because a net figure lets one hide the other. */
export function countFigures(lines: readonly WorkflowLine[]) {
  const counted = lines.filter((l) => l.physicalStock !== undefined);
  const differing = counted.filter((l) => lineDiff(l) !== 0);
  const units = (part: WorkflowLine[]) => part.reduce((n, l) => n + lineDiff(l), 0);
  const value = (part: WorkflowLine[]) => money(part.reduce((n, l) => n + lineDiff(l) * (l.unitPrice || 0), 0));
  const short = differing.filter((l) => lineDiff(l) < 0);
  const extra = differing.filter((l) => lineDiff(l) > 0);
  return {
    items: lines.length,
    counted: counted.length,
    differences: differing.length,
    netUnits: units(differing),
    netValue: value(differing),
    shortUnits: units(short),
    shortValue: value(short),
    extraUnits: units(extra),
    extraValue: value(extra),
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

  /** The forecast plans with the people who can still count; someone deactivated or without access counts nothing. */
  private counting(settings: ReconciliationSettings, staff: { id: string }[]) {
    return { ...settings, assigneeIds: settings.assigneeIds.filter((id) => staff.some((person) => person.id === id)) };
  }

  private async storedSettings(branchId: string) {
    const row = await this.prisma.inventoryWorkflowSettings.findUnique({ where: { branchId } });
    return readReconciliation(jsonObject(row?.settings), clinicDay(row?.updatedAt ?? new Date()));
  }

  /**
   * A batch is covered once a count of it signed in this cycle is waiting or accepted, and reserved
   * while any count of it is undecided, whatever its cycle or origin, so it is never dealt twice.
   * The pool is ordered by the last accepted sign-off; the metadata is matched in SQL so the large
   * ledger checkpoint it also holds is never read.
   */
  private async coverage(db: any, branchId: string, cycleStart: string) {
    const [items, docs] = await Promise.all([
      db.$queryRaw(Prisma.sql`
        SELECT id, name,
          coalesce(substring(metadata from '"lastSignedCountAt":"([^"]*)"'), substring(metadata from '"lastCountAt":"([^"]*)"')) AS "lastCountedAt"
        FROM inventory_items WHERE "branchId" = ${branchId} AND "currentStock" > 0`) as Promise<PlanBatch[]>,
      db.inventoryWorkflowDocument.findMany({
        where: {
          branchId,
          kind: 'COUNT',
          OR: [{ status: { in: ['DRAFT', 'AWAITING_APPROVAL'] } }, { status: { in: ['APPROVED', 'POSTED'] }, updatedAt: { gte: clinicDayStart(cycleStart) } }],
        },
        select: { id: true, status: true, payload: true, postedAt: true },
      }),
    ]);
    const covered = new Set<string>();
    const reserved = new Set<string>();
    const backlog = new Map<string, number>();
    for (const doc of docs as CountDoc[]) {
      const ids = (doc.payload?.lines || []).map((l: WorkflowLine) => l.inventoryId);
      if (doc.status !== 'DRAFT' && (signedDay(doc) ?? '') >= cycleStart) ids.forEach((id: string) => covered.add(id));
      else if (doc.status === 'DRAFT' || doc.status === 'AWAITING_APPROVAL') ids.forEach((id: string) => reserved.add(id));
      if (doc.status === 'DRAFT' && doc.payload?.origin === 'CYCLE') backlog.set(doc.payload.assigneeId, (backlog.get(doc.payload.assigneeId) ?? 0) + ids.length);
    }
    return { batches: items.map((b) => ({ ...b, lastCountedAt: b.lastCountedAt ?? null })), covered, reserved, backlog };
  }

  /**
   * @cc [owner:nareshshah139,label:product] reconciliation-daily-plan
   * Each IST clinic day a branch with reconciliation on MUST give every active assignee holding the
   * reconciliation permission at most items-per-day uncounted in-stock batches, less the cycle lines
   * they still have open, disjoint from other assignees and from every undecided count. Repeated or
   * concurrent runs on the same day create nothing more. Unsigned counts held by someone who can no
   * longer count go back to the pool.
   */
  async ensureToday(branchId: string, plannedBy: string) {
    const row = await this.prisma.inventoryWorkflowSettings.findUnique({ where: { branchId } });
    const today = clinicDay(new Date());
    const marker = `${today}|${row?.version ?? 0}`;
    if (this.plannedFor.get(branchId) === marker) return 0;
    const settings = readReconciliation(jsonObject(row?.settings), clinicDay(row?.updatedAt ?? new Date()));
    const staff = new Map((await this.workflow.countStaff(branchId)).map((person) => [person.id, person]));
    await this.releaseFromFormerCounters(branchId, staff, plannedBy);
    const created = settings.enabled ? await this.dealToday(branchId, settings, staff, today, plannedBy) : 0;
    if (created !== null) this.plannedFor.set(branchId, marker);
    return created ?? 0;
  }

  private readonly plannedFor = new Map<string, string>();

  private async releaseFromFormerCounters(branchId: string, staff: Map<string, { id: string; name: string }>, plannedBy: string) {
    const drafts = await this.openCounts(branchId, { status: 'DRAFT' });
    const orphaned = drafts.filter((doc) => !staff.has(doc.payload?.assigneeId ?? doc.createdBy));
    if (!orphaned.length) return;
    const people = await peopleById(this.prisma, orphaned.map((doc) => doc.payload?.assigneeId ?? doc.createdBy));
    await this.workflow.transaction(async (tx) => {
      for (const doc of orphaned) {
        const released = await tx.inventoryWorkflowDocument.updateMany({ where: { id: doc.id, branchId, status: 'DRAFT', version: doc.version }, data: { status: 'CANCELLED', version: { increment: 1 } } });
        if (!released.count) continue;
        const name = people.get(doc.payload?.assigneeId ?? doc.createdBy)?.name ?? 'The person it was assigned to';
        await this.workflow.event(tx, { id: doc.id, status: 'CANCELLED', version: doc.version + 1 }, { id: plannedBy, branchId, role: 'SYSTEM' }, 'CANCEL', 'DRAFT', {
          reason: `${name} can no longer count stock, so these batches went back to the cycle.`,
          released: true,
        });
      }
    });
  }

  private async dealToday(branchId: string, settings: ReconciliationSettings, staff: Map<string, { id: string; name: string; role: string }>, today: string, plannedBy: string) {
    const cycle = cycleOn(settings, today);
    const assigneeIds = settings.assigneeIds.filter((id) => staff.has(id));
    const planned = await this.prisma.inventoryWorkflowDocument.findMany({
      where: { branchId, requestKey: { in: assigneeIds.map((id) => cycleRequestKey(cycle, today, id)) } },
      select: { requestKey: true },
    });
    if (planned.length === assigneeIds.length) return 0;
    const plannedToday = new Set(assigneeIds.filter((id) => planned.some((doc) => doc.requestKey === cycleRequestKey(cycle, today, id))));
    try {
      return await this.workflow.transaction(async (tx) => {
        const { batches, covered, reserved, backlog } = await this.coverage(tx, branchId, cycle.start);
        const plan = planDay({ settings: { ...settings, assigneeIds }, today, batches, covered, reserved, plannedToday, backlog });
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
      if ((error as { code?: string })?.code === 'P2002') return null;
      throw error;
    }
  }

  /** A reminder never breaks the page it sits on: a planning failure is logged and the page loads without today's new list. */
  private async planQuietly(branchId: string, plannedBy: string) {
    const started = Date.now();
    try {
      await this.ensureToday(branchId, plannedBy);
    } catch (error) {
      logInventoryAutomation({ runId: randomUUID(), scheduled: false, operation: 'stock_count', outcome: 'failed', error, durationMs: Date.now() - started });
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
    const figures = mine.map((doc) => countFigures(doc.payload?.lines || []));
    const total = (key: 'netValue' | 'shortValue' | 'extraValue') => money(figures.reduce((n, f) => n + f[key], 0));
    return { count: mine.length, netValue: total('netValue'), shortValue: total('shortValue'), extraValue: total('extraValue') };
  }

  private otherApprovers(actor: WorkflowActor) {
    return this.prisma.user.findMany({
      where: { branchId: actor.branchId, isActive: true, role: { in: [...COUNT_APPROVERS] as any }, id: { not: actor.id } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  private async assigned(branchId: string, docs: CountDoc[]) {
    const ids = [...new Set(docs.flatMap((doc) => (doc.payload?.lines || []).map((l: WorkflowLine) => l.inventoryId)))];
    const marks = new Map(
      (await this.prisma.inventoryItem.findMany({ where: { branchId, id: { in: ids } }, select: { id: true, metadata: true } })).map((item) => [item.id, jsonObject(item.metadata)]),
    );
    return docs.map((doc) => {
      const lines: WorkflowLine[] = doc.payload?.lines || [];
      const retype = lines.filter((l) => observationOutdated(l, marks.get(l.inventoryId) ?? {}, doc.id)).length;
      const figures = countFigures(lines);
      return { id: doc.id, reference: doc.reference, day: doc.payload?.date ?? clinicDay(doc.createdAt), origin: doc.payload?.origin ?? 'ON_DEMAND', version: doc.version, items: figures.items, counted: figures.counted - retype, retype };
    });
  }

  async summary(actor: WorkflowActor) {
    await this.workflow.authorize(actor, 'COUNT');
    await this.planQuietly(actor.branchId, actor.id);
    const [settingsRow, caps] = await Promise.all([this.workflow.settings(actor), this.workflow.capabilities(actor)]);
    const settings = settingsRow.reconciliation;
    const today = clinicDay(new Date());
    const cycle = cycleOn(settings, today);
    const { batches, covered } = await this.coverage(this.prisma, actor.branchId, cycle.start);
    const coveredInStock = batches.filter((b) => covered.has(b.id)).length;
    const staff = await this.workflow.countStaff(actor.branchId);
    const mine = await this.assigned(actor.branchId, await this.openCounts(actor.branchId, { status: 'DRAFT', payload: { path: ['assigneeId'], equals: actor.id } }));
    return {
      today,
      settings,
      settingsVersion: settingsRow.version,
      cycle,
      forecast: forecast(this.counting(settings, staff), cycle, batches.length, coveredInStock),
      mine,
      approvals: COUNT_APPROVERS.has(actor.role) ? await this.approvalQueue(actor) : null,
      canCount: !!caps.kinds.COUNT?.write,
      canApprove: COUNT_APPROVERS.has(actor.role),
      canConfigure: caps.settings,
      staff: caps.settings ? staff : null,
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
    await this.planQuietly(actor.branchId, actor.id);
    const mine = await this.openCounts(actor.branchId, { status: 'DRAFT', payload: { path: ['assigneeId'], equals: actor.id } });
    const due = mine.length
      ? { counts: mine.length, items: mine.reduce((n, doc) => n + countFigures(doc.payload?.lines || []).items - countFigures(doc.payload?.lines || []).counted, 0), documentId: mine.length === 1 ? mine[0].id : null }
      : null;
    let behind = null;
    if (caps.settings) {
      const settings = await this.storedSettings(actor.branchId);
      if (settings.enabled) {
        const cycle = cycleOn(settings, clinicDay(new Date()));
        const { batches, covered } = await this.coverage(this.prisma, actor.branchId, cycle.start);
        const outlook = forecast(this.counting(settings, await this.workflow.countStaff(actor.branchId)), cycle, batches.length, batches.filter((b) => covered.has(b.id)).length);
        if (outlook.short || outlook.behind) behind = { remaining: outlook.remaining, message: outlook.message };
      }
    }
    return { due, approvals: COUNT_APPROVERS.has(actor.role) ? await this.approvalQueue(actor) : null, behind };
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
      selfApproval: decision?.selfApproval === true,
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
    const needle = String(q.q ?? '').trim().toLowerCase();
    const items = new Map(docs.map((doc) => [doc.id, (doc.payload?.lines || []).map((l: WorkflowLine) => `${l.name ?? ''} ${l.batchNumber ?? ''}`.toLowerCase()).join('\n')]));
    const matches = (r: (typeof all)[number]) =>
      !needle || [r.reference, r.assignedTo?.name, r.signedBy?.name, items.get(r.id)].some((text) => String(text ?? '').toLowerCase().includes(needle));
    const filtered = all.filter((r) => (!q.person || r.assignedTo?.id === q.person || r.signedBy?.id === q.person) && (!state || r.state === state) && matches(r));
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
      totals: {
        counts: filtered.length,
        differences: filtered.reduce((n, r) => n + r.differences, 0),
        approvedValue: money(filtered.filter((r) => r.state === 'APPROVED').reduce((n, r) => n + r.netValue, 0)),
        awaitingValue: money(filtered.filter((r) => r.state === 'AWAITING_APPROVAL').reduce((n, r) => n + r.netValue, 0)),
        rejected: filtered.filter((r) => r.state === 'REJECTED').length,
      },
    };
  }

  async detail(actor: WorkflowActor, id: string) {
    const doc = await this.workflow.document(actor, id);
    if (doc.kind !== 'COUNT') throw new BadRequestException('This document is not a stock count');
    const lines: WorkflowLine[] = doc.payload.lines || [];
    const ids = lines.map((l) => l.inventoryId);
    const [items, audits, caps, others] = await Promise.all([
      this.prisma.inventoryItem.findMany({ where: { branchId: actor.branchId, id: { in: ids } }, select: { id: true, currentStock: true, storageLocation: true, name: true, metadata: true } }),
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
          retype: doc.status === 'DRAFT' && observationOutdated(l, jsonObject(item?.metadata), doc.id),
          history: history(l.inventoryId),
        };
      }),
      events: doc.events.map((e: any) => ({ action: e.action, at: e.createdAt, by: people.get(e.actorId)?.name ?? 'Former staff member', detail: { reason: e.detail?.reason, note: e.detail?.note, selfApproval: e.detail?.selfApproval } })),
      can: {
        count: doc.status === 'DRAFT' && !!caps.kinds.COUNT?.write && (doc.payload.assigneeId ?? doc.createdBy) === actor.id,
        decide: doc.status === 'AWAITING_APPROVAL' && COUNT_APPROVERS.has(actor.role) && (signer !== actor.id || !others.length),
        decideOwn: doc.status === 'AWAITING_APPROVAL' && COUNT_APPROVERS.has(actor.role) && signer === actor.id && !others.length,
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
