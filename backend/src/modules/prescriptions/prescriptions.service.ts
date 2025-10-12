// @ts-nocheck
import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
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

@Injectable()
export class PrescriptionsService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  async createPrescription(createPrescriptionDto: CreatePrescriptionDto, branchId: string) {
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
        patient: { branchId },
      },
    });
    if (!visit) {
      throw new NotFoundException('Visit not found in this branch');
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
    const prescription = await this.prisma.prescription.create({
      data: {
        visitId,
        language: language as unknown as any,
        items: JSON.stringify(items),
        // Store textual guidance in instructions/pharmacistNotes for now
        instructions: followUpInstructions || undefined,
        pharmacistNotes: notes || (diagnosis ? `Dx: ${diagnosis}` : undefined),
        genericFirst: true,
      },
      include: {
        visit: {
          select: {
            id: true,
            createdAt: true,
            doctor: { select: { id: true, firstName: true, lastName: true } },
            patient: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    });

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

    const skip = (page - 1) * limit;

    const where: any = {
      visit: {
        patient: { branchId },
      },
    };

    // Apply filters
    if (patientId) where.visit = { ...(where.visit || {}), patientId };
    if (visitId) where.visitId = visitId;
    if (doctorId) where.visit = { ...(where.visit || {}), doctorId };
    if (status) where.status = status;
    if (language) where.language = language;

    // Date filters
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (validUntil) {
      where.validUntil = new Date(validUntil);
    }

    // Search filter
    if (search) {
      where.OR = [
        {
          prescriptionNumber: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          diagnosis: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          notes: {
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
      if (isExpired) {
        where.validUntil = {
          lt: new Date(),
        };
      } else {
        where.validUntil = {
          gte: new Date(),
        };
      }
    }

    // Refills filter
    if (hasRefills !== undefined) {
      if (hasRefills) {
        where.maxRefills = {
          gt: 0,
        };
      } else {
        where.maxRefills = 0;
      }
    }

    const [prescriptions, total] = await Promise.all([
      this.prisma.prescription.findMany({
        where,
        include: {
          patient: {
            select: { id: true, name: true, phone: true },
          },
          visit: {
            select: { 
              id: true, 
              createdAt: true,
              doctor: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          doctor: {
            select: { id: true, name: true, specialization: true },
          },
          refills: {
            select: {
              id: true,
              status: true,
              reason: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      this.prisma.prescription.count({ where }),
    ]);

    // Parse JSON fields
    const parsedPrescriptions = prescriptions.map(prescription => ({
      ...prescription,
      items: this.safeParse<any[]>(prescription.items as string, []),
      metadata: this.safeParse<any>(prescription.metadata as string, null),
    }));

    return {
      prescriptions: parsedPrescriptions,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findPrescriptionById(id: string, branchId: string) {
    const prescription = await this.prisma.prescription.findFirst({
      where: {
        id,
        visit: {
          patient: { branchId },
        },
      },
      include: {
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
    } as any;
  }

  async updatePrescription(id: string, updatePrescriptionDto: UpdatePrescriptionDto, branchId: string) {
    const prescription = await this.findPrescriptionById(id, branchId);

    // Check if prescription can be updated
    if (prescription.status === PrescriptionStatus.COMPLETED) {
      throw new BadRequestException('Cannot update completed prescription');
    }

    if (prescription.status === PrescriptionStatus.CANCELLED) {
      throw new BadRequestException('Cannot update cancelled prescription');
    }

    // Prepare update data
    const updateData: any = {};

    if (updatePrescriptionDto.items) {
      updateData.items = JSON.stringify(updatePrescriptionDto.items);
      // Recalculate validity period if items changed
      updateData.validUntil = this.calculateValidityPeriod(updatePrescriptionDto.items);
    }

    if (updatePrescriptionDto.diagnosis !== undefined) {
      updateData.diagnosis = updatePrescriptionDto.diagnosis;
    }

    if (updatePrescriptionDto.notes !== undefined) {
      updateData.notes = updatePrescriptionDto.notes;
    }

    if (updatePrescriptionDto.language !== undefined) {
      updateData.language = updatePrescriptionDto.language;
    }

    if (updatePrescriptionDto.validUntil !== undefined) {
      updateData.validUntil = updatePrescriptionDto.validUntil ? new Date(updatePrescriptionDto.validUntil) : null;
    }

    if (updatePrescriptionDto.maxRefills !== undefined) {
      updateData.maxRefills = updatePrescriptionDto.maxRefills;
    }

    if (updatePrescriptionDto.followUpInstructions !== undefined) {
      updateData.followUpInstructions = updatePrescriptionDto.followUpInstructions;
    }

    if (updatePrescriptionDto.status !== undefined) {
      updateData.status = updatePrescriptionDto.status;
    }

    if (updatePrescriptionDto.metadata !== undefined) {
      updateData.metadata = updatePrescriptionDto.metadata ? JSON.stringify(updatePrescriptionDto.metadata) : null;
    }

    const updatedPrescription = await this.prisma.prescription.update({
      where: { id },
      data: updateData,
      include: {
        patient: {
          select: { id: true, name: true, phone: true },
        },
        visit: {
          select: { id: true, createdAt: true },
        },
        doctor: {
          select: { id: true, name: true, specialization: true },
        },
      },
    });

    return {
      ...updatedPrescription,
      items: this.safeParse<any[]>(updatedPrescription.items as unknown as string, []),
    } as any;
  }

  async cancelPrescription(id: string, branchId: string, reason?: string) {
    const prescription = await this.findPrescriptionById(id, branchId);

    if (prescription.status === PrescriptionStatus.CANCELLED) {
      throw new BadRequestException('Prescription is already cancelled');
    }

    const cancelledPrescription = await this.prisma.prescription.update({
      where: { id },
      data: {
        status: PrescriptionStatus.CANCELLED,
        notes: reason ? `${prescription.notes || ''}\nCancelled: ${reason}`.trim() : prescription.notes,
      },
    });

    return cancelledPrescription;
  }

  async requestRefill(refillDto: RefillPrescriptionDto, branchId: string) {
    const { prescriptionId, reason, notes, requestedDate, metadata } = refillDto;

    const prescription = await this.findPrescriptionById(prescriptionId, branchId);

    if (prescription.status !== PrescriptionStatus.ACTIVE) {
      throw new BadRequestException('Can only request refill for active prescriptions');
    }

    if (prescription.validUntil && prescription.validUntil < new Date()) {
      throw new BadRequestException('Cannot request refill for expired prescription');
    }

    // Check if refills are allowed
    const usedRefills = prescription.refills.filter(refill => 
      refill.status === RefillStatus.COMPLETED || refill.status === RefillStatus.APPROVED
    ).length;

    if (usedRefills >= prescription.maxRefills) {
      throw new BadRequestException('Maximum refills exceeded');
    }

    // Check for pending refills
    const pendingRefill = prescription.refills.find(refill => 
      refill.status === RefillStatus.PENDING
    );

    if (pendingRefill) {
      throw new ConflictException('Refill request already pending');
    }

    // Create refill request
    const refill = await this.prisma.prescriptionRefill.create({
      data: {
        prescriptionId,
        reason,
        notes,
        status: RefillStatus.PENDING,
        requestedDate: requestedDate ? new Date(requestedDate) : new Date(),
        metadata: metadata ? JSON.stringify(metadata) : null,
        branchId,
      },
      include: {
        prescription: {
          select: {
            id: true,
            prescriptionNumber: true,
            patient: {
              select: { id: true, name: true },
            },
            doctor: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return refill;
  }

  async approveRefill(approveDto: ApproveRefillDto, branchId: string, approvedBy: string) {
    const { refillId, notes, approvedDate, metadata } = approveDto;

    const refill = await this.prisma.prescriptionRefill.findFirst({
      where: { id: refillId, branchId },
      include: {
        prescription: {
          select: {
            id: true,
            status: true,
            validUntil: true,
          },
        },
      },
    });

    if (!refill) {
      throw new NotFoundException('Refill request not found');
    }

    if (refill.status !== RefillStatus.PENDING) {
      throw new BadRequestException('Can only approve pending refill requests');
    }

    // Check if prescription is still valid
    if (refill.prescription.validUntil && refill.prescription.validUntil < new Date()) {
      throw new BadRequestException('Cannot approve refill for expired prescription');
    }

    const approvedRefill = await this.prisma.prescriptionRefill.update({
      where: { id: refillId },
      data: {
        status: RefillStatus.APPROVED,
        notes: notes ? `${refill.notes || ''}\nApproved: ${notes}`.trim() : refill.notes,
        approvedAt: approvedDate ? new Date(approvedDate) : new Date(),
        approvedBy,
        metadata: metadata ? JSON.stringify(metadata) : refill.metadata,
      },
    });

    return approvedRefill;
  }

  async rejectRefill(refillId: string, branchId: string, reason: string, rejectedBy: string) {
    const refill = await this.prisma.prescriptionRefill.findFirst({
      where: { id: refillId, branchId },
    });

    if (!refill) {
      throw new NotFoundException('Refill request not found');
    }

    if (refill.status !== RefillStatus.PENDING) {
      throw new BadRequestException('Can only reject pending refill requests');
    }

    const rejectedRefill = await this.prisma.prescriptionRefill.update({
      where: { id: refillId },
      data: {
        status: RefillStatus.REJECTED,
        notes: `${refill.notes || ''}\nRejected: ${reason}`.trim(),
        approvedAt: new Date(),
        approvedBy: rejectedBy,
      },
    });

    return rejectedRefill;
  }

  async findAllRefills(query: QueryRefillsDto, branchId: string) {
    const {
      prescriptionId,
      patientId,
      status,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: any = {
      branchId,
    };

    // Apply filters
    if (prescriptionId) where.prescriptionId = prescriptionId;
    if (status) where.status = status;

    // Date filters
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Search filter
    if (search) {
      where.OR = [
        {
          reason: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          notes: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    // Patient filter
    if (patientId) {
      where.prescription = {
        patientId,
      };
    }

    const [refills, total] = await Promise.all([
      this.prisma.prescriptionRefill.findMany({
        where,
        include: {
          prescription: {
            select: {
              id: true,
              prescriptionNumber: true,
              patient: {
                select: { id: true, name: true, phone: true },
              },
              doctor: {
                select: { id: true, name: true },
              },
            },
          },
        },
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      this.prisma.prescriptionRefill.count({ where }),
    ]);

    return {
      refills,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getPrescriptionHistory(query: PrescriptionHistoryDto, branchId: string) {
    const { patientId, doctorId, startDate, endDate, drugName, limit = 50 } = query;

    const where: any = {
      branchId,
    };

    if (patientId) where.patientId = patientId;
    if (doctorId) where.doctorId = doctorId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (drugName) {
      where.items = {
        contains: drugName,
        mode: 'insensitive',
      };
    }

    const prescriptions = await this.prisma.prescription.findMany({
      where,
      include: {
        patient: {
          select: { id: true, name: true },
        },
        doctor: {
          select: { id: true, name: true },
        },
        visit: {
          select: { id: true, createdAt: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    // Parse JSON fields and extract drug information
    const history = prescriptions.map(prescription => {
      const items = this.safeParse<any[]>(prescription.items as string, []);
      return {
        ...prescription,
        items,
        drugNames: items.map((item: any) => item.drugName),
      };
    });

    return history;
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

  // Bulk import India-focused drug data into local Drug table
  async importDrugs(drugs: Array<Record<string, any>>, _branchId: string) {
    if (!Array.isArray(drugs) || drugs.length === 0) {
      return { imported: 0, upserts: 0, errors: 0 };
    }

    let upserts = 0;
    let errors = 0;

    const tasks = drugs.map((raw) => {
      const name = String(raw.name || raw.brand || raw.tradeName || '').trim();
      if (!name) {
        errors += 1;
        return Promise.resolve(null);
      }

      const strength = raw.strength ? String(raw.strength) : null;
      const form = raw.form ? String(raw.form) : null;

      return this.prisma.drug.upsert({
        where: {
          // Composite unique: name+strength+form
          name_strength_form: {
            name,
            strength: strength ?? '',
            form: form ?? '',
          } as any,
        },
        update: {
          genericName: raw.genericName ? String(raw.genericName) : null,
          route: raw.route ? String(raw.route) : null,
          manufacturer: raw.manufacturer ? String(raw.manufacturer) : null,
          composition: raw.composition ? String(raw.composition) : null,
          brandNames: raw.brandNames ? JSON.stringify(raw.brandNames) : (raw.brand ? JSON.stringify([raw.brand]) : null),
          aliases: raw.aliases ? JSON.stringify(raw.aliases) : null,
          hsnCode: raw.hsnCode ? String(raw.hsnCode) : null,
          rxRequired: typeof raw.rxRequired === 'boolean' ? raw.rxRequired : true,
          isGeneric: typeof raw.isGeneric === 'boolean' ? raw.isGeneric : false,
          metadata: raw.metadata ? JSON.stringify(raw.metadata) : null,
        },
        create: {
          name,
          strength: strength,
          form: form,
          genericName: raw.genericName ? String(raw.genericName) : null,
          route: raw.route ? String(raw.route) : null,
          manufacturer: raw.manufacturer ? String(raw.manufacturer) : null,
          composition: raw.composition ? String(raw.composition) : null,
          brandNames: raw.brandNames ? JSON.stringify(raw.brandNames) : (raw.brand ? JSON.stringify([raw.brand]) : null),
          aliases: raw.aliases ? JSON.stringify(raw.aliases) : null,
          hsnCode: raw.hsnCode ? String(raw.hsnCode) : null,
          rxRequired: typeof raw.rxRequired === 'boolean' ? raw.rxRequired : true,
          isGeneric: typeof raw.isGeneric === 'boolean' ? raw.isGeneric : false,
          metadata: raw.metadata ? JSON.stringify(raw.metadata) : null,
        },
      })
      .then((res) => { upserts += 1; return res; })
      .catch(() => { errors += 1; return null; });
    });

    await Promise.allSettled(tasks);
    return { imported: drugs.length, upserts, errors };
  }

  // Autocomplete lookup for drug names from local Drug table
  async autocompleteDrugs(q: string, limit: number) {
    const term = (q || '').trim();
    if (!term) return [];

    const results = await this.prisma.drug.findMany({
      where: {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { genericName: { contains: term, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        genericName: true,
        strength: true,
        form: true,
        manufacturer: true,
        brandNames: true,
        isGeneric: true,
      },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return results.map((r) => ({
      id: r.id,
      name: r.name,
      genericName: r.genericName,
      brandNames: r.brandNames ? (() => { try { return JSON.parse(r.brandNames as unknown as string); } catch { return []; } })() : [],
      strength: r.strength,
      form: r.form,
      manufacturer: r.manufacturer,
      isGeneric: r.isGeneric,
    }));
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

    const where: any = {
      branchId,
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (doctorId) where.doctorId = doctorId;

    if (drugName) {
      where.items = {
        contains: drugName,
        mode: 'insensitive',
      };
    }

    const [
      totalPrescriptions,
      prescriptionCount,
      drugBreakdown,
      doctorBreakdown,
      dailyBreakdown,
    ] = await Promise.all([
      this.prisma.prescription.aggregate({
        where,
        _count: { id: true },
      }),
      this.prisma.prescription.count({ where }),
      this.prisma.prescription.groupBy({
        by: ['items'],
        where,
        _count: { id: true },
      }),
      this.prisma.prescription.groupBy({
        by: ['doctorId'],
        where,
        _count: { id: true },
      }),
      this.prisma.prescription.groupBy({
        by: ['createdAt'],
        where,
        _count: { id: true },
      }),
    ]);

    return {
      totalPrescriptions: prescriptionCount,
      drugBreakdown: drugBreakdown.map(item => ({
        drug: item.items,
        count: item._count.id,
      })),
      doctorBreakdown: doctorBreakdown.map(item => ({
        doctorId: item.doctorId,
        count: item._count.id,
      })),
      dailyBreakdown: dailyBreakdown.map(item => ({
        date: item.createdAt,
        count: item._count.id,
      })),
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
        groupBy,
      },
    };
  }

  async getExpiringPrescriptions(query: ExpiringPrescriptionsDto, branchId: string) {
    const { expireBefore, patientId, limit = 50 } = query;

    const where: any = {
      branchId,
      status: PrescriptionStatus.ACTIVE,
    };

    if (patientId) where.patientId = patientId;

    if (expireBefore) {
      where.validUntil = {
        lte: new Date(expireBefore),
      };
    } else {
      // Default to prescriptions expiring in next 7 days
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      where.validUntil = {
        lte: nextWeek,
      };
    }

    const prescriptions = await this.prisma.prescription.findMany({
      where,
      include: {
        patient: {
          select: { id: true, name: true, phone: true },
        },
        doctor: {
          select: { id: true, name: true },
        },
      },
      orderBy: {
        validUntil: 'asc',
      },
      take: limit,
    });

    // Parse JSON fields
    const expiringPrescriptions = prescriptions.map(prescription => ({
      ...prescription,
      items: this.safeParse<any[]>(prescription.items as string, []),
      daysUntilExpiry: prescription.validUntil ? 
        Math.ceil((prescription.validUntil.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null,
    }));

    return {
      prescriptions: expiringPrescriptions,
      totalExpiring: expiringPrescriptions.length,
    };
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

      // Ensure creator exists in branch (more helpful error than FK violation)
      const creator = await this.prisma.user.findFirst({ where: { id: createdBy, branchId } });
      if (!creator) {
        throw new BadRequestException('Creator not found in this branch');
      }

      // Allow templates with only metadata (no items)
      const safeItems = Array.isArray(items) ? items : [];

      // Enrich items with pricing (mrp) where missing
      const enrichedItems = await this.enrichItemsWithDrugPricing(safeItems, branchId);

      const template = await this.prisma.prescriptionTemplate.create({
        data: {
          name: name.trim(),
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
      console.error('❌ createPrescriptionTemplate error:', err?.message || err);
      throw err;
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
        const rawItems = JSON.parse(template.items as string);
        const itemsWithPrice = await this.enrichItemsWithDrugPricing(rawItems, branchId);
        return {
          ...template,
          items: itemsWithPrice,
          metadata: template.metadata ? JSON.parse(template.metadata as string) : null,
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
  private async generatePrescriptionNumber(branchId: string): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const date = String(today.getDate()).padStart(2, '0');

    // Get the last prescription number for today
    const lastPrescription = await this.prisma.prescription.findFirst({
      where: {
        branchId,
        createdAt: {
          gte: new Date(today.setHours(0, 0, 0, 0)),
          lte: new Date(today.setHours(23, 59, 59, 999)),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    let sequence = 1;
    if (lastPrescription) {
      const lastSequence = parseInt(lastPrescription.prescriptionNumber.split('-').pop() || '0');
      sequence = lastSequence + 1;
    }

    return `RX-${year}${month}${date}-${String(sequence).padStart(3, '0')}`;
  }

  private calculateValidityPeriod(items: any[]): Date {
    // Calculate validity based on the longest duration in the prescription
    let maxDays = 0;

    items.forEach(item => {
      let days = 0;
      switch (item.durationUnit) {
        case 'DAYS':
          days = item.duration;
          break;
        case 'WEEKS':
          days = item.duration * 7;
          break;
        case 'MONTHS':
          days = item.duration * 30;
          break;
        case 'YEARS':
          days = item.duration * 365;
          break;
      }
      maxDays = Math.max(maxDays, days);
    });

    // Add 30 days buffer to the validity period
    const validityDate = new Date();
    validityDate.setDate(validityDate.getDate() + maxDays + 30);

    return validityDate;
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

  // SERVER-SIDE PDF RENDERING (basic pdfkit layout)
  async generatePrescriptionPdf(
    prescriptionId: string,
    branchId: string,
    body: { profileId?: string; includeAssets?: boolean; grayscale?: boolean },
  ) {
    const prescription = await this.prisma.prescription.findFirst({
      where: { id: prescriptionId, visit: { patient: { branchId } } },
      include: { visit: { include: { patient: true, doctor: true } } },
    });
    if (!prescription) throw new NotFoundException('Prescription not found');

    const profile = body?.profileId ? await this.prisma.printerProfile.findFirst({ where: { id: body.profileId, branchId } }) : null;
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finish = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    // Build render context & optional macros
    const ctx = this.buildRenderContext(prescription);
    // Header
    doc.fontSize(16).text(this.renderTemplate('Prescription', ctx), { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(this.renderTemplate('Patient: {{ patient.name }}', ctx));
    doc.text(this.renderTemplate('Doctor: {{ doctor.firstName }} {{ doctor.lastName }}', ctx));
    doc.moveDown();

    // Items
    try {
      const items = JSON.parse(prescription.items as any) as any[];
      items.forEach((it, idx) => {
        const line = `${idx + 1}. ${it.drugName || ''} ${it.dosage || ''} ${it.dosageUnit || ''} — ${it.frequency || ''} x ${it.duration || ''} ${it.durationUnit || ''}`;
        doc.fontSize(11).text(line);
        if (it.instructions) doc.fontSize(9).fillColor('#444').text(`Notes: ${it.instructions}`).fillColor('#000');
      });
    } catch {}

    doc.end();
    const pdfBuffer = await finish;
    const base64 = pdfBuffer.toString('base64');
    // Record event
    await this.prisma.prescriptionPrintEvent.create({
      data: { prescriptionId, eventType: 'PDF_DOWNLOAD', channel: 'SERVER', count: 1 },
    });
    return { fileUrl: `data:application/pdf;base64,${base64}`, fileName: `prescription-${prescriptionId}.pdf`, fileSize: pdfBuffer.length };
  }

  async sharePrescription(
    prescriptionId: string,
    branchId: string,
    userId: string,
    body: { channel: 'EMAIL'|'WHATSAPP'; to: string; message?: string },
  ) {
    // Minimal: send via configured providers if available
    if (body.channel === 'EMAIL') {
      await this.notifications.sendEmail({ to: body.to, subject: 'Your Prescription', text: body.message || 'Your prescription is attached/generated.' });
    } else if (body.channel === 'WHATSAPP') {
      await this.notifications.sendWhatsApp({ toPhoneE164: body.to, text: body.message || 'Your prescription is ready.' });
    }
    await this.prisma.prescriptionPrintEvent.create({
      data: { prescriptionId, eventType: `${body.channel}_SHARE`, channel: body.to, count: 1, metadata: body.message ? JSON.stringify({ message: body.message }) : null },
    });
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
    const exists = await this.prisma.prescription.findFirst({ where: { id: prescriptionId, visit: { patient: { branchId } } } });
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
    const exists = await this.prisma.prescription.findFirst({ where: { id: prescriptionId, visit: { patient: { branchId } } } });
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

  async createPrescriptionPad(payload: CreatePrescriptionPadDto, branchId: string) {
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
      );

      return {
        ...prescription,
        visitId: autoVisit.id,
        visit: {
          id: autoVisit.id,
          createdAt: autoVisit.createdAt,
        },
      };
    } catch (err) {
      await this.prisma.prescription.deleteMany({ where: { visitId: autoVisit.id } }).catch(() => undefined);
      await this.prisma.visit.delete({ where: { id: autoVisit.id } }).catch(() => undefined);
      throw err;
    }
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
