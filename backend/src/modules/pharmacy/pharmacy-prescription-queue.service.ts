import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { DrugService } from './drug.service';
import {
  PrescriptionQueueStatus,
  QueryPrescriptionQueueDto,
} from './dto/pharmacy-prescription-queue.dto';

type QueueMedication = {
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
};

type QueueEntry = {
  prescriptionId: string;
  patient: { id: string; name: string; patientCode?: string | null };
  doctor: { id: string; name: string };
  createdAt: Date;
  pendingHours: number;
  isOverTwoHours: boolean;
  medications: QueueMedication[];
  linkedInvoiceIds: string[];
  status: PrescriptionQueueStatus;
};

type PrescriptionItem = {
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

    const entries = prescriptions
      .map((prescription) => this.toQueueEntry(prescription))
      .filter((entry) => !query.status || entry.status === query.status);
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

    return this.toQueueEntry(prescription);
  }

  async pull(prescriptionId: string, branchId: string) {
    return {
      recomputedAt: new Date(),
      data: await this.findOne(prescriptionId, branchId),
    };
  }

  async stockCheck(prescriptionId: string, branchId: string) {
    const entry = await this.findOne(prescriptionId, branchId);
    const items = await Promise.all(
      entry.medications.map(async (item) =>
        this.stockCheckMedication(item, branchId),
      ),
    );

    return {
      prescriptionId,
      checkedAt: new Date(),
      items,
    };
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
          invoiceDate: 'desc',
        },
        select: {
          id: true,
          status: true,
          items: {
            select: {
              quantity: true,
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
      (invoice) => invoice.status !== 'CANCELLED',
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
    if (prescription.pharmacyInvoices.length === 0) {
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
          .filter((invoiceItem) =>
            this.namesMatch(drugName, invoiceItem.drug?.name || ''),
          )
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

  private async stockCheckMedication(
    medication: QueueMedication,
    branchId: string,
  ) {
    const matchedDrug = await this.matchDrug(medication.drugName, branchId);
    if (!matchedDrug) {
      return {
        drugName: medication.drugName,
        matchedDrug: null,
        stockStatus: 'UNMATCHED',
        totalNonExpiredStock: 0,
        batches: [],
        lowStock: true,
        nearExpiry: false,
        alternatives: [],
      };
    }

    const now = new Date();
    const nearExpiryCutoff = new Date(
      now.getTime() + this.nearExpiryDays * 24 * 60 * 60 * 1000,
    );
    const batches = matchedDrug.inventoryItems
      .filter(
        (batch) =>
          batch.currentStock > 0 &&
          batch.stockStatus !== 'EXPIRED' &&
          (!batch.expiryDate || batch.expiryDate >= now),
      )
      .sort((a, b) => this.compareExpiry(a.expiryDate, b.expiryDate))
      .map((batch) => ({
        id: batch.id,
        batchNumber: batch.batchNumber,
        currentStock: batch.currentStock,
        expiryDate: batch.expiryDate,
        sellingPrice: batch.sellingPrice,
        mrp: batch.mrp,
        stockStatus: batch.stockStatus,
        storageLocation: batch.storageLocation,
      }));
    const totalNonExpiredStock = batches.reduce(
      (sum, batch) => sum + batch.currentStock,
      0,
    );
    const minStock = matchedDrug.minStockLevel ?? 0;
    const lowStock = totalNonExpiredStock <= minStock;
    const nearExpiry = batches.some(
      (batch) => batch.expiryDate && batch.expiryDate <= nearExpiryCutoff,
    );
    const stockStatus =
      totalNonExpiredStock <= 0
        ? 'OUT_OF_STOCK'
        : lowStock
          ? 'LOW_STOCK'
          : 'IN_STOCK';

    let alternatives: unknown[] = [];
    try {
      alternatives = await this.drugService.getAlternatives(
        matchedDrug.id,
        branchId,
      );
    } catch {
      alternatives = [];
    }

    return {
      drugName: medication.drugName,
      matchedDrug: {
        id: matchedDrug.id,
        name: matchedDrug.name,
        manufacturerName: matchedDrug.manufacturerName,
      },
      stockStatus,
      totalNonExpiredStock,
      batches,
      lowStock,
      nearExpiry,
      alternatives,
    };
  }

  private async matchDrug(drugName: string, branchId: string) {
    const baseWhere = {
      branchId,
      isActive: true,
      isDiscontinued: false,
    };
    const select = {
      id: true,
      name: true,
      manufacturerName: true,
      minStockLevel: true,
      inventoryItems: {
        where: {
          branchId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          currentStock: true,
          minStockLevel: true,
          batchNumber: true,
          expiryDate: true,
          sellingPrice: true,
          mrp: true,
          stockStatus: true,
          storageLocation: true,
        },
      },
    };

    const exact = (await this.prisma.drug.findFirst({
      where: {
        ...baseWhere,
        name: {
          equals: drugName,
          mode: 'insensitive',
        },
      },
      select,
    })) as DrugMatch | null;
    if (exact) return exact;

    return (await this.prisma.drug.findFirst({
      where: {
        ...baseWhere,
        name: {
          contains: drugName,
          mode: 'insensitive',
        },
      },
      orderBy: {
        name: 'asc',
      },
      select,
    })) as DrugMatch | null;
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
