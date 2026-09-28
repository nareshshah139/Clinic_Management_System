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

  async findAll(query: QueryPrescriptionQueueDto, branchId: string) {
    const page = this.toPositiveInt(query.page, 1);
    const limit = Math.min(this.toPositiveInt(query.limit, 20), 100);
    const prescriptions = (await this.prisma.prescription.findMany({
      where: {
        visit: {
          patient: {
            branchId,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: this.prescriptionInclude(branchId),
    })) as LoadedPrescription[];

    const entriesWithTasks = await Promise.all(
      prescriptions.map((prescription) =>
        this.withPersistedTask(this.toQueueEntry(prescription), branchId),
      ),
    );
    const entries = entriesWithTasks.filter(
      (entry) => !query.status || entry.status === query.status,
    );
    const start = (page - 1) * limit;
    const data = entries.slice(start, start + limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total: entries.length,
        pages: Math.ceil(entries.length / limit),
      },
    };
  }

  async findOne(prescriptionId: string, branchId: string) {
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

    if (!prescription) {
      throw new NotFoundException('Prescription not found in this branch');
    }

    return this.withPersistedTask(this.toQueueEntry(prescription), branchId);
  }

  async pull(prescriptionId: string, branchId: string) {
    return {
      recomputedAt: new Date(),
      data: await this.findOne(prescriptionId, branchId),
    };
  }

  /**
   * @cc [owner:nareshshah139,label:product] stock-check-billing-quantity
   * Stock checks MUST return each line's prescribed quantity, including the queue's
   * duration/frequency inference when no explicit quantity was recorded.
   */
  async stockCheck(prescriptionId: string, branchId: string) {
    const entry = await this.findOne(prescriptionId, branchId);
    const items = await Promise.all(
      entry.medications.map(async (item) => ({
        ...await this.stockCheckMedication(item, branchId),
        prescribedQuantity: item.prescribedQuantity,
      })),
    );
    await this.persistStockCheck(prescriptionId, branchId, items);

    return {
      prescriptionId,
      checkedAt: new Date(),
      items: items.map(item => ({ ...item, prescriptionVersion: entry.prescriptionUpdatedAt?.toISOString() })),
    };
  }

  async updateTaskStatus(
    taskId: string,
    body: UpdateDispenseTaskStatusDto,
    branchId: string,
    userId: string,
  ) {
    const delegate = this.taskDelegate();
    if (!delegate) {
      throw new NotFoundException('Dispense task storage is not available');
    }

    const task = (await delegate.findFirst({
      where: { id: taskId, branchId },
      include: { lines: true },
    })) as DispenseTask | null;

    if (!task) {
      throw new NotFoundException('Dispense task not found in this branch');
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
        ...this.statusTimestampPatch(body.status, now),
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
    const delegate = this.taskDelegate();
    const lineDelegate = this.taskLineDelegate();
    if (!delegate || !lineDelegate) {
      throw new NotFoundException('Dispense task storage is not available');
    }

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
    const nextStatus = this.nextStatusAfterLineReview(refreshed);
    await delegate.update({
      where: { id: taskId },
      data: {
        status: nextStatus,
        assignedToId: task.assignedToId || userId,
        exceptionCount: this.taskExceptionCount(refreshed),
        ...this.statusTimestampPatch(nextStatus, new Date()),
      },
    });

    if (task.prescriptionId) {
      return this.findOne(task.prescriptionId, branchId);
    }

    return this.findTaskById(taskId, branchId);
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

    if (lineDelegate) {
      const existingNames = new Set(
        (existing.lines || []).map((line) => this.normalizeName(line.drugName)),
      );
      const missingLines = entry.medications.filter(
        (medication) => !existingNames.has(this.normalizeName(medication.drugName)),
      );

      for (const medication of missingLines) {
        await lineDelegate.create({
          data: {
            taskId: existing.id,
            ...this.taskLineCreateData(medication),
          },
        });
      }
    }

    const status = this.syncedTaskStatus(existing.status, entry.status);
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
        ...this.statusTimestampPatch(status, new Date()),
      },
      include: { lines: true },
    })) as DispenseTask;
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

  private mergeTask(entry: QueueEntry, task: DispenseTask): QueueEntry {
    const linesByName = new Map(
      (task.lines || []).map((line) => [this.normalizeName(line.drugName), line]),
    );

    return {
      ...entry,
      dispenseTaskId: task.id,
      status: this.queueStatusFromTask(task.status, entry.status),
      dispenseStatus: task.status,
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
      medications: entry.medications.map((medication) => {
        const line = linesByName.get(this.normalizeName(medication.drugName));
        if (!line) return medication;
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

    const linesByName = new Map(
      (task.lines || []).map((line) => [this.normalizeName(line.drugName), line]),
    );

    for (const item of items) {
      const line = linesByName.get(this.normalizeName(item.drugName));
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
      drugName: medication.drugName,
      genericName: medication.genericName || null,
      originalText: JSON.stringify({
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
  private toQueueEntry(prescription: LoadedPrescription): QueueEntry {
    const nowMs = Date.now();
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
    const medications = rawItems.map((item) =>
      this.toMedicationCoverage(item, activeInvoices),
    );
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

    return {
      prescriptionId: prescription.id,
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

  private toMedicationCoverage(
    item: PrescriptionItem,
    invoices: LoadedInvoice[],
  ): QueueMedication {
    const drugName = this.itemDrugName(item);
    const prescribedQuantity = this.inferQuantity(item);
    const dispensedQuantity = invoices.reduce((sum, invoice) => {
      return (
        sum +
        invoice.items
          .filter((invoiceItem) => {
            if (item.inventoryItemId && invoiceItem.inventoryItemId) return item.inventoryItemId === invoiceItem.inventoryItemId;
            if (item.drugId) return item.drugId === invoiceItem.drug?.id;
            return this.namesMatch(drugName, invoiceItem.drug?.name || '');
          })
          .reduce((itemSum, invoiceItem) => itemSum + invoiceItem.quantity, 0)
      );
    }, 0);

    let coverageStatus: QueueMedication['coverageStatus'] = 'unknown';
    if (prescribedQuantity !== null) {
      if (dispensedQuantity <= 0) coverageStatus = 'not_started';
      else if (dispensedQuantity >= prescribedQuantity)
        coverageStatus = 'covered';
      else coverageStatus = 'partial';
    }

    return {
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
    const map: Record<string, number> = {
      once_daily: 1,
      od: 1,
      daily: 1,
      twice_daily: 2,
      bid: 2,
      bd: 2,
      three_times_daily: 3,
      tid: 3,
      tds: 3,
      four_times_daily: 4,
      qid: 4,
      qds: 4,
      every_12_hours: 2,
      every_8_hours: 3,
      every_6_hours: 4,
      every_4_hours: 6,
      weekly: 1 / 7,
      monthly: 1 / 30,
    };

    return map[normalized] ?? null;
  }

  private durationToDaysMultiplier(
    durationUnit?: string | null,
  ): number | null {
    const normalized = this.normalizeName(durationUnit || 'days');
    const map: Record<string, number> = {
      day: 1,
      days: 1,
      week: 7,
      weeks: 7,
      month: 30,
      months: 30,
      year: 365,
      years: 365,
    };

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
