import { Prisma } from '@prisma/client';
import { medicineRegimenDefaults } from './medicine-regimen-defaults';
import { searchPrescriptionDrugs } from './prescription-drug-search';
import { mergeClinicalData } from '../visits/clinical-data';
import { ConsultationType, TELE_VIDEO_DISCLAIMER } from '../visits/consultation';
import { VisitsService } from '../visits/visits.service';
import { Injectable, BadRequestException, NotFoundException, ConflictException, Optional, ForbiddenException } from '@nestjs/common';
import { readDoctorSignature } from '../users/doctor-signature';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PharmacyPrescriptionQueueService } from '../pharmacy/pharmacy-prescription-queue.service';
import { 
  CreatePrescriptionDto, 
  UpdatePrescriptionDto, 
  RefillPrescriptionDto, 
  ApproveRefillDto,
  PrescriptionTemplateDto,
  PrescriptionStatus,
  PrescriptionLanguage,
  RefillStatus,
  CreatePrescriptionPadDto,
} from './dto/prescription.dto';
import { 
  QueryPrescriptionsDto, 
  QueryRefillsDto, 
  PrescriptionHistoryDto, 
  DrugSearchDto,
  PrescriptionStatisticsDto,
  ExpiringPrescriptionsDto,
  PrescriptionTemplateQueryDto,
} from './dto/query-prescription.dto';

/**
 * @cc [owner:nareshshah139,label:product;security] prescription-source-state
 * Prescription reads MUST expose stored lifecycle status and remain scoped through
 * an undeleted Visit and its patient branch. Consumers MUST check ACTIVE status
 * and any explicit validity date before offering dispensing or refills.
 */
@Injectable()
export class PrescriptionsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    @Optional() private pharmacyQueue?: PharmacyPrescriptionQueueService,
  ) {}

  /**
   * @cc [owner:nareshshah139,label:product] explicit-prescription-lifecycle
   * New prescriptions MUST be ACTIVE with zero refills unless allowance is
   * explicitly supplied. Only validUntil establishes expiry; visit review dates
   * MUST NOT set expiry. Clinical and prescription inserts MUST commit together.
   */
  async createPrescription(createPrescriptionDto: CreatePrescriptionDto, branchId: string, actorId?: string) {
    const {
      patientId,
      visitId,
      doctorId,
      items,
      diagnosis,
      notes,
      language = PrescriptionLanguage.EN,
      followUpInstructions,
    } = createPrescriptionDto;

    // Validate patient exists and belongs to branch
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, branchId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found in this branch');
    }

    // Validate visit exists and belongs to branch
    const visit = await this.prisma.visit.findFirst({
      where: {
        id: visitId,
        deletedAt: null,
        patient: { branchId },
      },
    });
    if (!visit) throw new NotFoundException('Visit not found in this branch');
    if (visit.patientId !== patientId || visit.doctorId !== doctorId) {
      throw new NotFoundException('Visit does not match the selected patient and doctor');
    }

    // Validate doctor belongs to same branch as visit
    const visitDoctor = await this.prisma.user.findFirst({ where: { id: doctorId, branchId } });
    if (!visitDoctor) {
      throw new BadRequestException('Doctor must belong to the same branch as the visit');
    }

    // Enforce uniqueness: one prescription per visit
    const existingRx = await this.prisma.prescription.findFirst({ where: { visitId } });
    if (existingRx) {
      throw new ConflictException('Prescription already exists for this visit');
    }

    // Validate doctor exists
    const doctor = await this.prisma.user.findFirst({
      where: { id: doctorId, role: 'DOCTOR' },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    // Validate items
    if (!items || items.length === 0) {
      throw new BadRequestException('At least one prescription item is required');
    }

    // Check for drug interactions (mock)
    const interactions = await this.checkDrugInteractions(items);

    // Create prescription aligned to current Prisma schema
    const prescription = await this.prisma.$transaction(async tx => {
      const metadata = createPrescriptionDto.metadata || {};
      const patch = mergeClinicalData({
        ...(diagnosis !== undefined ? { diagnosis: diagnosis ? [{ diagnosis }] : [] } : {}),
        ...(metadata.histories || metadata.familyHistory ? { history: {
          ...metadata.histories, ...(metadata.familyHistory ? { familyHistory: metadata.familyHistory } : {}),
        } } : {}),
        treatmentPlan: {
          ...(followUpInstructions !== undefined ? { followUpInstructions } : {}),
          ...(metadata.investigations ? { investigations: metadata.investigations } : {}),
          ...(metadata.procedurePlanned ? { procedurePlanned: metadata.procedurePlanned } : {}),
          ...(metadata.procedures ? { dermatology: { procedures: [{ type: metadata.procedures }] } } : {}),
        },
      }, createPrescriptionDto.clinicalData);
      await new VisitsService(tx as any).update(visitId, patch, branchId, actorId);
      return tx.prescription.create({
      data: {
        visitId,
        language: language as unknown as any,
        items: JSON.stringify(items),
        validUntil: createPrescriptionDto.validUntil ? new Date(createPrescriptionDto.validUntil) : null,
        maxRefills: this.refillLimit(createPrescriptionDto.maxRefills ?? 0),
        metadata: createPrescriptionDto.metadata ? JSON.stringify(createPrescriptionDto.metadata) : null,
        instructions: followUpInstructions || undefined,
        pharmacistNotes: notes || (diagnosis ? `Dx: ${diagnosis}` : undefined),
        genericFirst: true,
      },
      include: {
        visit: {
          select: {
            id: true,
            createdAt: true,
            version: true,
            status: true,
            completedAt: true,
            doctor: { select: { id: true, firstName: true, lastName: true } },
            patient: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    });
    });

    try {
      await this.pharmacyQueue?.pull(prescription.id, branchId);
    } catch {
      // Prescription creation should not fail if pharmacy queue materialization is delayed.
    }

    return {
      ...prescription,
      items: this.safeParse<any[]>(prescription.items as string, []),
      interactions,
    };
  }

  async findAllPrescriptions(query: QueryPrescriptionsDto, branchId: string) {
    const {
      patientId,
      visitId,
      doctorId,
      status,
      language,
      startDate,
      endDate,
      validUntil,
      search,
      drugName,
      isExpired,
      hasRefills,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const normalizedPage = this.toPositiveInt(page, 1);
    const normalizedLimit = Math.min(this.toPositiveInt(limit, 20), 100);
    const skip = (normalizedPage - 1) * normalizedLimit;
    const normalizedStatus = typeof status === 'string' ? status.trim() : status;
    const safeSortBy = ['createdAt', 'updatedAt', 'language', 'validUntil'].includes(String(sortBy)) ? String(sortBy) : 'createdAt';
    const safeSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

    const where: any = {
      visit: {
        deletedAt: null,
        patient: { branchId },
      },
    };

    // Apply filters
    if (patientId) where.visit = { ...(where.visit || {}), patientId };
    if (visitId) where.visitId = visitId;
    if (doctorId) where.visit = { ...(where.visit || {}), doctorId };
    if (language) where.language = language;
    if (normalizedStatus) where.status = normalizedStatus;

    // Date filters
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (validUntil) where.validUntil = { lte: new Date(validUntil) };

    // Search filter
    if (search) {
      where.OR = [
        {
          pharmacistNotes: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          items: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          instructions: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          visit: {
            diagnosis: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
      ];
    }

    // Drug name filter
    if (drugName) {
      where.items = {
        contains: drugName,
        mode: 'insensitive',
      };
    }

    // Expired filter
    if (isExpired !== undefined) {
      where.AND = [isExpired
        ? { validUntil: { lt: new Date() } }
        : { OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] }];
    }

    // Refills filter
    if (hasRefills !== undefined) where.refills = hasRefills ? { some: {} } : { none: {} };

    const [prescriptions, total] = await Promise.all([
      this.prisma.prescription.findMany({
        where,
        include: {
          refills: true,
          visit: {
            select: {
              id: true,
              patientId: true,
              doctorId: true,
              createdAt: true,
              diagnosis: true,
              followUp: true,
              patient: {
                select: { id: true, name: true, phone: true },
              },
              doctor: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
        },
        skip,
        take: normalizedLimit,
        orderBy: {
          [safeSortBy]: safeSortOrder,
        },
      }),
      this.prisma.prescription.count({ where }),
    ]);

    // Parse JSON fields
    const parsedPrescriptions = prescriptions.map(prescription => {
      const patient = prescription.visit?.patient
        ? {
            id: prescription.visit.patient.id,
            name: prescription.visit.patient.name,
            phone: prescription.visit.patient.phone,
          }
        : undefined;
      const doctor = prescription.visit?.doctor
        ? {
            id: prescription.visit.doctor.id,
            firstName: prescription.visit.doctor.firstName,
            lastName: prescription.visit.doctor.lastName,
            name: [prescription.visit.doctor.firstName, prescription.visit.doctor.lastName].filter(Boolean).join(' '),
          }
        : undefined;
      const metadata = this.safeParse<any>(prescription.metadata as string, null);

      return {
        ...prescription,
        items: this.safeParse<any[]>(prescription.items as string, []),
        metadata,
        patient,
        patientId: patient?.id || prescription.visit?.patientId,
        doctor,
        doctorId: doctor?.id || prescription.visit?.doctorId,
        diagnosis: this.extractPrescriptionDiagnosis(prescription, metadata),
        notes: prescription.pharmacistNotes,
        followUpInstructions: prescription.instructions,
        status: prescription.status,
        refills: prescription.refills,
      };
    });

    return {
      prescriptions: parsedPrescriptions,
      pagination: {
        total,
        page: normalizedPage,
        limit: normalizedLimit,
        pages: Math.ceil(total / normalizedLimit),
      },
    };
  }

  async findPrescriptionById(id: string, branchId: string) {
    const prescription = await this.prisma.prescription.findFirst({
      where: {
        id,
        visit: {
          deletedAt: null,
          patient: { branchId },
        },
      },
      include: {
        refills: true,
        visit: {
          include: {
            patient: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
              },
            },
            doctor: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });

    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }

    // Parse JSON fields
    const items = this.safeParse<any[]>(prescription.items as string, []);

    // Check for drug interactions (mock)
    const interactions = await this.checkDrugInteractions(items);

    // Project a patient at top-level for consumers expecting it
    const patient = prescription.visit?.patient
      ? {
          id: prescription.visit.patient.id,
          name: prescription.visit.patient.name,
          phone: prescription.visit.patient.phone,
          email: prescription.visit.patient.email,
        }
      : undefined;

    // Project doctor at top-level for consumers expecting it
    const doctor = prescription.visit?.doctor
      ? {
          id: prescription.visit.doctor.id,
          firstName: prescription.visit.doctor.firstName,
          lastName: prescription.visit.doctor.lastName,
        }
      : undefined;

    return {
      ...prescription,
      items,
      patient,
      patientId: patient?.id,
      doctor,
      doctorId: doctor?.id,
      interactions,
      metadata: this.safeParse<Record<string, unknown> | null>(prescription.metadata, null),
      notes: prescription.pharmacistNotes,
      followUpInstructions: prescription.instructions,
    };
  }

  private refillLimit(value: number): number {
    if (!Number.isInteger(value) || value < 0 || value > 5) throw new BadRequestException('maxRefills must be an integer from 0 to 5');
    return value;
  }

  /**
   * @cc [owner:nareshshah139,label:product;security] prescription-command-lock
   * Every existing prescription lifecycle or allowance writer MUST hold this
   * prescription row lock until commit and re-read state after locking. Foreign
   * branch and deleted-visit prescriptions MUST fail without mutation.
   */
  private async lockPrescription(tx: Prisma.TransactionClient, id: string, branchId: string) {
    if (!branchId) throw new NotFoundException('Prescription not found');
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT r.id FROM prescriptions r JOIN visits v ON v.id = r."visitId"
      JOIN patients p ON p.id = v."patientId"
      WHERE r.id = ${id} AND p."branchId" = ${branchId} AND v."deletedAt" IS NULL
      FOR UPDATE OF r`;
    if (!locked.length) throw new NotFoundException('Prescription not found');
    const prescription = await tx.prescription.findUnique({ where: { id }, include: { refills: true } });
    if (!prescription) throw new NotFoundException('Prescription not found');
    return prescription;
  }

  private requireRefillEligibility(prescription: { status: PrescriptionStatus; validUntil: Date | null; maxRefills: number; refills: { status: RefillStatus }[] }) {
    if (prescription.status !== PrescriptionStatus.ACTIVE) throw new BadRequestException('Can only refill active prescriptions');
    if (prescription.validUntil && prescription.validUntil < new Date()) throw new BadRequestException('Cannot refill expired prescription');
    const used = prescription.refills.filter(r => r.status === RefillStatus.APPROVED || r.status === RefillStatus.COMPLETED).length;
    if (used >= prescription.maxRefills) throw new BadRequestException('Maximum refills exceeded');
  }

  /**
   * @cc [owner:nareshshah139,label:product] prescription-clinical-atomicity
   * Clinical and prescription edits MUST commit together. Terminal prescriptions
   * MUST reject edits; cancellation MUST use the audited cancellation command.
   * Validity MUST be stored independently of the visit's review date.
   */
  async updatePrescription(id: string, input: UpdatePrescriptionDto, branchId: string, actorId?: string) {
    const updated = await this.prisma.$transaction(async tx => {
      const prescription = await this.lockPrescription(tx, id, branchId);
      if (prescription.status !== PrescriptionStatus.DRAFT && prescription.status !== PrescriptionStatus.ACTIVE) {
        throw new BadRequestException('Cannot update a completed, cancelled or expired prescription');
      }
      if (input.status !== undefined && input.status !== PrescriptionStatus.ACTIVE && input.status !== PrescriptionStatus.COMPLETED) {
        throw new BadRequestException('Use cancellation to cancel a prescription');
      }
      const data: Prisma.PrescriptionUpdateInput = {};
      if (input.items !== undefined) {
        if (!input.items?.length) throw new BadRequestException('At least one prescription item is required');
        data.items = JSON.stringify(input.items);
      }
      if (input.language !== undefined) data.language = input.language;
      if (input.notes !== undefined) data.pharmacistNotes = input.notes;
      if (input.followUpInstructions !== undefined) data.instructions = input.followUpInstructions;
      if (input.validUntil !== undefined) data.validUntil = input.validUntil ? new Date(input.validUntil) : null;
      if (input.metadata !== undefined) data.metadata = input.metadata === null ? null : JSON.stringify(input.metadata);
      if (input.status !== undefined) data.status = input.status;
      if (input.maxRefills !== undefined) {
        data.maxRefills = this.refillLimit(input.maxRefills);
        const reserved = prescription.refills.filter(r => r.status === RefillStatus.PENDING || r.status === RefillStatus.APPROVED || r.status === RefillStatus.COMPLETED).length;
        if (data.maxRefills < reserved) throw new BadRequestException('Refill limit cannot be less than existing requests and approvals');
      }
      const patch = mergeClinicalData({
        ...(input.diagnosis !== undefined ? { diagnosis: input.diagnosis ? [{ diagnosis: input.diagnosis }] : [] } : {}),
        ...(input.followUpInstructions !== undefined ? { treatmentPlan: { followUpInstructions: input.followUpInstructions } } : {}),
      }, input.clinicalData);
      await new VisitsService(tx as PrismaService).update(prescription.visitId, patch, branchId, actorId);
      return tx.prescription.update({ where: { id }, data, include: { refills: true, visit: { include: { patient: true, doctor: { select: { id: true, firstName: true, lastName: true } } } } } });
    });
    return { ...updated, items: this.safeParse<unknown[]>(updated.items, []) };
  }

  /**
   * @cc [owner:nareshshah139,label:product] audited-prescription-cancellation
   * Cancellation MUST persist CANCELLED plus server cancellation time, actor and
   * reason, and reject pending refills atomically. A retry MUST preserve the first
   * cancellation audit. No subsequent edit or refill may reactivate it.
   */
  async cancelPrescription(id: string, branchId: string, reason?: string, actorId?: string) {
    return this.prisma.$transaction(async tx => {
      const prescription = await this.lockPrescription(tx, id, branchId);
      if (prescription.status === PrescriptionStatus.CANCELLED) return prescription;
      const now = new Date();
      await tx.prescriptionRefill.updateMany({ where: { prescriptionId: id, status: RefillStatus.PENDING }, data: {
        status: RefillStatus.REJECTED, rejectedAt: now, rejectedBy: actorId ?? null, rejectionReason: 'Prescription cancelled',
      } });
      return tx.prescription.update({ where: { id }, data: {
        status: PrescriptionStatus.CANCELLED, cancelledAt: now, cancelledBy: actorId ?? null, cancellationReason: reason ?? null,
      } });
    });
  }

  /**
   * @cc [owner:nareshshah139,label:product] refill-allowance-serialization
   * A refill request or approval MUST require an ACTIVE, unexpired prescription
   * with unused explicit allowance. Concurrent requests MUST not create multiple
   * pending requests; approvals MUST not exceed maxRefills under the parent lock.
   */
  async requestRefill(input: RefillPrescriptionDto, branchId: string) {
    return this.prisma.$transaction(async tx => {
      const prescription = await this.lockPrescription(tx, input.prescriptionId, branchId);
      this.requireRefillEligibility(prescription);
      if (prescription.refills.some(r => r.status === RefillStatus.PENDING)) throw new ConflictException('Refill request already pending');
      return tx.prescriptionRefill.create({ data: {
        prescriptionId: input.prescriptionId, reason: input.reason, notes: input.notes,
        requestedDate: input.requestedDate ? new Date(input.requestedDate) : new Date(),
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      } });
    });
  }

  async approveRefill(input: ApproveRefillDto & { refillId: string }, branchId: string, approvedBy: string) {
    return this.prisma.$transaction(async tx => {
      const refill = await tx.prescriptionRefill.findFirst({ where: { id: input.refillId, prescription: { visit: { deletedAt: null, patient: { branchId } } } } });
      if (!refill) throw new NotFoundException('Refill request not found');
      const prescription = await this.lockPrescription(tx, refill.prescriptionId, branchId);
      const current = prescription.refills.find(r => r.id === input.refillId)!;
      if (current.status !== RefillStatus.PENDING) throw new BadRequestException('Can only approve pending refill requests');
      this.requireRefillEligibility(prescription);
      return tx.prescriptionRefill.update({ where: { id: current.id }, data: {
        status: RefillStatus.APPROVED, approvedAt: new Date(), approvedBy,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata === null ? null : JSON.stringify(input.metadata) } : {}),
      } });
    });
  }

  async rejectRefill(refillId: string, branchId: string, reason: string, rejectedBy: string) {
    return this.prisma.$transaction(async tx => {
      const refill = await tx.prescriptionRefill.findFirst({ where: { id: refillId, prescription: { visit: { deletedAt: null, patient: { branchId } } } } });
      if (!refill) throw new NotFoundException('Refill request not found');
      const prescription = await this.lockPrescription(tx, refill.prescriptionId, branchId);
      if (prescription.refills.find(r => r.id === refillId)?.status !== RefillStatus.PENDING) throw new BadRequestException('Can only reject pending refill requests');
      return tx.prescriptionRefill.update({ where: { id: refillId }, data: { status: RefillStatus.REJECTED, rejectedAt: new Date(), rejectedBy, rejectionReason: reason } });
    });
  }

  async findAllRefills(query: QueryRefillsDto, branchId: string) {
    const page = this.toPositiveInt(query.page, 1);
    const limit = Math.min(this.toPositiveInt(query.limit, 20), 100);
    const where: Prisma.PrescriptionRefillWhereInput = {
      prescription: { visit: { deletedAt: null, patient: { branchId }, ...(query.patientId ? { patientId: query.patientId } : {}) } },
      ...(query.prescriptionId ? { prescriptionId: query.prescriptionId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.startDate || query.endDate ? { createdAt: { ...(query.startDate ? { gte: new Date(query.startDate) } : {}), ...(query.endDate ? { lte: new Date(query.endDate) } : {}) } } : {}),
      ...(query.search ? { OR: [{ reason: { contains: query.search, mode: 'insensitive' } }, { notes: { contains: query.search, mode: 'insensitive' } }] } : {}),
    };
    const sortBy = ['createdAt', 'requestedDate', 'approvedAt', 'status'].includes(query.sortBy || '') ? query.sortBy! : 'createdAt';
    const [refills, total] = await Promise.all([
      this.prisma.prescriptionRefill.findMany({ where, include: { prescription: { include: { visit: { select: { patient: { select: { id: true, name: true, phone: true } }, doctor: { select: { id: true, firstName: true, lastName: true } } } } } } }, skip: (page - 1) * limit, take: limit, orderBy: { [sortBy]: query.sortOrder === 'asc' ? 'asc' : 'desc' } }),
      this.prisma.prescriptionRefill.count({ where }),
    ]);
    return { refills: refills.map(r => ({ ...r, prescription: { ...r.prescription, patient: r.prescription.visit.patient, doctor: r.prescription.visit.doctor } })), pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getPrescriptionHistory(query: PrescriptionHistoryDto, branchId: string) {
    const result = await this.findAllPrescriptions({ ...query, page: 1, sortBy: 'createdAt', sortOrder: 'desc', limit: query.limit ?? 50 }, branchId);
    return result.prescriptions.map(prescription => ({ ...prescription, drugNames: prescription.items.map(item => item.drugName) }));
  }

  async searchDrugs(query: DrugSearchDto) {
    const { query: searchQuery, isGeneric, category, limit = 20 } = query;

    // This would typically integrate with a drug database API
    // For now, we'll return mock data
    const mockDrugs = [
      {
        id: '1',
        name: 'Paracetamol',
        genericName: 'Acetaminophen',
        brandNames: ['Crocin', 'Calpol', 'Tylenol'],
        category: 'Analgesic',
        dosageForms: ['Tablet', 'Syrup', 'Injection'],
        isGeneric: true,
        interactions: ['Warfarin', 'Alcohol'],
        contraindications: ['Liver disease', 'Alcoholism'],
      },
      {
        id: '2',
        name: 'Amoxicillin',
        genericName: 'Amoxicillin',
        brandNames: ['Amoxil', 'Mox'],
        category: 'Antibiotic',
        dosageForms: ['Capsule', 'Syrup', 'Injection'],
        isGeneric: true,
        interactions: ['Warfarin', 'Methotrexate'],
        contraindications: ['Penicillin allergy'],
      },
    ];

    let filteredDrugs = mockDrugs;

    if (searchQuery) {
      filteredDrugs = filteredDrugs.filter(drug =>
        drug.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        drug.genericName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        drug.brandNames.some(brand => brand.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    if (isGeneric !== undefined) {
      filteredDrugs = filteredDrugs.filter(drug => drug.isGeneric === isGeneric);
    }

    if (category) {
      filteredDrugs = filteredDrugs.filter(drug => drug.category === category);
    }

    return filteredDrugs.slice(0, limit);
  }

  /**
   * @cc [owner:nareshshah139,label:security;product] drug-import-branch-identity
   * Imports MUST use real Drug columns in the requested branch. Missing required
   * catalog values or ambiguous identities MUST count as errors without mutation.
   * Repeated imports of the same branch, name, strength and dosage form MUST reuse
   * the existing drug and MUST NOT create stock.
   */
  async importDrugs(drugs: Array<Record<string, unknown>>, branchId: string) {
    if (!Array.isArray(drugs) || !drugs.length) return { imported: 0, upserts: 0, errors: 0 };
    let upserts = 0;
    let errors = 0;
    for (const raw of drugs) {
      const name = String(raw.name || raw.brand || raw.tradeName || '').trim();
      const manufacturerName = String(raw.manufacturerName || raw.manufacturer || '').trim();
      const packSizeLabel = String(raw.packSizeLabel || '').trim();
      const price = raw.price;
      if (!name || !manufacturerName || !packSizeLabel || typeof price !== 'number' || !Number.isFinite(price) || price < 0 || !branchId) { errors++; continue; }
      try {
        await this.prisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM branches WHERE id = ${branchId} FOR UPDATE`;
          const identity = { branchId, name, strength: raw.strength ? String(raw.strength) : null, dosageForm: raw.dosageForm || raw.form ? String(raw.dosageForm || raw.form) : null };
          const matches = await tx.drug.findMany({ where: identity, select: { id: true }, take: 2 });
          if (matches.length > 1) throw new ConflictException('Ambiguous drug identity');
          const data = { ...identity, price, manufacturerName, packSizeLabel,
            composition1: raw.composition1 || raw.composition ? String(raw.composition1 || raw.composition) : null,
            composition2: raw.composition2 ? String(raw.composition2) : null,
            ...(typeof raw.rxRequired === 'boolean' ? { requiresPrescription: raw.rxRequired } : {}),
          };
          if (matches[0]) await tx.drug.update({ where: { id: matches[0].id }, data });
          else await tx.drug.create({ data });
        });
        upserts++;
      } catch { errors++; }
    }
    return { imported: drugs.length, upserts, errors };
  }

  getMedicineRegimenDefaults(drugId: string, branchId: string, doctorId: string, visitId?: string) {
    return medicineRegimenDefaults(this.prisma, drugId, branchId, doctorId, visitId);
  }

  // Autocomplete lookup for drug names from local Drug table
  async autocompleteDrugs(q: string, limit: number, branchId: string) {
    return searchPrescriptionDrugs(this.prisma, q, limit, branchId);
  }

  // Autocomplete for clinical fields using recent visits and prescription metadata
  async autocompleteClinicalField(
    field: string,
    patientId: string,
    q: string,
    limit: number,
    branchId: string,
    visitId?: string,
  ) {
    if (!field || !patientId) return [];

    const visits = await this.prisma.visit.findMany({
      where: {
        patientId,
        deletedAt: null,
        patient: { branchId },
        ...(visitId ? { id: visitId } : {}),
      },
      select: {
        id: true,
        complaints: true,
        diagnosis: true,
        history: true,
        plan: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const values = new Set<string>();

    const pushVal = (val?: any) => {
      if (typeof val === 'string') {
        const s = val.trim();
        if (s) values.add(s);
      }
    };

    for (const v of visits) {
      // Parse JSON fields defensively
      let complaints: any = null;
      let diag: any = null;
      let plan: any = null;
      let history: any = null;
      try { complaints = v.complaints ? JSON.parse(v.complaints) : v.complaints; } catch {}
      try { diag = v.diagnosis ? JSON.parse(v.diagnosis) : v.diagnosis; } catch {}
      try { plan = v.plan ? JSON.parse(v.plan) : v.plan; } catch {}
      try { history = v.history ? JSON.parse(v.history) : v.history; } catch {}

      const derm = plan?.dermatology || {};

      switch (field) {
        case 'diagnosis': {
          if (Array.isArray(diag)) {
            for (const d of diag) pushVal(typeof d === 'string' ? d : d?.diagnosis);
          } else {
            pushVal(diag);
          }
          break;
        }
        case 'chiefComplaints': {
          if (Array.isArray(complaints)) {
            for (const c of complaints) pushVal(typeof c === 'string' ? c : c?.text || c?.complaint);
          } else {
            pushVal(complaints);
          }
          break;
        }
        case 'pastHistory': {
          pushVal(history?.past);
          pushVal(derm?.pastHistory);
          break;
        }
        case 'medicationHistory': {
          pushVal(history?.medication);
          pushVal(derm?.medicationHistory);
          break;
        }
        case 'menstrualHistory': {
          pushVal(history?.menstrual);
          pushVal(derm?.menstrualHistory);
          break;
        }
        case 'familyHistory.others': {
          pushVal(history?.family?.others);
          pushVal(derm?.familyHistoryOthers);
          break;
        }
        case 'topicalFacewash.frequency': pushVal(derm?.topicals?.facewash?.frequency); break;
        case 'topicalFacewash.timing': pushVal(derm?.topicals?.facewash?.timing); break;
        case 'topicalFacewash.duration': pushVal(derm?.topicals?.facewash?.duration); break;
        case 'topicalFacewash.instructions': pushVal(derm?.topicals?.facewash?.instructions); break;
        case 'topicalMoisturiserSunscreen.frequency': pushVal(derm?.topicals?.moisturiserSunscreen?.frequency); break;
        case 'topicalMoisturiserSunscreen.timing': pushVal(derm?.topicals?.moisturiserSunscreen?.timing); break;
        case 'topicalMoisturiserSunscreen.duration': pushVal(derm?.topicals?.moisturiserSunscreen?.duration); break;
        case 'topicalMoisturiserSunscreen.instructions': pushVal(derm?.topicals?.moisturiserSunscreen?.instructions); break;
        case 'topicalActives.frequency': pushVal(derm?.topicals?.actives?.frequency); break;
        case 'topicalActives.timing': pushVal(derm?.topicals?.actives?.timing); break;
        case 'topicalActives.duration': pushVal(derm?.topicals?.actives?.duration); break;
        case 'topicalActives.instructions': pushVal(derm?.topicals?.actives?.instructions); break;
        case 'postProcedureCare': pushVal(derm?.postProcedureCare); break;
        case 'investigations': pushVal(derm?.investigations); break;
        case 'procedurePlanned': {
          pushVal(derm?.procedurePlanned);
          if (Array.isArray(derm?.procedures)) {
            for (const p of derm.procedures) pushVal(p?.type);
          }
          break;
        }
        case 'procedureParams.passes': pushVal(derm?.procedureParams?.passes); break;
        case 'procedureParams.power': pushVal(derm?.procedureParams?.power); break;
        case 'procedureParams.machineUsed': pushVal(derm?.procedureParams?.machineUsed); break;
        case 'procedureParams.others': pushVal(derm?.procedureParams?.others); break;
        case 'notes': pushVal(plan?.notes || derm?.counseling); break;
        case 'followUpInstructions': pushVal(derm?.followUpInstructions); break;
        default: {
          // Fallback: try to pick from plan.dermatology[field]
          const raw = field.split('.').reduce((acc: any, key: string) => (acc ? acc[key] : undefined), derm);
          pushVal(raw);
        }
      }
    }

    let list = Array.from(values);
    if (q) {
      const ql = q.toLowerCase();
      list = list.filter((s) => s.toLowerCase().includes(ql));
    }
    return list.slice(0, limit);
  }

  async getPrescriptionStatistics(query: PrescriptionStatisticsDto, branchId: string) {
    const { startDate, endDate, doctorId, drugName, groupBy = 'day' } = query;
    const prescriptions = await this.prisma.prescription.findMany({
      where: { visit: { deletedAt: null, patient: { branchId }, ...(doctorId ? { doctorId } : {}) },
        ...(startDate || endDate ? { createdAt: { ...(startDate ? { gte: new Date(startDate) } : {}), ...(endDate ? { lte: new Date(endDate) } : {}) } } : {}),
        ...(drugName ? { items: { contains: drugName, mode: 'insensitive' } } : {}),
      }, select: { items: true, createdAt: true, visit: { select: { doctorId: true } } },
    });
    const drugs = new Map<string, number>();
    const doctors = new Map<string, number>();
    const dates = new Map<string, number>();
    for (const prescription of prescriptions) {
      drugs.set(prescription.items, (drugs.get(prescription.items) ?? 0) + 1);
      doctors.set(prescription.visit.doctorId, (doctors.get(prescription.visit.doctorId) ?? 0) + 1);
      const date = new Date(prescription.createdAt);
      if (groupBy === 'year') date.setUTCMonth(0, 1);
      if (groupBy === 'month') date.setUTCDate(1);
      if (groupBy === 'week') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
      const key = date.toISOString().slice(0, 10);
      dates.set(key, (dates.get(key) ?? 0) + 1);
    }
    return { totalPrescriptions: prescriptions.length,
      drugBreakdown: [...drugs].map(([drug, count]) => ({ drug, count })),
      doctorBreakdown: [...doctors].map(([doctorId, count]) => ({ doctorId, count })),
      dailyBreakdown: [...dates].map(([date, count]) => ({ date, count })),
      period: { startDate: startDate || null, endDate: endDate || null, groupBy },
    };
  }

  async getExpiringPrescriptions(query: ExpiringPrescriptionsDto, branchId: string) {
    const end = query.expireBefore || new Date(Date.now() + 7 * 86400000).toISOString();
    const result = await this.findAllPrescriptions({ patientId: query.patientId, status: PrescriptionStatus.ACTIVE, validUntil: end, sortBy: 'validUntil', sortOrder: 'asc', limit: query.limit ?? 50 }, branchId);
    const prescriptions = result.prescriptions.map(prescription => ({ ...prescription,
      daysUntilExpiry: prescription.validUntil ? Math.ceil((prescription.validUntil.getTime() - Date.now()) / 86400000) : null,
    }));
    return { prescriptions, totalExpiring: result.pagination.total };
  }

  async createPrescriptionTemplate(templateDto: PrescriptionTemplateDto, branchId: string, createdBy: string) {
    try {
      const {
        name,
        description,
        items,
        category,
        specialty,
        isPublic = false,
        metadata,
      } = templateDto;

      if (!name || !name.trim()) {
        throw new BadRequestException('Template name is required');
      }
      const trimmedName = name.trim();
      if (trimmedName.length > 120) {
        throw new BadRequestException('Template name must be 120 characters or fewer');
      }

      // Ensure creator exists in branch (more helpful error than FK violation)
      const creator = await this.prisma.user.findFirst({ where: { id: createdBy, branchId } });
      if (!creator) {
        throw new BadRequestException('Creator not found in this branch');
      }

      // Enforce unique name per branch (case-insensitive)
      const existingCount = await this.prisma.prescriptionTemplate.count({
        where: {
          branchId,
          name: { equals: trimmedName, mode: 'insensitive' as any },
        },
      });
      if (existingCount > 0) {
        throw new ConflictException('A template with this name already exists');
      }

      // Allow templates with only metadata (no items)
      const safeItems = Array.isArray(items) ? items : [];

      // Enrich items with pricing (mrp) where missing
      const enrichedItems = await this.enrichItemsWithDrugPricing(safeItems, branchId);

      const template = await this.prisma.prescriptionTemplate.create({
        data: {
          name: trimmedName,
          description: description && description.trim() ? description.trim() : null,
          items: JSON.stringify(enrichedItems),
          category: category && category.trim() ? category.trim() : null,
          specialty: specialty && specialty.trim() ? specialty.trim() : null,
          isPublic,
          createdBy,
          metadata: metadata ? JSON.stringify(metadata) : null,
          branchId,
        },
      });

      return {
        ...template,
        items: JSON.parse(template.items as string),
        metadata: template.metadata ? JSON.parse(template.metadata as string) : null,
      };
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('❌ createPrescriptionTemplate error:', err);
      if (err?.status && typeof err.status === 'number') {
        throw err;
      }
      if (err?.code === 'P2002') {
        // Prisma unique constraint violation
        throw new ConflictException('A template with this name already exists');
      }
      const message = (err && (err.meta?.cause || err.message)) || 'Failed to create template';
      throw new BadRequestException(message);
    }
  }

  async findAllPrescriptionTemplates(query: PrescriptionTemplateQueryDto, branchId: string) {
    const {
      search,
      category,
      specialty,
      isPublic,
      page = 1,
      limit = 20,
    } = query;

    const skip = (page - 1) * limit;

    // Guard: if model does not exist on Prisma (not migrated), return empty
    const hasModel = (this.prisma as any).prescriptionTemplate &&
      typeof (this.prisma as any).prescriptionTemplate.findMany === 'function';
    if (!hasModel) {
      return {
        templates: [],
        pagination: { total: 0, page, limit, pages: 0 },
      };
    }

    const where: any = {
      branchId,
    };

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (category) where.category = category;
    if (specialty) where.specialty = specialty;
    if (isPublic !== undefined) where.isPublic = isPublic;

    const [templates, total] = await Promise.all([
      this.prisma.prescriptionTemplate.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.prescriptionTemplate.count({ where }),
    ]);

    // Parse JSON fields and enrich with pricing for clients
    const parsedTemplates = await Promise.all(
      templates.map(async (template) => {
        let rawItems: any[] = [];
        try {
          rawItems = JSON.parse(template.items as string);
          if (!Array.isArray(rawItems)) rawItems = [];
        } catch {
          rawItems = [];
        }
        let meta: any = null;
        try {
          meta = template.metadata ? JSON.parse(template.metadata as string) : null;
        } catch {
          meta = null;
        }
        const itemsWithPrice = await this.enrichItemsWithDrugPricing(rawItems, branchId);
        return {
          ...template,
          items: itemsWithPrice,
          metadata: meta,
        };
      })
    );

    return {
      templates: parsedTemplates,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async deletePrescriptionTemplate(templateId: string, branchId: string) {
    const hasModel = (this.prisma as any).prescriptionTemplate &&
      typeof (this.prisma as any).prescriptionTemplate.findUnique === 'function';
    if (!hasModel) {
      throw new NotFoundException('Template feature not available');
    }

    const template = await this.prisma.prescriptionTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.branchId !== branchId) {
      throw new BadRequestException('Template does not belong to your branch');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.templateUsage.deleteMany({ where: { templateId } });

      const versions = await tx.prescriptionTemplateVersion.findMany({
        where: { templateId },
        select: { id: true },
      });
      if (versions.length > 0) {
        const versionIds = versions.map((v) => v.id);
        await tx.templateVersionApproval.deleteMany({ where: { versionId: { in: versionIds } } });
        await tx.prescriptionTemplateVersion.deleteMany({ where: { templateId } });
      }

      await tx.layoutVariant.updateMany({ where: { templateId }, data: { templateId: null } });

      await tx.prescriptionTemplate.delete({ where: { id: templateId } });
    });

    return { message: 'Template deleted successfully' };
  }

  // Private helper methods
  private async enrichItemsWithDrugPricing(items: any[], branchId: string): Promise<any[]> {
    if (!Array.isArray(items) || items.length === 0) return items;

    // Build a unique set of names to look up once
    const names = Array.from(
      new Set(
        items
          .map((i) => (typeof i?.drugName === 'string' ? i.drugName.trim() : ''))
          .filter((n) => !!n)
      )
    );

    if (names.length === 0) return items;

    const drugs = await this.prisma.drug.findMany({
      where: { branchId, name: { in: names } },
      select: { id: true, name: true, price: true },
    });

    const nameToPrice = new Map<string, number>();
    for (const d of drugs) {
      if (typeof d.price === 'number') nameToPrice.set(d.name, d.price);
    }

    return items.map((i) => {
      if (!i || typeof i !== 'object') return i;
      const hasMrp = i.mrp !== undefined && i.mrp !== null && !Number.isNaN(Number(i.mrp));
      if (hasMrp) return i;
      const name = typeof i.drugName === 'string' ? i.drugName.trim() : '';
      const price = name ? nameToPrice.get(name) : undefined;
      if (typeof price === 'number') {
        return { ...i, mrp: price };
      }
      return i;
    });
  }
  private async checkDrugInteractions(items: any[]): Promise<any[]> {
    // This would typically integrate with a drug interaction database
    // For now, we'll return mock interactions
    const interactions = [];

    const drugNames = items.map(item => item.drugName);

    // Mock interaction check
    if (drugNames.includes('Paracetamol') && drugNames.includes('Warfarin')) {
      interactions.push({
        drug1: 'Paracetamol',
        drug2: 'Warfarin',
        severity: 'MODERATE',
        description: 'Paracetamol may increase the anticoagulant effect of Warfarin',
        recommendation: 'Monitor INR levels closely',
      });
    }

    if (drugNames.includes('Amoxicillin') && drugNames.includes('Warfarin')) {
      interactions.push({
        drug1: 'Amoxicillin',
        drug2: 'Warfarin',
        severity: 'MAJOR',
        description: 'Amoxicillin may increase the anticoagulant effect of Warfarin',
        recommendation: 'Monitor INR levels and adjust Warfarin dose if necessary',
      });
    }

    return interactions;
  }

  // TEMPLATE VERSIONING
  async listTemplateVersions(templateId: string, branchId: string) {
    const template = await this.prisma.prescriptionTemplate.findFirst({ where: { id: templateId, branchId } });
    if (!template) throw new NotFoundException('Template not found');
    const versions = await this.prisma.prescriptionTemplateVersion.findMany({
      where: { templateId },
      orderBy: { versionNumber: 'desc' },
    });
    return { templateId, versions };
  }

  async createTemplateVersion(
    templateId: string,
    body: { language?: string; content: any; changeNotes?: string },
    branchId: string,
    userId: string,
  ) {
    const template = await this.prisma.prescriptionTemplate.findFirst({ where: { id: templateId, branchId } });
    if (!template) throw new NotFoundException('Template not found');
    const last = await this.prisma.prescriptionTemplateVersion.findFirst({
      where: { templateId },
      orderBy: { versionNumber: 'desc' },
    });
    const nextVersion = (last?.versionNumber || 0) + 1;
    const created = await this.prisma.prescriptionTemplateVersion.create({
      data: {
        templateId,
        versionNumber: nextVersion,
        language: (body?.language || 'EN') as any,
        content: JSON.stringify(body?.content ?? {}),
        changeNotes: body?.changeNotes || null,
        status: 'DRAFT' as any,
      },
    });
    return created;
  }

  async submitTemplateVersion(templateId: string, versionId: string, branchId: string, userId: string) {
    const version = await this.prisma.prescriptionTemplateVersion.findFirst({
      where: { id: versionId, template: { id: templateId, branchId } },
    });
    if (!version) throw new NotFoundException('Version not found');
    if (version.status !== 'DRAFT') throw new ConflictException('Only draft versions can be submitted');
    return this.prisma.prescriptionTemplateVersion.update({
      where: { id: version.id },
      data: { status: 'PENDING' as any, submittedAt: new Date() },
    });
  }

  async approveTemplateVersion(
    templateId: string,
    versionId: string,
    branchId: string,
    approverId: string,
    note?: string,
  ) {
    const version = await this.prisma.prescriptionTemplateVersion.findFirst({
      where: { id: versionId, template: { id: templateId, branchId } },
    });
    if (!version) throw new NotFoundException('Version not found');
    if (version.status !== 'PENDING') throw new ConflictException('Only pending versions can be approved');
    const updated = await this.prisma.prescriptionTemplateVersion.update({
      where: { id: version.id },
      data: { status: 'APPROVED' as any, approvedAt: new Date(), approvedBy: approverId },
    });
    await this.prisma.templateVersionApproval.create({
      data: { versionId: version.id, reviewerId: approverId, status: 'APPROVED' as any, note: note || null },
    });
    return updated;
  }

  async rejectTemplateVersion(
    templateId: string,
    versionId: string,
    branchId: string,
    approverId: string,
    note?: string,
  ) {
    const version = await this.prisma.prescriptionTemplateVersion.findFirst({
      where: { id: versionId, template: { id: templateId, branchId } },
    });
    if (!version) throw new NotFoundException('Version not found');
    if (version.status !== 'PENDING') throw new ConflictException('Only pending versions can be rejected');
    const updated = await this.prisma.prescriptionTemplateVersion.update({
      where: { id: version.id },
      data: { status: 'REJECTED' as any },
    });
    await this.prisma.templateVersionApproval.create({
      data: { versionId: version.id, reviewerId: approverId, status: 'REJECTED' as any, note: note || null },
    });
    return updated;
  }

  // ASSET LIBRARY
  async listClinicAssets(branchId: string, type?: string) {
    const where: any = { branchId };
    if (type) where.type = type as any;
    return this.prisma.clinicAsset.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async upsertClinicAsset(
    branchId: string,
    ownerId: string,
    body: { id?: string; type: 'LOGO'|'STAMP'|'SIGNATURE'; name: string; url: string; opacity?: number; scale?: number; rotationDeg?: number; crop?: any; placement?: any; isActive?: boolean },
  ) {
    // Signature ownership cannot be bypassed through the general asset editor,
    // including by changing an existing signature's type to LOGO or STAMP.
    const existing = body.id ? await this.prisma.clinicAsset.findFirst({ where: { id: body.id, branchId } }) : null;
    if (body.id && !existing) throw new NotFoundException('Asset not found');
    if (body.type === 'SIGNATURE' || existing?.type === 'SIGNATURE') {
      throw new ForbiddenException('Change your signature from your own doctor settings.');
    }
    const data = {
      branchId,
      ownerId,
      type: body.type as any,
      name: body.name,
      url: body.url,
      opacity: typeof body.opacity === 'number' ? body.opacity : 1,
      scale: typeof body.scale === 'number' ? body.scale : 1,
      rotationDeg: typeof body.rotationDeg === 'number' ? body.rotationDeg : 0,
      crop: body.crop ? JSON.stringify(body.crop) : null,
      placement: body.placement ? JSON.stringify(body.placement) : null,
      isActive: body.isActive !== undefined ? body.isActive : true,
    } as any;
    if (body.id) {
      return this.prisma.clinicAsset.update({ where: { id: body.id }, data });
    }
    return this.prisma.clinicAsset.create({ data });
  }

  async deleteClinicAsset(branchId: string, id: string) {
    const asset = await this.prisma.clinicAsset.findFirst({ where: { id, branchId } });
    if (!asset) throw new NotFoundException('Asset not found');
    if (asset.type === 'SIGNATURE') throw new ForbiddenException('Remove your signature from your own doctor settings.');
    await this.prisma.clinicAsset.delete({ where: { id } });
    return { id };
  }

  // PRINTER PROFILES
  async listPrinterProfiles(branchId: string, ownerId?: string) {
    return this.prisma.printerProfile.findMany({
      where: { branchId, OR: [{ ownerId: null }, ownerId ? { ownerId } : undefined].filter(Boolean) as any },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async upsertPrinterProfile(
    branchId: string,
    ownerId: string,
    body: { id?: string; name: string; paperPreset?: string; topMarginPx?: number; leftMarginPx?: number; rightMarginPx?: number; bottomMarginPx?: number; contentOffsetXPx?: number; contentOffsetYPx?: number; grayscale?: boolean; bleedSafeMm?: number; metadata?: any; isDefault?: boolean },
  ) {
    const data = {
      branchId,
      ownerId,
      name: body.name,
      paperPreset: body.paperPreset ?? 'A4',
      topMarginPx: body.topMarginPx ?? 150,
      leftMarginPx: body.leftMarginPx ?? 45,
      rightMarginPx: body.rightMarginPx ?? 45,
      bottomMarginPx: body.bottomMarginPx ?? 45,
      contentOffsetXPx: body.contentOffsetXPx ?? 0,
      contentOffsetYPx: body.contentOffsetYPx ?? 0,
      grayscale: !!body.grayscale,
      bleedSafeMm: body.bleedSafeMm ?? 0,
      metadata: body.metadata ? JSON.stringify(body.metadata) : null,
      isDefault: !!body.isDefault,
    } as any;
    if (body.id) {
      const updated = await this.prisma.printerProfile.update({ where: { id: body.id }, data });
      if (data.isDefault) await this.prisma.printerProfile.updateMany({ where: { branchId, NOT: { id: updated.id } }, data: { isDefault: false } });
      return updated;
    }
    const created = await this.prisma.printerProfile.create({ data });
    if (data.isDefault) await this.prisma.printerProfile.updateMany({ where: { branchId, NOT: { id: created.id } }, data: { isDefault: false } });
    return created;
  }

  async setDefaultPrinterProfile(branchId: string, ownerId: string, id: string) {
    const profile = await this.prisma.printerProfile.findFirst({ where: { id, branchId } });
    if (!profile) throw new NotFoundException('Printer profile not found');
    await this.prisma.printerProfile.updateMany({ where: { branchId }, data: { isDefault: false } });
    return this.prisma.printerProfile.update({ where: { id }, data: { isDefault: true } });
  }

  async deletePrinterProfile(branchId: string, ownerId: string, id: string) {
    const profile = await this.prisma.printerProfile.findFirst({ where: { id, branchId } });
    if (!profile) throw new NotFoundException('Printer profile not found');
    await this.prisma.printerProfile.delete({ where: { id } });
    return { id };
  }

  /**
   * @cc [owner:nareshshah139,label:product] prescription-signature-selection
   * PDF generation MUST use the prescribing doctor's branch-scoped signature
   * only when showSignature is true; otherwise leave space to sign by hand.
   */
  /**
   * @cc [owner:nareshshah139,label:product] tele-video-prescription-output
   * PDF downloads and shared PDFs MUST show the tele-video label beside the date
   * and the clinic disclaimer above the signature only for tele-video visits.
   * The disclaimer and signature MUST stay together when pagination is needed.
   */
  private async buildPrescriptionPdfBuffer(
    prescriptionId: string,
    branchId: string,
    body?: { profileId?: string; includeAssets?: boolean; grayscale?: boolean; showSignature?: boolean },
  ): Promise<{ pdfBuffer: Buffer; fileName: string }> {
    const prescription = await this.prisma.prescription.findFirst({
      where: { id: prescriptionId, visit: { deletedAt: null, patient: { branchId } } },
      include: { visit: { include: { patient: true, doctor: true } } },
    });
    if (!prescription) throw new NotFoundException('Prescription not found');
    const signature = body?.showSignature === true
      ? await readDoctorSignature(this.prisma, branchId, prescription.visit.doctorId || prescription.visit.doctor.id)
      : null;

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finish = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const ctx = this.buildRenderContext(prescription);
    doc.fontSize(16).text(this.renderTemplate('Prescription', ctx), { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(this.renderTemplate('Patient: {{ patient.name }}', ctx));
    doc.text(this.renderTemplate('Doctor: {{ doctor.firstName }} {{ doctor.lastName }}', ctx));
    const teleVideo = prescription.visit.consultationType === ConsultationType.TELE_VIDEO;
    const date = new Date(prescription.visit.createdAt || prescription.createdAt || Date.now()).toLocaleDateString('en-IN');
    doc.text(`Date: ${date}${teleVideo ? ' | Consultation: Tele-video' : ''}`);
    doc.moveDown();

    try {
      const items = JSON.parse(prescription.items as any) as any[];
      items.forEach((it, idx) => {
        const line = `${idx + 1}. ${it.drugName || ''} ${it.dosage || ''} ${it.dosageUnit || ''} — ${it.frequency || ''} x ${it.duration || ''} ${it.durationUnit || ''}`;
        doc.fontSize(11).text(line);
        if (it.instructions) doc.fontSize(9).fillColor('#444').text(`Notes: ${it.instructions}`).fillColor('#000');
      });
    } catch {}

    // Keep the signature and name together, with the same space for hand signing.
    const signatureHeight = 64;
    doc.fontSize(9);
    const disclaimerHeight = teleVideo ? doc.heightOfString(TELE_VIDEO_DISCLAIMER) + 16 : 0;
    if (doc.y + disclaimerHeight + signatureHeight + 60 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    doc.moveDown();
    if (teleVideo) {
      doc.text(TELE_VIDEO_DISCLAIMER);
      doc.moveDown();
    }
    const signatureY = doc.y;
    if (signature) doc.image(Buffer.from(signature.url.split(',')[1], 'base64'), doc.page.width - 200, signatureY,
      { fit: [160, signatureHeight], align: 'right', valign: 'bottom' });
    doc.y = signatureY + signatureHeight + 4;
    doc.fontSize(11).text(`Dr. ${prescription.visit.doctor.firstName} ${prescription.visit.doctor.lastName}`, 40, doc.y, { align: 'right' });
    doc.fontSize(9).text('Signature', { align: 'right' });
    doc.end();
    const pdfBuffer = await finish;
    return { pdfBuffer, fileName: `prescription-${prescriptionId}.pdf` };
  }

  // SERVER-SIDE PDF RENDERING (basic pdfkit layout)
  async generatePrescriptionPdf(
    prescriptionId: string,
    branchId: string,
    body: { profileId?: string; includeAssets?: boolean; grayscale?: boolean; showSignature?: boolean },
  ) {
    const { pdfBuffer, fileName } = await this.buildPrescriptionPdfBuffer(prescriptionId, branchId, body);
    const base64 = pdfBuffer.toString('base64');
    await this.prisma.prescriptionPrintEvent.create({
      data: { prescriptionId, eventType: 'PDF_DOWNLOAD', channel: 'SERVER', count: 1 },
    });
    return { fileUrl: `data:application/pdf;base64,${base64}`, fileName, fileSize: pdfBuffer.length };
  }

  async sharePrescription(
    prescriptionId: string,
    branchId: string,
    userId: string,
    body: { channel: 'EMAIL'|'WHATSAPP'; to: string; message?: string; includePdf?: boolean; showSignature?: boolean },
  ) {
    await this.requireSharePrescription(prescriptionId, branchId, body);
    const pdf = body.includePdf ? await this.buildPrescriptionPdfBuffer(prescriptionId, branchId, body) : null;
    if (body.channel === 'EMAIL') {
      await this.notifications.sendEmail({ to: body.to, subject: 'Your Prescription', text: body.message || 'Your prescription is ready.',
        attachments: pdf ? [{ filename: pdf.fileName, content: pdf.pdfBuffer, contentType: 'application/pdf' }] : undefined });
    } else if (body.channel === 'WHATSAPP') {
      if (body.includePdf) {
        const { pdfBuffer, fileName } = pdf!;
        await this.notifications.sendWhatsAppDocument({
          toPhoneE164: body.to,
          pdfBuffer,
          fileName,
          caption: body.message || 'Your prescription is ready.',
        });
      } else {
        await this.notifications.sendWhatsApp({ toPhoneE164: body.to, text: body.message || 'Your prescription is ready.' });
      }
    }
    await this.prisma.prescriptionPrintEvent.create({
      data: { prescriptionId, eventType: `${body.channel}_SHARE`, channel: body.to, count: 1, metadata: body.message ? JSON.stringify({ message: body.message, includePdf: !!body.includePdf }) : null },
    });
    return { status: 'QUEUED', channel: body.channel, to: body.to };
  }

  private async requireSharePrescription(prescriptionId: string, branchId: string, body: { channel: string; to: string }) {
    if (!['EMAIL', 'WHATSAPP'].includes(body.channel) || typeof body.to !== 'string' || !body.to.trim()) {
      throw new BadRequestException('Choose a sharing channel and recipient.');
    }
    const prescription = await this.prisma.prescription.findFirst({ where: { id: prescriptionId, visit: { deletedAt: null, patient: { branchId } } }, select: { id: true } });
    if (!prescription) throw new NotFoundException('Prescription not found');
  }

  /**
   * @cc [owner:nareshshah139,label:product;security] preview-share-parity
   * Sharing MUST verify the prescription belongs to the caller's branch before
   * sending the supplied PDF bytes unchanged to Email or WhatsApp. Invalid PDF
   * inputs or recipients MUST fail without sending.
   */
  /**
   * @cc [owner:nareshshah139,label:security] preview-share-boundary
   * Preview sharing MUST reject prescriptions outside the authenticated branch,
   * missing recipients, unsupported channels and non-PDF or oversized uploads
   * before sending any message or recording a print event.
   */
  async sharePrescriptionPreview(prescriptionId: string, branchId: string,
    body: { channel: 'EMAIL'|'WHATSAPP'; to: string; message?: string }, file?: Express.Multer.File) {
    await this.requireSharePrescription(prescriptionId, branchId, body);
    if (!file?.buffer?.length || file.buffer.length > 15 * 1024 * 1024 || file.mimetype !== 'application/pdf' || file.buffer.subarray(0, 5).toString() !== '%PDF-') {
      throw new BadRequestException('A valid prescription PDF up to 15 MB is required.');
    }
    const fileName = `prescription-${prescriptionId}.pdf`;
    if (body.channel === 'EMAIL') {
      await this.notifications.sendEmail({ to: body.to, subject: 'Your Prescription', text: body.message || 'Your prescription is attached.',
        attachments: [{ filename: fileName, content: file.buffer, contentType: 'application/pdf' }] });
    } else {
      await this.notifications.sendWhatsAppDocument({ toPhoneE164: body.to, pdfBuffer: file.buffer, fileName, caption: body.message || 'Your prescription is attached.' });
    }
    await this.prisma.prescriptionPrintEvent.create({ data: { prescriptionId, eventType: `${body.channel}_SHARE`, channel: body.to, count: 1 } });
    return { status: 'QUEUED', channel: body.channel, to: body.to };
  }

  // Simple merge tags, conditionals, and macros renderer for PDF text blocks
  private renderTemplate(template: string, context: Record<string, any>): string {
    if (!template) return '';
    let output = String(template);
    // Macros like {{ macros.followUpPlusDays(30) }}
    output = output.replace(/\{\{\s*macros\.([a-zA-Z0-9_]+)\((.*?)\)\s*\}\}/g, (_m, fn, args) => {
      const argVals = String(args || '')
        .split(',')
        .map((s) => s.trim())
        .map((s) => (s.match(/^['\"]/)? s.slice(1, -1) : Number(s))) as any[];
      const val = this.evalMacro(fn, argVals, context);
      return val != null ? String(val) : '';
    });
    // Conditionals: {% if patient.name %} ... {% endif %}
    output = output.replace(/\{\%\s*if\s+([^\%]+?)\s*\%\}([\s\S]*?)\{\%\s*endif\s*\%\}/g, (_m, cond, inner) => {
      try {
        const v = this.lookup(context, String(cond).trim());
        return v ? inner : '';
      } catch {
        return '';
      }
    });
    // Merge tags: {{ patient.name }}
    output = output.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_m, expr) => {
      try {
        const v = this.lookup(context, String(expr).trim());
        return v != null ? String(v) : '';
      } catch {
        return '';
      }
    });
    return output;
  }

  private lookup(obj: Record<string, any>, path: string): any {
    const parts = path.split('.');
    let cur: any = obj;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  private evalMacro(name: string, args: any[], ctx: Record<string, any>): any {
    const now = new Date();
    switch (name) {
      case 'today':
        return now.toISOString().slice(0, 10);
      case 'nextReviewPlusDays': {
        const base = ctx.visit?.followUp ? new Date(ctx.visit.followUp) : now;
        const d = new Date(base);
        const inc = Number(args?.[0] || 0);
        d.setDate(d.getDate() + inc);
        return d.toISOString().slice(0, 10);
      }
      case 'followUpPlusDays': {
        const base = ctx.visit?.followUp ? new Date(ctx.visit.followUp) : now;
        const d = new Date(base);
        const inc = Number(args?.[0] || 0);
        d.setDate(d.getDate() + inc);
        return d.toISOString().slice(0, 10);
      }
      default:
        return '';
    }
  }

  private buildRenderContext(prescription: any): Record<string, any> {
    const patient = prescription.visit?.patient || {};
    const doctor = prescription.visit?.doctor || {};
    const visit = {
      id: prescription.visit?.id,
      createdAt: prescription.visit?.createdAt,
      followUp: prescription.visit?.followUp,
    };
    return { patient, doctor, visit, prescription };
  }

  async recordPrintEvent(
    prescriptionId: string,
    branchId: string,
    body: { eventType: string; channel?: string; count?: number; metadata?: any },
  ) {
    // Validate prescription belongs to branch
    const exists = await this.prisma.prescription.findFirst({ where: { id: prescriptionId, visit: { deletedAt: null, patient: { branchId } } } });
    if (!exists) throw new NotFoundException('Prescription not found');
    const created = await this.prisma.prescriptionPrintEvent.create({
      data: {
        prescriptionId,
        eventType: body.eventType,
        channel: body.channel || null,
        count: body.count ?? 1,
        metadata: body.metadata ? JSON.stringify(body.metadata) : null,
      },
    });
    return created;
  }

  async getPrintEvents(prescriptionId: string, branchId: string) {
    const exists = await this.prisma.prescription.findFirst({ where: { id: prescriptionId, visit: { deletedAt: null, patient: { branchId } } } });
    if (!exists) throw new NotFoundException('Prescription not found');
    const events = await this.prisma.prescriptionPrintEvent.findMany({ where: { prescriptionId }, orderBy: { createdAt: 'desc' } });
    const counts = events.reduce((acc: Record<string, number>, e: any) => {
      const k = e.eventType;
      acc[k] = (acc[k] || 0) + (e.count || 1);
      return acc;
    }, {} as Record<string, number>);
    return { events, totals: counts };
  }

  // TRANSLATION MEMORY
  async listTranslationMemory(branchId: string, filters: { fieldKey?: string; q?: string; targetLanguage?: string }) {
    const where: any = { branchId };
    if (filters.fieldKey) where.fieldKey = filters.fieldKey;
    if (filters.targetLanguage) where.targetLanguage = filters.targetLanguage as any;
    if (filters.q) where.OR = [
      { sourceText: { contains: filters.q, mode: 'insensitive' } },
      { targetText: { contains: filters.q, mode: 'insensitive' } },
    ];
    const entries = await this.prisma.translationMemoryEntry.findMany({ where, orderBy: { updatedAt: 'desc' } });
    return entries;
  }

  async upsertTranslationMemory(
    branchId: string,
    body: { fieldKey: string; sourceText: string; targetLanguage: string; targetText: string; confidence?: number },
  ) {
    const { fieldKey, sourceText, targetLanguage, targetText, confidence } = body;
    const existing = await this.prisma.translationMemoryEntry.findFirst({
      where: { branchId, fieldKey, sourceText, targetLanguage: targetLanguage as any },
    });
    if (existing) {
      return this.prisma.translationMemoryEntry.update({
        where: { id: existing.id },
        data: {
          targetText,
          confidence: typeof confidence === 'number' ? confidence : existing.confidence,
          usageCount: existing.usageCount + 1,
        },
      });
    }
    return this.prisma.translationMemoryEntry.create({
      data: {
        branchId,
        fieldKey,
        sourceText,
        targetLanguage: targetLanguage as any,
        targetText,
        confidence: typeof confidence === 'number' ? confidence : 0,
        usageCount: 1,
      },
    });
  }

  // Interactions preview helper
  async previewDrugInteractions(items: any[]) {
    return {
      interactions: await this.checkDrugInteractions(Array.isArray(items) ? items : []),
    };
  }

  // ANALYTICS / A-B
  async recordTemplateUsage(
    templateId: string,
    branchId: string,
    doctorId: string,
    body: { prescriptionId?: string; variant?: string; alignmentDx?: any },
  ) {
    // Ensure template belongs to branch
    const template = await this.prisma.prescriptionTemplate.findFirst({ where: { id: templateId, branchId } });
    if (!template) throw new NotFoundException('Template not found');
    return this.prisma.templateUsage.create({
      data: {
        templateId,
        branchId,
        doctorId,
        prescriptionId: body?.prescriptionId || null,
        variant: body?.variant || null,
        alignmentDx: body?.alignmentDx ? JSON.stringify(body.alignmentDx) : null,
      },
    });
  }

  async listLayoutExperiments(branchId: string) {
    const experiments = await this.prisma.layoutExperiment.findMany({
      where: { branchId, active: true },
      include: { variants: true },
      orderBy: { createdAt: 'desc' },
    });
    return experiments;
  }

  async assignLayoutVariant(branchId: string, experimentKey: string, doctorId?: string, patientId?: string) {
    const exp = await this.prisma.layoutExperiment.findFirst({ where: { branchId, key: experimentKey, active: true }, include: { variants: true } });
    if (!exp) throw new NotFoundException('Experiment not found');
    const totalWeight = exp.variants.reduce((sum, v) => sum + (v.weight || 0), 0) || 1;
    const r = Math.random() * totalWeight;
    let acc = 0;
    let chosen = exp.variants[0];
    for (const v of exp.variants) {
      acc += v.weight || 0;
      if (r <= acc) { chosen = v; break; }
    }
    const assignment = await this.prisma.experimentAssignment.create({
      data: {
        experimentId: exp.id,
        doctorId: doctorId || null,
        patientId: patientId || null,
        variantId: chosen.id,
      },
    });
    return { experiment: exp.key, variant: chosen.key, assignmentId: assignment.id };
  }

  async createPrescriptionPad(payload: CreatePrescriptionPadDto, branchId: string, actorId?: string) {
    const {
      patientId,
      doctorId,
      items,
      diagnosis,
      notes,
      language,
      validUntil,
      maxRefills,
      followUpInstructions,
      metadata,
      procedureMetrics,
      reason,
    } = payload;

    if (!items || items.length === 0) {
      throw new BadRequestException('At least one prescription item is required');
    }

    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, branchId } });
    if (!patient) {
      throw new NotFoundException('Patient not found in this branch');
    }

    const doctor = await this.prisma.user.findFirst({ where: { id: doctorId, branchId, role: 'DOCTOR' } });
    if (!doctor) {
      throw new NotFoundException('Doctor not found in this branch');
    }

    const autoVisit = await this.prisma.visit.create({
      data: {
        patientId,
        doctorId,
        complaints: JSON.stringify([
          {
            complaint: reason || 'Prescription issued without full visit',
            severity: 'MILD',
            source: 'PRESCRIPTION_PAD',
          },
        ]),
        history: JSON.stringify({ source: 'PRESCRIPTION_PAD', notes: reason || null }),
        exam: null,
        diagnosis: diagnosis ? JSON.stringify([{ diagnosis }]) : null,
        plan: JSON.stringify({
          notes: notes || undefined,
          prescriptionOnly: true,
          metadata: {
            reason,
            createdVia: 'PRESCRIPTION_PAD',
          },
        }),
        scribeJson: JSON.stringify({ createdVia: 'PRESCRIPTION_PAD', reason }),
      },
    });

    try {
      const prescription = await this.createPrescription(
        {
          clinicalData: payload.clinicalData,
          patientId,
          visitId: autoVisit.id,
          doctorId,
          items,
          diagnosis,
          notes,
          language,
          validUntil,
          maxRefills,
          followUpInstructions,
          metadata,
          procedureMetrics,
        },
        branchId,
        actorId,
      );

      return {
        ...prescription,
        visitId: autoVisit.id,

      };
    } catch (err) {
      await this.prisma.prescription.deleteMany({ where: { visitId: autoVisit.id } }).catch(() => undefined);
      await this.prisma.visit.delete({ where: { id: autoVisit.id } }).catch(() => undefined);
      throw err;
    }
  }

  private toPositiveInt(value: unknown, fallback: number): number {
    const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }

  private extractPrescriptionDiagnosis(prescription: any, metadata: any): string {
    if (typeof metadata?.diagnosis === 'string' && metadata.diagnosis.trim()) {
      return metadata.diagnosis.trim();
    }
    if (typeof prescription.visit?.diagnosis === 'string' && prescription.visit.diagnosis.trim()) {
      return prescription.visit.diagnosis.trim();
    }
    const note = typeof prescription.pharmacistNotes === 'string' ? prescription.pharmacistNotes : '';
    const match = note.match(/\bDx\s*:\s*(.+)$/i);
    return match ? match[1].trim() : '';
  }

  private safeParse<T>(value: string | null | undefined, fallback: T): T {
    if (!value || typeof value !== 'string') return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
}
