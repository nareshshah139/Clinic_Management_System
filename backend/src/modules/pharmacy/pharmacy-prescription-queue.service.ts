import { lineMetadata, matchPrescriptionLines, prescriptionLineKeys } from './pharmacy-prescription-line-identity';
import { queueStatusPage, queueFrequencyPerDay, queueDurationDays, prescriptionQueueLifecycle, PrescriptionQueueLifecycle } from './pharmacy-prescription-queue-query';
import { availableStock, inventoryIdentityInclude, prescriptionSourceKey, resolvePrescriptionInventory, searchClinicInventory } from './pharmacy-stock-identity';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { DrugService } from './drug.service';
import {
  PrescriptionQueueStatus,
  QueryPrescriptionQueueDto,
} from './dto/pharmacy-prescription-queue.dto';
import {
  PharmacyDispenseLineActionDto,
  PharmacyDispenseTaskStatusDto,
  UpdateDispenseTaskLineDto,
  UpdateDispenseTaskStatusDto,
} from './dto/pharmacy-dispense-task.dto';

type QueueMedication = {
  sourceItem?: Record<string, unknown>;
  sourceLineKey?: string;
  inventoryItemId?: string | null;
  drugId?: string | null;
  lineId?: string;
  drugName: string;
  genericName?: string | null;
  dosage?: string | number | null;
  dosageUnit?: string | null;
  frequency?: string | null;
  duration?: string | number | null;
  durationUnit?: string | null;
  instructions?: string | null;
  prescribedQuantity: number | null;
  quantityInferred: boolean;
  dispensedQuantity: number;
  coverageStatus: 'unknown' | 'not_started' | 'partial' | 'covered';
  action?: string;
  reasonType?: string | null;
  reasonNote?: string | null;
  suggestedDrugId?: string | null;
  suggestedInventoryItemId?: string | null;
  suggestedDrugName?: string | null;
  confidence?: number | null;
  recommendedBatchNumber?: string | null;
  recommendedExpiryDate?: Date | null;
  recommendedStorageLocation?: string | null;
  warnings?: unknown;
};

type QueueEntry = {
  dispenseTaskId?: string;
  prescriptionStatus?: string;
  dispensingEligible?: boolean;
  prescriptionId: string;
  prescriptionUpdatedAt?: Date;
  patient: { id: string; name: string; patientCode?: string | null };
  doctor: { id: string; name: string };
  createdAt: Date;
  pendingHours: number;
  isOverTwoHours: boolean;
  medications: QueueMedication[];
  linkedInvoiceIds: string[];
  status: PrescriptionQueueStatus;
  dispenseStatus?: string;
  source?: string;
  assignedToId?: string | null;
  statusReasonType?: string | null;
  statusReasonNote?: string | null;
  startedAt?: Date | null;
  pausedAt?: Date | null;
  readyToBillAt?: Date | null;
  paidAt?: Date | null;
  dispensedAt?: Date | null;
  cancelledAt?: Date | null;
  lastStockCheckAt?: Date | null;
};

type PrescriptionItem = {
  inventoryItemId?: string | null;
  drugId?: string | null;
  drugName?: string;
  genericName?: string | null;
  brandName?: string | null;
  dosage?: string | number | null;
  dosageUnit?: string | null;
  frequency?: string | null;
  duration?: string | number | null;
  durationUnit?: string | null;
  instructions?: string | null;
  quantity?: string | number | null;
  prescribedQuantity?: string | number | null;
  totalQuantity?: string | number | null;
  qty?: string | number | null;
};

type LoadedPrescription = {
  id: string;
  updatedAt?: Date;
  lifecycle?: PrescriptionQueueLifecycle;
  items: string;
  createdAt: Date;
  visit: {
    patient: { id: string; name: string; patientCode?: string | null };
    doctor: { id: string; firstName: string; lastName: string };
  };
  pharmacyInvoices: LoadedInvoice[];
};

type LoadedInvoice = {
  id: string;
  status: string;
  items: LoadedInvoiceItem[];
};

type LoadedInvoiceItem = {
  inventoryItemId?: string | null;
  id?: string;
  quantity: number;
  drug?: { id: string; name: string } | null;
};

type DrugMatch = {
  id: string;
  name: string;
  manufacturerName: string;
  minStockLevel?: number | null;
  inventoryItems: InventoryBatch[];
};

type InventoryBatch = {
  id: string;
  currentStock: number;
  minStockLevel?: number | null;
  batchNumber?: string | null;
  expiryDate?: Date | null;
  sellingPrice?: number | null;
  mrp?: number | null;
  stockStatus: string;
  storageLocation?: string | null;
};

type StockCheckResult = {
  sourceLineKey?: string;
  inventoryItemId?: string | null;
  unit?: string | null;
  totalOnHandStock?: number;
  heldStock?: number;
  expiredStock?: number;
  suggestions?: any[];
  drugName: string;
  matchedDrug: {
    id: string;
    name: string;
    manufacturerName?: string | null;
  } | null;
  stockStatus: 'UNMATCHED' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';
  totalNonExpiredStock: number;
  batches: Array<{
    id: string;
    batchNumber?: string | null;
    currentStock: number;
    expiryDate?: Date | null;
    sellingPrice?: number | null;
    mrp?: number | null;
    stockStatus: string;
    storageLocation?: string | null;
  }>;
  lowStock: boolean;
  nearExpiry: boolean;
  alternatives: unknown[];
};

type DispenseTaskLine = {
  originalText?: string | null;
  metadata?: unknown;
  createdAt?: Date;
  id: string;
  drugName: string;
  genericName?: string | null;
  dosage?: string | null;
  dosageUnit?: string | null;
  frequency?: string | null;
  duration?: string | null;
  durationUnit?: string | null;
  instructions?: string | null;
  prescribedQuantity?: number | null;
  dispensedQuantity: number;
  suggestedDrugId?: string | null;
  suggestedInventoryItemId?: string | null;
  suggestedDrugName?: string | null;
  confidence?: number | null;
  stockStatus?: string | null;
  recommendedBatchNumber?: string | null;
  recommendedExpiryDate?: Date | null;
  recommendedStorageLocation?: string | null;
  action: string;
  reasonType?: string | null;
  reasonNote?: string | null;
  warnings?: unknown;
};

type DispenseTask = {
  id: string;
  branchId: string;
  prescriptionId?: string | null;
  patientId: string;
  patientName: string;
  patientCode?: string | null;
  doctorId?: string | null;
  doctorName?: string | null;
  status: string;
  source: string;
  assignedToId?: string | null;
  statusReasonType?: string | null;
  statusReasonNote?: string | null;
  startedAt?: Date | null;
  pausedAt?: Date | null;
  readyToBillAt?: Date | null;
  paidAt?: Date | null;
  dispensedAt?: Date | null;
  cancelledAt?: Date | null;
  lastStockCheckAt?: Date | null;
  linkedInvoiceIds?: string | null;
  lines?: DispenseTaskLine[];
};

@Injectable()
export class PharmacyPrescriptionQueueService {
  private readonly expiredAfterHours = 24;
  private readonly warningAfterHours = 2;
  private readonly nearExpiryDays = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly drugService: DrugService,
  ) {}

  /**
   * @cc [owner:nareshshah139,label:product] queue-read-only-page
   * Listing MUST count and filter the complete branch queue before pagination and hydrate
   * only that page. Reads MUST NOT create tasks or change workflow timestamps.
   */
  async findAll(query: QueryPrescriptionQueueDto, branchId: string) {
    const page = this.toPositiveInt(query.page, 1);
    const limit = Math.min(this.toPositiveInt(query.limit, 20), 100);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const [selection] = await tx.$queryRaw<{ ids: string[]; total: number; lifecycle: Record<string, PrescriptionQueueLifecycle> }[]>(
        queueStatusPage(branchId, query.status, page, limit, now),
      );
      const prescriptions = await tx.prescription.findMany({
        where: { id: { in: selection.ids } },
        include: this.prescriptionInclude(branchId),
      });
      const tasks = await tx.pharmacyDispenseTask.findMany({
        where: { branchId, prescriptionId: { in: selection.ids } },
        include: { lines: true },
      });
      const taskByPrescription = new Map(tasks.map(task => [task.prescriptionId, task]));
      const entryById = new Map(prescriptions.map(prescription => [prescription.id,
        this.mergeTask(this.toQueueEntry({ ...prescription, lifecycle: selection.lifecycle[prescription.id] }, now.getTime()), taskByPrescription.get(prescription.id)),
      ]));
      return {
        data: selection.ids.map(id => entryById.get(id)!),
        pagination: { page, limit, total: selection.total, pages: Math.ceil(selection.total / limit) },
      };
    }, { isolationLevel: 'RepeatableRead' });
  }

  /**
   * @cc [owner:nareshshah139,label:product] queue-detail-read-only
   * Detail reads MUST preserve stored task and line state, including all timestamps.
   * Draft or cancelled prescriptions, deleted visits and prescriptions outside the branch MUST return not found.
   */
  async findOne(prescriptionId: string, branchId: string) {
    const [lifecycle] = await this.prisma.$queryRaw<PrescriptionQueueLifecycle[]>(prescriptionQueueLifecycle(prescriptionId, branchId));
    if (!lifecycle || ['DRAFT', 'CANCELLED'].includes(lifecycle.status)) throw new NotFoundException('Prescription not found in this branch');
    const prescription = (await this.prisma.prescription.findFirst({
      where: {
        id: prescriptionId,
        visit: {
          patient: {
            branchId,
          },
        },
      },
      include: this.prescriptionInclude(branchId),
    })) as LoadedPrescription | null;

    if (!prescription || (prescription as LoadedPrescription & { status?: string }).status === 'CANCELLED') {
      throw new NotFoundException('Prescription not found in this branch');
    }

    const task = await this.taskDelegate()?.findFirst({
      where: { branchId, prescriptionId }, include: { lines: true },
    });
    return this.mergeTask(this.toQueueEntry({ ...prescription, lifecycle }), task);
  }

  /**
   * @cc [owner:nareshshah139,label:product] queue-explicit-task-refresh
   * Explicit pull MAY create or refresh a branch task and stock annotations, but MUST NOT
   * move stock or change invoices. Refreshing an unchanged task status MUST preserve its timestamp.
   */
  async pull(prescriptionId: string, branchId: string) {
    return this.prisma.$transaction(async tx => {
      const service = new PharmacyPrescriptionQueueService(tx as PrismaService, this.drugService);
      await service.requireDispensingPrescription(prescriptionId, branchId);
      const entry = await service.findOne(prescriptionId, branchId);
      const stock = await service.stockCheck(prescriptionId, branchId);
      await service.requireDispensingPrescription(prescriptionId, branchId);
      await service.withPersistedTask(entry, branchId);
      await service.persistStockCheck(prescriptionId, branchId, stock.items);
      return { recomputedAt: new Date(), data: await service.findOne(prescriptionId, branchId) };
    });
  }

  /**
   * @cc [owner:nareshshah139,label:product] stock-check-billing-quantity
   * Stock checks MUST return each line's prescribed quantity, including the queue's
   * duration/frequency inference when no explicit quantity was recorded.
   */
  /**
   * @cc [owner:nareshshah139,label:product] queue-stock-check-read-only
   * Stock-check GETs MUST return live stock without creating tasks or persisting annotations.
   */
  async stockCheck(prescriptionId: string, branchId: string) {
    const entry = await this.findOne(prescriptionId, branchId);
    const items = await Promise.all(
      entry.medications.map(async (item) => ({
        ...await this.stockCheckMedication(item, branchId),
        sourceLineKey: item.sourceLineKey,
        prescribedQuantity: item.prescribedQuantity,
      })),
    );

    return {
      prescriptionId,
      checkedAt: new Date(),
      items: items.map(item => ({ ...item, prescriptionVersion: entry.prescriptionUpdatedAt?.toISOString() })),
    };
  }

  /**
   * @cc [owner:nareshshah139,label:product] task-status-timestamp-transition
   * Repeating the saved workflow status MUST preserve its lifecycle timestamp. A transition
   * MUST stamp the destination status without overwriting timestamps for other stages.
   */
  /**
   * @cc [owner:nareshshah139,label:product] task-ready-requires-reviewed-lines
   * READY_TO_BILL MUST reject empty tasks and current prescription lines with missing, pending
   * or unavailable reviews with BadRequestException and no changes; validation and writes MUST share the task lock.
   */
  async updateTaskStatus(
    taskId: string,
    body: UpdateDispenseTaskStatusDto,
    branchId: string,
    userId: string,
  ) {
    return this.prisma.$transaction(async tx => {
      const service = new PharmacyPrescriptionQueueService(tx as PrismaService, this.drugService);
      return service.saveTaskStatus(taskId, body, branchId, userId);
    });
  }

  private async saveTaskStatus(
    taskId: string,
    body: UpdateDispenseTaskStatusDto,
    branchId: string,
    userId: string,
  ) {
    const delegate = this.taskDelegate();
    if (!delegate) {
      throw new NotFoundException('Dispense task storage is not available');
    }

    await this.lockDispenseTask(taskId, branchId);

    const task = (await delegate.findFirst({
      where: { id: taskId, branchId },
      include: { lines: true },
    })) as DispenseTask | null;

    if (!task) {
      throw new NotFoundException('Dispense task not found in this branch');
    }

    const currentTask = await this.currentReviewTask(task, branchId);
    if (
      body.status === PharmacyDispenseTaskStatusDto.READY_TO_BILL &&
      (!currentTask.lines?.length ||
        currentTask.lines.some(line =>
          line.action === PharmacyDispenseLineActionDto.PENDING ||
          line.action === PharmacyDispenseLineActionDto.UNAVAILABLE,
        ))
    ) {
      throw new BadRequestException(
        'Review every available medicine before marking ready for billing. Unavailable medicines must be resolved first.',
      );
    }

    const now = new Date();
    await delegate.update({
      where: { id: taskId },
      data: {
        status: body.status,
        assignedToId: task.assignedToId
          ? task.assignedToId
          : body.status === PharmacyDispenseTaskStatusDto.IN_REVIEW
            ? userId
            : null,
        statusReasonType: body.reasonType || task.statusReasonType || null,
        statusReasonNote: body.reasonNote || task.statusReasonNote || null,
        ...(body.status !== task.status ? this.statusTimestampPatch(body.status, now) : {}),
      },
    });

    if (task.prescriptionId) {
      return this.findOne(task.prescriptionId, branchId);
    }

    return this.findTaskById(taskId, branchId);
  }

  async updateTaskLine(
    taskId: string,
    lineId: string,
    body: UpdateDispenseTaskLineDto,
    branchId: string,
    userId: string,
  ) {
    return this.prisma.$transaction(async tx => {
      const service = new PharmacyPrescriptionQueueService(tx as PrismaService, this.drugService);
      return service.saveTaskLine(taskId, lineId, body, branchId, userId);
    });
  }

  private async saveTaskLine(
    taskId: string,
    lineId: string,
    body: UpdateDispenseTaskLineDto,
    branchId: string,
    userId: string,
  ) {
    const delegate = this.taskDelegate();
    const lineDelegate = this.taskLineDelegate();
    if (!delegate || !lineDelegate) {
      throw new NotFoundException('Dispense task storage is not available');
    }

    await this.lockDispenseTask(taskId, branchId);

    const task = (await delegate.findFirst({
      where: { id: taskId, branchId },
      include: { lines: true },
    })) as DispenseTask | null;

    if (!task) {
      throw new NotFoundException('Dispense task not found in this branch');
    }

    if (!task.lines?.some((line) => line.id === lineId)) {
      throw new NotFoundException('Dispense task line not found');
    }

    const currentTask = await this.currentReviewTask(task, branchId);
    if (!currentTask.lines?.some(line => line.id === lineId)) {
      throw new BadRequestException('Prescription line changed. Pull the prescription and review its current medicines.');
    }

    await lineDelegate.update({
      where: { id: lineId },
      data: {
        action: body.action,
        reasonType: body.reasonType || null,
        reasonNote: body.reasonNote || null,
        substituteDrugId: body.substituteDrugId || null,
        substituteDrugName: body.substituteDrugName || null,
        editedQuantity: body.editedQuantity ?? null,
        pharmacistNotes: body.pharmacistNotes || null,
      },
    });

    const refreshed = (await delegate.findFirst({
      where: { id: taskId, branchId },
      include: { lines: true },
    })) as DispenseTask;
    const currentRefreshed = await this.currentReviewTask(refreshed, branchId);
    const nextStatus = this.nextStatusAfterLineReview(currentRefreshed);
    await delegate.update({
      where: { id: taskId },
      data: {
        status: nextStatus,
        assignedToId: task.assignedToId || userId,
        exceptionCount: this.taskExceptionCount(currentRefreshed),
        ...(nextStatus !== task.status ? this.statusTimestampPatch(nextStatus, new Date()) : {}),
      },
    });

    if (task.prescriptionId) {
      return this.findOne(task.prescriptionId, branchId);
    }

    return this.findTaskById(taskId, branchId);
  }

  /**
   * @cc [owner:nareshshah139,label:product;security] queue-command-source-eligibility
   * Prescription-backed commands MUST lock the source prescription through commit and require
   * ACTIVE status, an unexpired explicit validity date and an undeleted visit in the branch.
   */
  private async requireDispensingPrescription(prescriptionId: string, branchId: string) {
    const [source] = await this.prisma.$queryRaw<PrescriptionQueueLifecycle[]>(prescriptionQueueLifecycle(prescriptionId, branchId, true));
    if (!source) throw new NotFoundException('Prescription not found in this branch');
    if (source.status !== 'ACTIVE' || source.expired) throw new BadRequestException('Prescription is not active or has expired');
  }

  private async lockDispenseTask(taskId: string, branchId: string) {
    const task = await this.taskDelegate().findFirst({ where: { id: taskId, branchId }, select: { prescriptionId: true } });
    if (!task) throw new NotFoundException('Dispense task not found in this branch');
    if (task.prescriptionId) await this.requireDispensingPrescription(task.prescriptionId, branchId);
    await this.prisma.$queryRaw`SELECT id FROM pharmacy_dispense_tasks WHERE id = ${taskId} AND "branchId" = ${branchId} FOR UPDATE`;
  }

  private async withPersistedTask(
    entry: QueueEntry,
    branchId: string,
  ): Promise<QueueEntry> {
    const delegate = this.taskDelegate();
    if (!delegate) return entry;

    const task = await this.ensureTaskForEntry(entry, branchId);
    return this.mergeTask(entry, task);
  }

  private async ensureTaskForEntry(
    entry: QueueEntry,
    branchId: string,
  ): Promise<DispenseTask> {
    const delegate = this.taskDelegate();
    const lineDelegate = this.taskLineDelegate();
    const existing = (await delegate.findFirst({
      where: { branchId, prescriptionId: entry.prescriptionId },
      include: { lines: true },
    })) as DispenseTask | null;

    const linkedInvoiceIds = JSON.stringify(entry.linkedInvoiceIds);
    const derivedStatus = this.taskStatusFromQueue(entry.status);

    if (!existing) {
      try {
        return (await delegate.create({
          data: {
            branchId,
            prescriptionId: entry.prescriptionId,
            patientId: entry.patient.id,
            patientName: entry.patient.name,
            patientCode: entry.patient.patientCode || null,
            doctorId: entry.doctor.id,
            doctorName: entry.doctor.name,
            source: 'VISIT',
            status: derivedStatus,
            linkedInvoiceIds,
            exceptionCount: 0,
            metadata: {
              prescriptionCreatedAt: entry.createdAt.toISOString(),
            },
            lines: {
              create: entry.medications.map((medication) =>
                this.taskLineCreateData(medication),
              ),
            },
          },
          include: { lines: true },
        })) as DispenseTask;
      } catch {
        const raced = (await delegate.findFirst({
          where: { branchId, prescriptionId: entry.prescriptionId },
          include: { lines: true },
        })) as DispenseTask | null;
        if (raced) return raced;
        throw new NotFoundException('Unable to create dispense task');
      }
    }

    const bound = matchPrescriptionLines(entry.medications, existing.lines || []);
    if (lineDelegate) {
      for (const [index, medication] of entry.medications.entries()) {
        const line = bound[index];
        if (line) {
          if (!lineMetadata(line).prescriptionLineKey) {
            await lineDelegate.update({ where: { id: line.id }, data: {
              metadata: { ...lineMetadata(line), prescriptionLineKey: medication.sourceLineKey },
            } });
          }
        } else {
          await lineDelegate.create({ data: { taskId: existing.id, ...this.taskLineCreateData(medication) } });
        }
      }
      const currentIds = new Set(bound.filter(Boolean).map(line => line!.id));
      for (const line of existing.lines || []) {
        if (!currentIds.has(line.id) && !lineMetadata(line).prescriptionLineRetired) {
          await lineDelegate.update({ where: { id: line.id }, data: {
            metadata: { ...lineMetadata(line), prescriptionLineRetired: true },
          } });
        }
      }
    }

    let status = this.syncedTaskStatus(existing.status, entry.status);
    if (status === PharmacyDispenseTaskStatusDto.READY_TO_BILL) {
      status = this.nextStatusAfterLineReview(this.reviewTask(existing, entry));
    }
    return (await delegate.update({
      where: { id: existing.id },
      data: {
        patientId: entry.patient.id,
        patientName: entry.patient.name,
        patientCode: entry.patient.patientCode || null,
        doctorId: entry.doctor.id,
        doctorName: entry.doctor.name,
        linkedInvoiceIds,
        status,
        ...(status !== existing.status ? this.statusTimestampPatch(status, new Date()) : {}),
      },
      include: { lines: true },
    })) as DispenseTask;
  }

  /**
   * @cc [owner:nareshshah139,label:product] current-prescription-review-lines
   * Workflow review MUST count only current prescription lines. Missing bindings MUST count
   * as pending; removed or replaced saved lines MUST be unavailable to review commands.
   */
  private reviewTask(task: DispenseTask, entry: QueueEntry): DispenseTask {
    const bound = matchPrescriptionLines(entry.medications, task.lines || []);
    return { ...task, lines: entry.medications.map((medication, index) => bound[index] || {
      id: '', drugName: medication.drugName, action: PharmacyDispenseLineActionDto.PENDING,
      dispensedQuantity: medication.dispensedQuantity,
    }) };
  }

  private async currentReviewTask(task: DispenseTask, branchId: string): Promise<DispenseTask> {
    return task.prescriptionId
      ? this.reviewTask(task, await this.findOne(task.prescriptionId, branchId)) : task;
  }

  private async findTaskById(taskId: string, branchId: string) {
    const delegate = this.taskDelegate();
    const task = (await delegate.findFirst({
      where: { id: taskId, branchId },
      include: { lines: true },
    })) as DispenseTask | null;

    if (!task) {
      throw new NotFoundException('Dispense task not found in this branch');
    }

    if (task.prescriptionId) {
      return this.findOne(task.prescriptionId, branchId);
    }

    return {
      dispenseTaskId: task.id,
      prescriptionId: '',
      patient: {
        id: task.patientId,
        name: task.patientName,
        patientCode: task.patientCode || null,
      },
      doctor: {
        id: task.doctorId || '',
        name: task.doctorName || 'Counter',
      },
      createdAt: new Date(),
      pendingHours: 0,
      isOverTwoHours: false,
      medications: [],
      linkedInvoiceIds: [],
      status: this.queueStatusFromTask(task.status, PrescriptionQueueStatus.PENDING),
      dispenseStatus: task.status,
      source: task.source,
      assignedToId: task.assignedToId,
      statusReasonType: task.statusReasonType,
      statusReasonNote: task.statusReasonNote,
    };
  }

  private mergeTask(entry: QueueEntry, task?: DispenseTask | null): QueueEntry {
    if (!task) return { ...entry, medications: entry.medications.map(line => ({ ...line, action: 'pending' })), dispenseStatus: this.taskStatusFromQueue(entry.status), source: 'VISIT' };
    const synced = this.syncedTaskStatus(task.status, entry.status);
    const queueStatus = this.queueStatusFromTask(synced, entry.status);
    const blocked = entry.dispensingEligible === false && queueStatus !== PrescriptionQueueStatus.DISPENSED;
    const status = blocked && synced !== 'CANCELLED' ? PharmacyDispenseTaskStatusDto.PAUSED : synced;
    const lines = matchPrescriptionLines(entry.medications, task.lines || []);
    const reviewStatus = status === PharmacyDispenseTaskStatusDto.READY_TO_BILL
      ? this.nextStatusAfterLineReview(this.reviewTask(task, entry)) : status;

    return {
      ...entry,
      dispenseTaskId: task.id,
      status: blocked ? PrescriptionQueueStatus.EXPIRED : queueStatus,
      dispenseStatus: reviewStatus,
      source: task.source,
      assignedToId: task.assignedToId,
      statusReasonType: task.statusReasonType,
      statusReasonNote: task.statusReasonNote,
      startedAt: task.startedAt,
      pausedAt: task.pausedAt,
      readyToBillAt: task.readyToBillAt,
      paidAt: task.paidAt,
      dispensedAt: task.dispensedAt,
      cancelledAt: task.cancelledAt,
      lastStockCheckAt: task.lastStockCheckAt,
      medications: entry.medications.map((medication, index) => {
        const line = lines[index];
        if (!line) return { ...medication, lineId: undefined, action: 'pending' };
        return {
          ...medication,
          lineId: line.id,
          action: this.uiActionFromTask(line.action),
          reasonType: line.reasonType,
          reasonNote: line.reasonNote,
          suggestedDrugId: line.suggestedDrugId,
          suggestedInventoryItemId: line.suggestedInventoryItemId,
          suggestedDrugName: line.suggestedDrugName,
          confidence: line.confidence,
          recommendedBatchNumber: line.recommendedBatchNumber,
          recommendedExpiryDate: line.recommendedExpiryDate,
          recommendedStorageLocation: line.recommendedStorageLocation,
          warnings: line.warnings,
        };
      }),
    };
  }

  private async persistStockCheck(
    prescriptionId: string,
    branchId: string,
    items: StockCheckResult[],
  ) {
    const delegate = this.taskDelegate();
    const lineDelegate = this.taskLineDelegate();
    if (!delegate || !lineDelegate) return;

    const task = (await delegate.findFirst({
      where: { branchId, prescriptionId },
      include: { lines: true },
    })) as DispenseTask | null;
    if (!task) return;

    const linesByKey = new Map(
      (task.lines || []).filter(line => !lineMetadata(line).prescriptionLineRetired)
        .map(line => [lineMetadata(line).prescriptionLineKey, line]),
    );

    for (const item of items) {
      const line = item.sourceLineKey ? linesByKey.get(item.sourceLineKey) : undefined;
      if (!line) continue;
      const recommendedBatch = item.batches?.[0] || null;
      await lineDelegate.update({
        where: { id: line.id },
        data: {
          suggestedDrugId: item.matchedDrug?.id || null,
          suggestedInventoryItemId: recommendedBatch?.id || null,
          suggestedDrugName: item.matchedDrug?.name || null,
          confidence: item.matchedDrug ? 0.9 : 0.2,
          stockStatus: item.stockStatus,
          recommendedBatchNumber: recommendedBatch?.batchNumber || null,
          recommendedExpiryDate: recommendedBatch?.expiryDate || null,
          recommendedStorageLocation: recommendedBatch?.storageLocation || null,
          warnings: this.stockWarningPayload(item),
        },
      });
    }

    await delegate.update({
      where: { id: task.id },
      data: {
        lastStockCheckAt: new Date(),
        exceptionCount: items.filter(
          (item) =>
            item.stockStatus !== 'IN_STOCK' || item.lowStock || item.nearExpiry,
        ).length,
      },
    });
  }

  private taskDelegate() {
    return (this.prisma as any).pharmacyDispenseTask;
  }

  private taskLineDelegate() {
    return (this.prisma as any).pharmacyDispenseTaskLine;
  }

  private taskLineCreateData(medication: QueueMedication) {
    return {
      metadata: { prescriptionLineKey: medication.sourceLineKey },
      drugName: medication.drugName,
      genericName: medication.genericName || null,
      originalText: JSON.stringify({
        ...medication.sourceItem,
        drugName: medication.drugName,
        dosage: medication.dosage,
        dosageUnit: medication.dosageUnit,
        frequency: medication.frequency,
        duration: medication.duration,
        durationUnit: medication.durationUnit,
        instructions: medication.instructions,
        prescribedQuantity: medication.prescribedQuantity,
      }),
      dosage:
        medication.dosage === undefined || medication.dosage === null
          ? null
          : String(medication.dosage),
      dosageUnit: medication.dosageUnit || null,
      frequency: medication.frequency || null,
      duration:
        medication.duration === undefined || medication.duration === null
          ? null
          : String(medication.duration),
      durationUnit: medication.durationUnit || null,
      instructions: medication.instructions || null,
      prescribedQuantity:
        medication.prescribedQuantity === null
          ? null
          : Math.ceil(medication.prescribedQuantity),
      dispensedQuantity: Math.ceil(medication.dispensedQuantity || 0),
      action: PharmacyDispenseLineActionDto.PENDING,
    };
  }

  private taskStatusFromQueue(status: PrescriptionQueueStatus): string {
    if (status === PrescriptionQueueStatus.DISPENSED) {
      return PharmacyDispenseTaskStatusDto.DISPENSED;
    }
    if (status === PrescriptionQueueStatus.PARTIAL) {
      return PharmacyDispenseTaskStatusDto.PARTIALLY_FILLED;
    }
    if (status === PrescriptionQueueStatus.EXPIRED) {
      return PharmacyDispenseTaskStatusDto.PAUSED;
    }
    return PharmacyDispenseTaskStatusDto.QUEUED;
  }

  private syncedTaskStatus(
    currentStatus: string,
    derivedStatus: PrescriptionQueueStatus,
  ): string {
    if (
      [
        PharmacyDispenseTaskStatusDto.CANCELLED,
        PharmacyDispenseTaskStatusDto.PAID,
        PharmacyDispenseTaskStatusDto.DISPENSED,
      ].includes(currentStatus as PharmacyDispenseTaskStatusDto)
    ) {
      return currentStatus;
    }

    if (derivedStatus === PrescriptionQueueStatus.DISPENSED) {
      return PharmacyDispenseTaskStatusDto.DISPENSED;
    }

    if (
      derivedStatus === PrescriptionQueueStatus.PARTIAL &&
      currentStatus === PharmacyDispenseTaskStatusDto.QUEUED
    ) {
      return PharmacyDispenseTaskStatusDto.PARTIALLY_FILLED;
    }

    if (
      derivedStatus === PrescriptionQueueStatus.EXPIRED &&
      currentStatus === PharmacyDispenseTaskStatusDto.QUEUED
    ) {
      return PharmacyDispenseTaskStatusDto.PAUSED;
    }

    return currentStatus;
  }

  /**
   * @cc [owner:nareshshah139,label:product] billed-prescription-not-pending
   * A prescription with invoice-derived Partial or Dispensed status MUST NOT return to
   * Pending because its workflow task remains In Review, Ready to Bill, or Paid.
   */
  private queueStatusFromTask(
    taskStatus: string,
    fallback: PrescriptionQueueStatus,
  ): PrescriptionQueueStatus {
    if (taskStatus === PharmacyDispenseTaskStatusDto.DISPENSED) {
      return PrescriptionQueueStatus.DISPENSED;
    }
    if (taskStatus === PharmacyDispenseTaskStatusDto.PARTIALLY_FILLED) {
      return PrescriptionQueueStatus.PARTIAL;
    }
    if (
      taskStatus === PharmacyDispenseTaskStatusDto.PAUSED ||
      taskStatus === PharmacyDispenseTaskStatusDto.CANCELLED
    ) {
      return PrescriptionQueueStatus.EXPIRED;
    }
    if (
      taskStatus === PharmacyDispenseTaskStatusDto.READY_TO_BILL ||
      taskStatus === PharmacyDispenseTaskStatusDto.PAID ||
      taskStatus === PharmacyDispenseTaskStatusDto.IN_REVIEW
    ) {
      return fallback === PrescriptionQueueStatus.PARTIAL || fallback === PrescriptionQueueStatus.DISPENSED
        ? fallback
        : PrescriptionQueueStatus.PENDING;
    }
    return fallback;
  }

  private uiActionFromTask(action: string): string {
    const map: Record<string, string> = {
      PENDING: 'pending',
      ACCEPTED: 'accepted',
      SUBSTITUTE: 'substitute',
      EDITED: 'edit',
      UNAVAILABLE: 'unavailable',
    };
    return map[action] || 'pending';
  }

  private statusTimestampPatch(status: string, timestamp: Date) {
    if (status === PharmacyDispenseTaskStatusDto.IN_REVIEW) {
      return { startedAt: timestamp };
    }
    if (status === PharmacyDispenseTaskStatusDto.PAUSED) {
      return { pausedAt: timestamp };
    }
    if (status === PharmacyDispenseTaskStatusDto.READY_TO_BILL) {
      return { readyToBillAt: timestamp };
    }
    if (status === PharmacyDispenseTaskStatusDto.PAID) {
      return { paidAt: timestamp };
    }
    if (status === PharmacyDispenseTaskStatusDto.DISPENSED) {
      return { dispensedAt: timestamp };
    }
    if (status === PharmacyDispenseTaskStatusDto.CANCELLED) {
      return { cancelledAt: timestamp };
    }
    return {};
  }

  private nextStatusAfterLineReview(task: DispenseTask): string {
    if (
      [
        PharmacyDispenseTaskStatusDto.CANCELLED,
        PharmacyDispenseTaskStatusDto.PAID,
        PharmacyDispenseTaskStatusDto.DISPENSED,
      ].includes(task.status as PharmacyDispenseTaskStatusDto)
    ) {
      return task.status;
    }

    const lines = task.lines || [];
    if (lines.length === 0) {
      return PharmacyDispenseTaskStatusDto.IN_REVIEW;
    }

    const reviewed = lines.filter(
      (line) => line.action !== PharmacyDispenseLineActionDto.PENDING,
    );

    if (reviewed.length < lines.length) {
      return PharmacyDispenseTaskStatusDto.IN_REVIEW;
    }

    if (
      lines.some(
        (line) => line.action === PharmacyDispenseLineActionDto.UNAVAILABLE,
      )
    ) {
      return PharmacyDispenseTaskStatusDto.PARTIALLY_FILLED;
    }

    return PharmacyDispenseTaskStatusDto.READY_TO_BILL;
  }

  private taskExceptionCount(task: DispenseTask): number {
    return (task.lines || []).filter((line) => {
      const warnings = Array.isArray(line.warnings) ? line.warnings : [];
      return (
        line.action === PharmacyDispenseLineActionDto.UNAVAILABLE ||
        (line.stockStatus && line.stockStatus !== 'IN_STOCK') ||
        warnings.length > 0
      );
    }).length;
  }

  private stockWarningPayload(item: {
    stockStatus: string;
    lowStock: boolean;
    nearExpiry: boolean;
  }) {
    const warnings: string[] = [];
    if (item.stockStatus === 'UNMATCHED') warnings.push('UNMATCHED');
    if (item.stockStatus === 'OUT_OF_STOCK') warnings.push('OUT_OF_STOCK');
    if (item.lowStock) warnings.push('LOW_STOCK');
    if (item.nearExpiry) warnings.push('NEAR_EXPIRY');
    return warnings;
  }

  private prescriptionInclude(branchId: string) {
    return {
      visit: {
        select: {
          patient: {
            select: {
              id: true,
              name: true,
              patientCode: true,
            },
          },
          doctor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
      pharmacyInvoices: {
        where: {
          branchId,
        },
        orderBy: {
          invoiceDate: 'desc' as const,
        },
        select: {
          id: true,
          status: true,
          items: {
            select: {
              id: true,
              quantity: true,
              inventoryItemId: true,
              drug: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    };
  }

  /**
   * @cc [owner:nareshshah139,label:product] prescription-coverage-posted-invoices-only
   * Only CONFIRMED, DISPENSED and COMPLETED invoices may contribute fulfilled quantities.
   * Draft/pending invoices alone MUST leave the prescription pending (or age-expired),
   * including after a failed stock confirmation; linked invoice IDs remain available for review.
   */
  /**
   * @cc [owner:nareshshah139,label:product] prescription-coverage-no-double-credit
   * Posted invoice units MUST be consumed once in prescription order and invoice-item ID order,
   * up to each known prescribed quantity. Unknown quantities may consume remaining matching units.
   */
  private toQueueEntry(prescription: LoadedPrescription, nowMs = Date.now()): QueueEntry {
    const pendingHours = Math.max(
      0,
      (nowMs - prescription.createdAt.getTime()) / (60 * 60 * 1000),
    );
    const invoiceIds = prescription.pharmacyInvoices.map(
      (invoice) => invoice.id,
    );
    const activeInvoices = prescription.pharmacyInvoices.filter(
      (invoice) => ['CONFIRMED', 'DISPENSED', 'COMPLETED'].includes(invoice.status),
    );
    const rawItems = this.parsePrescriptionItems(prescription.items);
    const invoiceItems = activeInvoices.flatMap(invoice => invoice.items)
      .sort((a, b) => (a.id || '').localeCompare(b.id || ''))
      .map(item => ({ ...item, remaining: Math.max(0, item.quantity) }));
    const medications = rawItems.map(item => this.toMedicationCoverage(item, invoiceItems));
    const sourceLineKeys = prescriptionLineKeys(medications);
    medications.forEach((medication, index) => { medication.sourceLineKey = sourceLineKeys[index]; });
    const hasCompletedInvoice = activeInvoices.some((invoice) =>
      ['DISPENSED', 'COMPLETED'].includes(invoice.status),
    );
    const inferredMedications = medications.filter(
      (medication) => medication.quantityInferred,
    );

    let status: PrescriptionQueueStatus;
    if (activeInvoices.length === 0 && !prescription.pharmacyInvoices.some(invoice => invoice.status === 'CANCELLED')) {
      status =
        pendingHours > this.expiredAfterHours
          ? PrescriptionQueueStatus.EXPIRED
          : PrescriptionQueueStatus.PENDING;
    } else if (
      hasCompletedInvoice ||
      (inferredMedications.length > 0 &&
        inferredMedications.every(
          (medication) => medication.coverageStatus === 'covered',
        ))
    ) {
      status = PrescriptionQueueStatus.DISPENSED;
    } else {
      status = PrescriptionQueueStatus.PARTIAL;
    }

    const prescriptionStatus = prescription.lifecycle?.status ?? 'ACTIVE';
    const dispensingEligible = prescriptionStatus === 'ACTIVE' && !prescription.lifecycle?.expired;
    if (!dispensingEligible && status !== PrescriptionQueueStatus.DISPENSED) status = PrescriptionQueueStatus.EXPIRED;

    return {
      prescriptionId: prescription.id,
      prescriptionStatus,
      dispensingEligible,
      prescriptionUpdatedAt: prescription.updatedAt,
      patient: prescription.visit.patient,
      doctor: {
        id: prescription.visit.doctor.id,
        name: this.formatDoctorName(prescription.visit.doctor),
      },
      createdAt: prescription.createdAt,
      pendingHours: Number(pendingHours.toFixed(2)),
      isOverTwoHours: pendingHours > this.warningAfterHours,
      medications,
      linkedInvoiceIds: invoiceIds,
      status,
    };
  }

  /**
   * @cc [owner:nareshshah139,label:product] prescription-complete-source-snapshot
   * Queue projection MUST retain every persisted item field for review identity and saved
   * originalText; clinical fields outside the display projection MUST NOT be discarded.
   */
  private toMedicationCoverage(
    item: PrescriptionItem,
    invoiceItems: Array<LoadedInvoiceItem & { remaining: number }>,
  ): QueueMedication {
    const drugName = this.itemDrugName(item);
    const prescribedQuantity = this.inferQuantity(item);
    let remaining = prescribedQuantity ?? Number.POSITIVE_INFINITY;
    let dispensedQuantity = 0;
    for (const invoiceItem of invoiceItems) {
      const matches = item.inventoryItemId && invoiceItem.inventoryItemId
        ? item.inventoryItemId === invoiceItem.inventoryItemId
        : item.drugId ? item.drugId === invoiceItem.drug?.id
          : this.namesMatch(drugName, invoiceItem.drug?.name || '');
      if (!matches) continue;
      const quantity = Math.min(remaining, invoiceItem.remaining);
      dispensedQuantity += quantity;
      remaining -= quantity;
      invoiceItem.remaining -= quantity;
    }

    let coverageStatus: QueueMedication['coverageStatus'] = 'unknown';
    if (prescribedQuantity !== null) {
      if (dispensedQuantity <= 0) coverageStatus = 'not_started';
      else if (dispensedQuantity >= prescribedQuantity)
        coverageStatus = 'covered';
      else coverageStatus = 'partial';
    }

    return {
      sourceItem: { ...item },
      drugName,
      drugId: item.drugId || null,
      inventoryItemId: item.inventoryItemId || null,
      genericName: item.genericName || null,
      dosage: item.dosage ?? null,
      dosageUnit: item.dosageUnit || null,
      frequency: item.frequency || null,
      duration: item.duration ?? null,
      durationUnit: item.durationUnit || null,
      instructions: item.instructions || null,
      prescribedQuantity,
      quantityInferred: prescribedQuantity !== null,
      dispensedQuantity,
      coverageStatus,
    };
  }

  /**
   * @cc [owner:nareshshah139,label:product] queue-stock-available-units
   * Every prescribed line MUST report current branch stock using saved inventory identity.
   * Available quantity excludes held and expired units; expiry remains valid through its UTC
   * calendar day. Failed reads MUST propagate instead of becoming zero-stock results.
   */
  private async stockCheckMedication(medication: QueueMedication, branchId: string): Promise<StockCheckResult> {
    const resolved = await resolvePrescriptionInventory(this.prisma, medication, branchId);
    if (!resolved) return {
      drugName: medication.drugName, matchedDrug: null, inventoryItemId: null,
      stockStatus: 'UNMATCHED', totalNonExpiredStock: 0, batches: [], lowStock: false,
      nearExpiry: false, alternatives: [],
      suggestions: await searchClinicInventory(this.prisma, medication.drugName, branchId, 5),
    };
    const { anchor, drug } = resolved;
    const now = new Date();
    const batches = resolved.batches.filter((b: any) => availableStock(b, now) > 0)
      .sort((a: any, b: any) => this.compareExpiry(a.expiryDate, b.expiryDate) || a.id.localeCompare(b.id))
      .map((b: any) => ({ ...b, currentStock: availableStock(b, now) }));
    const quantity = batches.reduce((sum: number, b: any) => sum + b.currentStock, 0);
    const thresholds = resolved.batches.map((b: any) => b.reorderLevel ?? b.minStockLevel).filter((n: any) => n != null);
    const threshold = thresholds.length ? Math.max(...thresholds) : drug?.minStockLevel ?? 0;
    const lowStock = quantity > 0 && quantity <= threshold;
    return {
      drugName: medication.drugName, inventoryItemId: anchor.id, unit: anchor.unit,
      matchedDrug: drug ? { id: drug.id, name: drug.name, manufacturerName: drug.manufacturerName } : null,
      stockStatus: quantity === 0 ? 'OUT_OF_STOCK' : lowStock ? 'LOW_STOCK' : 'IN_STOCK',
      totalNonExpiredStock: quantity,
      totalOnHandStock: resolved.batches.reduce((n: number, b: any) => n + b.currentStock, 0),
      heldStock: resolved.batches.reduce((n: number, b: any) => n + (b.heldStock || 0), 0),
      expiredStock: resolved.batches.reduce((n: number, b: any) => n + (b.expiryDate && new Date(b.expiryDate) < new Date(now.toISOString().slice(0, 10)) ? b.currentStock : 0), 0),
      batches, lowStock,
      nearExpiry: batches.some((b: any) => b.expiryDate && new Date(b.expiryDate).getTime() <= now.getTime() + this.nearExpiryDays * 86400000),
      alternatives: [], suggestions: [],
    };
  }

  async inventoryStock(inventoryItemId: string, branchId: string) {
    return this.stockCheckMedication({ drugName: '', inventoryItemId } as QueueMedication, branchId);
  }

  async inventorySuggestions(query: string, branchId: string) {
    return searchClinicInventory(this.prisma, query, branchId);
  }

  /**
   * @cc [owner:nareshshah139,label:product] pharmacist-link-confirmation
   * Only an explicitly selected active inventory item in the prescription's branch may become
   * a remembered mapping, and its prescription revision MUST match the reviewed stock check.
   * Mapping and actor/before-after audit MUST commit together, leave stock
   * unchanged, and apply to the same source identity across patients in that branch.
   */
  async linkInventory(prescriptionId: string, index: number, inventoryItemId: string, branchId: string, userId: string, expectedVersion: string) {
    if (!Number.isSafeInteger(index) || index < 0 || !inventoryItemId || !userId) throw new BadRequestException('Select a prescription line and inventory item');
    await this.prisma.$transaction(async (tx) => {
      await new PharmacyPrescriptionQueueService(tx as PrismaService, this.drugService).requireDispensingPrescription(prescriptionId, branchId);
      const prescription = await tx.prescription.findFirst({ where: { id: prescriptionId, visit: { patient: { branchId } } } });
      if (!prescription) throw new NotFoundException('Prescription not found in this branch');
      if (!expectedVersion || prescription.updatedAt.toISOString() !== expectedVersion) throw new BadRequestException('Prescription changed. Refresh before linking inventory.');
      const items = this.parsePrescriptionItems(prescription.items);
      const source = items[index];
      if (!source) throw new BadRequestException('Prescription line no longer exists');
      const inventory = await tx.inventoryItem.findFirst({ where: { id: inventoryItemId, branchId, status: 'ACTIVE' }, include: inventoryIdentityInclude });
      if (!inventory) throw new NotFoundException('Inventory item not found in this branch');
      if (inventory.drugs.some(d => d.branchId !== branchId || !d.isActive || d.isDiscontinued)) throw new BadRequestException('Review inactive or invalid product links in Inventory first');
      if (inventory.drugs.length > 1) throw new BadRequestException('This inventory item has multiple product links. Review duplicate products first.');
      // Unmapped inventory is promoted to a clinic catalog product only after this explicit choice.
      if (!inventory.drugs.length) await tx.drug.create({ data: {
        name: inventory.name, price: inventory.sellingPrice, manufacturerName: inventory.manufacturer || '',
        packSizeLabel: `${inventory.packSize || 1} ${inventory.packUnit || inventory.unit}`,
        branchId, inventoryItems: { connect: { id: inventory.id } },
      } });
      const sourceKey = prescriptionSourceKey({ ...source, drugName: this.itemDrugName(source) });
      const where = { branchId_sourceKey: { branchId, sourceKey } };
      const previous = await tx.prescriptionInventoryLink.findUnique({ where });
      const link = await tx.prescriptionInventoryLink.upsert({ where,
        create: { branchId, sourceKey, sourceName: this.itemDrugName(source), inventoryItemId, linkedBy: userId },
        update: { inventoryItemId, linkedBy: userId },
      });
      // Bind this historical prescription too, so a later alias edit cannot silently change it.
      items[index] = { ...source, inventoryItemId };
      await tx.prescription.update({ where: { id: prescription.id, updatedAt: prescription.updatedAt }, data: { items: JSON.stringify(items) } });
      await tx.auditLog.create({ data: { userId, action: 'PRESCRIPTION_INVENTORY_LINKED', entity: 'PrescriptionInventoryLink', entityId: link.id,
        oldValues: JSON.stringify(previous), newValues: JSON.stringify({ ...link, prescriptionId, lineIndex: index, reason: 'Pharmacist confirmed inventory match' }) } });
    }, { isolationLevel: 'Serializable' });
    return this.stockCheck(prescriptionId, branchId);
  }

  private parsePrescriptionItems(items: string): PrescriptionItem[] {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private inferQuantity(item: PrescriptionItem): number | null {
    const explicitQuantity = this.toPositiveNumber(
      item.quantity ??
        item.prescribedQuantity ??
        item.totalQuantity ??
        item.qty,
    );
    if (explicitQuantity !== null) return explicitQuantity;

    const perDay = this.frequencyToPerDay(item.frequency);
    const duration = this.toPositiveNumber(item.duration);
    const multiplier = this.durationToDaysMultiplier(item.durationUnit);
    if (perDay === null || duration === null || multiplier === null) {
      return null;
    }

    return Math.ceil(perDay * duration * multiplier);
  }

  private frequencyToPerDay(frequency?: string | null): number | null {
    const normalized = this.normalizeName(frequency || '');
    const map = queueFrequencyPerDay;

    return map[normalized] ?? null;
  }

  private durationToDaysMultiplier(
    durationUnit?: string | null,
  ): number | null {
    const normalized = this.normalizeName(durationUnit || 'days');
    const map = queueDurationDays;

    return map[normalized] ?? null;
  }

  private toPositiveNumber(value?: string | number | null): number | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed =
      typeof value === 'number' ? value : Number.parseFloat(String(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private namesMatch(a: string, b: string): boolean {
    const left = this.normalizeName(a);
    const right = this.normalizeName(b);
    return Boolean(
      left &&
        right &&
        (left === right || left.includes(right) || right.includes(left)),
    );
  }

  private itemDrugName(item: PrescriptionItem): string {
    return (
      item.drugName || item.brandName || item.genericName || 'Unknown drug'
    );
  }

  private normalizeName(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private compareExpiry(a?: Date | null, b?: Date | null): number {
    const left = a ? a.getTime() : Number.MAX_SAFE_INTEGER;
    const right = b ? b.getTime() : Number.MAX_SAFE_INTEGER;
    return left - right;
  }

  private formatDoctorName(doctor: {
    firstName: string;
    lastName: string;
  }): string {
    return [doctor.firstName, doctor.lastName].filter(Boolean).join(' ');
  }

  private toPositiveInt(value: unknown, fallback: number): number {
    const parsed =
      typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed)
      : fallback;
  }
}
