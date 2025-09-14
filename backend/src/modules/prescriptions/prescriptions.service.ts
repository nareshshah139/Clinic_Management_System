import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { 
  CreatePrescriptionDto, 
  UpdatePrescriptionDto, 
  RefillPrescriptionDto, 
  ApproveRefillDto,
  PrescriptionTemplateDto,
  PrescriptionStatus,
  PrescriptionLanguage,
  RefillStatus,
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
  constructor(private prisma: PrismaService) {}

  async createPrescription(createPrescriptionDto: CreatePrescriptionDto, branchId: string) {
    const {
      patientId,
      visitId,
      doctorId,
      items,
      diagnosis,
      notes,
      language = PrescriptionLanguage.EN,
      validUntil,
      maxRefills = 0,
      followUpInstructions,
      metadata,
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
      where: { id: visitId, branchId },
    });
    if (!visit) {
      throw new NotFoundException('Visit not found in this branch');
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

    // Check for drug interactions
    const interactions = await this.checkDrugInteractions(items);

    // Generate prescription number
    const prescriptionNumber = await this.generatePrescriptionNumber(branchId);

    // Calculate validity period
    const validUntilDate = validUntil ? new Date(validUntil) : this.calculateValidityPeriod(items);

    // Create prescription
    const prescription = await this.prisma.prescription.create({
      data: {
        prescriptionNumber,
        patientId,
        visitId,
        doctorId,
        items: JSON.stringify(items),
        diagnosis,
        notes,
        language,
        validUntil: validUntilDate,
        maxRefills,
        followUpInstructions,
        status: PrescriptionStatus.ACTIVE,
        metadata: metadata ? JSON.stringify(metadata) : null,
        branchId,
      },
      include: {
        patient: {
          select: { 
            id: true, 
            name: true, 
            phone: true, 
            email: true,
            address: true,
            gender: true,
            dob: true,
          },
        },
        visit: {
          select: { 
            id: true, 
            createdAt: true,
            complaints: true,
            diagnosis: true,
            doctor: {
              select: { id: true, name: true },
            },
          },
        },
        doctor: {
          select: { 
            id: true, 
            name: true, 
            email: true,
            specialization: true,
          },
        },
        refills: {
          select: {
            id: true,
            status: true,
            reason: true,
            notes: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    return {
      ...prescription,
      items: JSON.parse(prescription.items as string),
      metadata: prescription.metadata ? JSON.parse(prescription.metadata as string) : null,
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
      branchId,
    };

    // Apply filters
    if (patientId) where.patientId = patientId;
    if (visitId) where.visitId = visitId;
    if (doctorId) where.doctorId = doctorId;
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
              doctor: { select: { id: true, name: true } },
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
      items: JSON.parse(prescription.items as string),
      metadata: prescription.metadata ? JSON.parse(prescription.metadata as string) : null,
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
      where: { id, branchId },
      include: {
        patient: {
          select: { 
            id: true, 
            name: true, 
            phone: true, 
            email: true,
            address: true,
            gender: true,
            dob: true,
          },
        },
        visit: {
          select: { 
            id: true, 
            createdAt: true,
            complaints: true,
            diagnosis: true,
            doctor: {
              select: { id: true, name: true },
            },
          },
        },
        doctor: {
          select: { 
            id: true, 
            name: true, 
            email: true,
            specialization: true,
          },
        },
        refills: {
          select: {
            id: true,
            status: true,
            reason: true,
            notes: true,
            createdAt: true,
            approvedAt: true,
            approvedBy: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }

    // Parse JSON fields
    const parsedPrescription = {
      ...prescription,
      items: JSON.parse(prescription.items as string),
      metadata: prescription.metadata ? JSON.parse(prescription.metadata as string) : null,
    };

    // Check for drug interactions
    const interactions = await this.checkDrugInteractions(parsedPrescription.items);

    return {
      ...parsedPrescription,
      interactions,
    };
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

    return updatedPrescription;
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
      const items = JSON.parse(prescription.items as string);
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
        branchId,
        patientId,
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
      items: JSON.parse(prescription.items as string),
      daysUntilExpiry: prescription.validUntil ? 
        Math.ceil((prescription.validUntil.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null,
    }));

    return {
      prescriptions: expiringPrescriptions,
      totalExpiring: expiringPrescriptions.length,
    };
  }

  async createPrescriptionTemplate(templateDto: PrescriptionTemplateDto, branchId: string, createdBy: string) {
    const {
      name,
      description,
      items,
      category,
      specialty,
      isPublic = false,
      metadata,
    } = templateDto;

    // Validate items
    if (!items || items.length === 0) {
      throw new BadRequestException('At least one prescription item is required');
    }

    const template = await this.prisma.prescriptionTemplate.create({
      data: {
        name,
        description,
        items: JSON.stringify(items),
        category,
        specialty,
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

    // Parse JSON fields
    const parsedTemplates = templates.map(template => ({
      ...template,
      items: JSON.parse(template.items as string),
      metadata: template.metadata ? JSON.parse(template.metadata as string) : null,
    }));

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
}
