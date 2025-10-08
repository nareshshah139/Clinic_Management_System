import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { CreateVisitDto, UpdateVisitDto, CompleteVisitDto } from './dto/create-visit.dto';
import { QueryVisitsDto, PatientVisitHistoryDto, DoctorVisitsDto } from './dto/query-visit.dto';
import { Language } from '@prisma/client';
import { join, posix as pathPosix } from 'path';
import { randomBytes } from 'crypto';
import * as fs from 'fs';

@Injectable()
export class VisitsService {
  constructor(private prisma: PrismaService) {}

  async create(createVisitDto: CreateVisitDto, branchId: string) {
    const {
      patientId,
      doctorId,
      appointmentId,
      vitals,
      complaints,
      history,
      examination,
      diagnosis,
      treatmentPlan,
      attachments,
      scribeJson,
      language,
      notes,
    } = createVisitDto;

    // Validate complaints are provided first so we return 400 before 404s
    if (!complaints || complaints.length === 0) {
      throw new BadRequestException('At least one complaint is required');
    }

    // Validate patient exists and belongs to branch
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, branchId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found in this branch');
    }

    // Validate doctor exists and belongs to branch
    const doctor = await this.prisma.user.findFirst({
      where: { id: doctorId, branchId, role: 'DOCTOR' },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor not found in this branch');
    }

    // Validate appointment if provided
    if (appointmentId) {
      const appointment = await this.prisma.appointment.findFirst({
        where: { 
          id: appointmentId, 
          branchId,
          patientId,
          doctorId,
        },
      });
      if (!appointment) {
        throw new NotFoundException('Appointment not found or does not match patient/doctor');
      }

      // Block visits starting from CANCELLED/COMPLETED appointments
      if (['CANCELLED', 'COMPLETED'].includes((appointment as any).status)) {
        throw new BadRequestException('Cannot create a visit from a cancelled or completed appointment');
      }

      // Check if visit already exists for this appointment
      const existingVisit = await this.prisma.visit.findFirst({
        where: { appointmentId },
      });
      if (existingVisit) {
        throw new ConflictException('Visit already exists for this appointment');
      }
    }

    // Validate complaints are provided
    if (!complaints || complaints.length === 0) {
      throw new BadRequestException('At least one complaint is required');
    }

    // Merge top-level notes into plan JSON to preserve the field semantically
    const mergedPlanObject = (() => {
      const basePlan = treatmentPlan ? { ...treatmentPlan } : undefined;
      if (notes) {
        return { ...(basePlan ?? {}), notes };
      }
      return basePlan;
    })();

    // Create visit and update appointment status atomically
    const visit = await this.prisma.$transaction(async tx => {
      const createdVisit = await tx.visit.create({
        data: {
          patientId,
          doctorId,
          appointmentId,
          vitals: vitals ? JSON.stringify(vitals) : null,
          complaints: JSON.stringify(complaints),
          history: history ? JSON.stringify(history) : null,
          exam: examination ? JSON.stringify(examination) : null,
          diagnosis: diagnosis ? JSON.stringify(diagnosis) : null,
          plan: mergedPlanObject ? JSON.stringify(mergedPlanObject) : null,
          attachments: attachments ? JSON.stringify(attachments) : null,
          scribeJson: scribeJson ? JSON.stringify(scribeJson) : null,
        },
        include: {
          patient: {
            select: { 
              id: true, 
              name: true, 
              phone: true, 
              gender: true,
              dob: true,
              address: true,
            },
          },
          doctor: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          appointment: {
            select: { 
              id: true, 
              date: true, 
              slot: true, 
              status: true,
              tokenNumber: true,
            },
          },
        },
      });

      if (appointmentId) {
        await tx.appointment.update({
          where: { id: appointmentId },
          data: { status: 'IN_PROGRESS' },
        });
      }

      return createdVisit;
    });

    // Preserve doctor.name and top-level notes in response for compatibility
    const parsedPlanAfterCreate = this.safeParse<any>(visit.plan as unknown as string, null);
    return {
      ...visit,
      doctor: visit.doctor
        ? {
            ...visit.doctor,
            name: `${visit.doctor.firstName} ${visit.doctor.lastName}`.trim(),
          }
        : visit.doctor,
      notes: parsedPlanAfterCreate?.notes ?? null,
    };
  }

  async findAll(query: QueryVisitsDto, branchId: string) {
    const {
      patientId,
      doctorId,
      appointmentId,
      date,
      startDate,
      endDate,
      search,
      diagnosis,
      icd10Code,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      patient: {
        branchId,
      },
    };

    // Apply filters
    if (patientId) where.patientId = patientId;
    if (doctorId) where.doctorId = doctorId;
    if (appointmentId) where.appointmentId = appointmentId;

    // Date filters
    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
      where.createdAt = {
        gte: startOfDay,
        lte: endOfDay,
      };
    } else if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Exclude soft-deleted visits (encoded in plan JSON)
    where.AND = [
      {
        OR: [
          { plan: null },
          { NOT: { plan: { contains: '"deleted": true', mode: 'insensitive' } } },
        ],
      },
    ];

    // Search filter (search notes inside plan JSON to preserve notes feature)
    if (search) {
      where.OR = [
        {
          complaints: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          plan: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          patient: {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
      ];
    }

    // Diagnosis filter
    if (diagnosis) {
      where.diagnosis = {
        contains: diagnosis,
        mode: 'insensitive',
      };
    }

    // ICD10 code filter
    if (icd10Code) {
      where.diagnosis = {
        contains: icd10Code,
        mode: 'insensitive',
      };
    }

    const [visits, total] = await Promise.all([
      this.prisma.visit.findMany({
        where,
        include: {
          patient: {
            select: { id: true, name: true, phone: true, gender: true },
          },
          doctor: {
            select: { id: true, firstName: true, lastName: true },
          },
          appointment: {
            select: { id: true, date: true, slot: true, tokenNumber: true },
          },
        },
        skip,
        take: limitNum,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      this.prisma.visit.count({ where }),
    ]);

    // Preserve doctor.name in response for compatibility
    const visitsWithDoctorName = visits.map(v => ({
      ...v,
      doctor: v.doctor
        ? {
            ...v.doctor,
            name: `${v.doctor.firstName} ${v.doctor.lastName}`.trim(),
          }
        : v.doctor,
    }));

    return {
      visits: visitsWithDoctorName,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    };
  }

  async findOne(id: string, branchId: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { 
        id,
        patient: {
          branchId,
        },
      },
      include: {
        patient: {
          select: { 
            id: true, 
            name: true, 
            phone: true, 
            email: true, 
            gender: true,
            dob: true,
            address: true,
            allergies: true,
          },
        },
        doctor: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        appointment: {
          select: { 
            id: true, 
            date: true, 
            slot: true, 
            status: true,
            tokenNumber: true,
            notes: true,
          },
        },
        prescription: {
          select: {
            id: true,
            language: true,
            items: true,
            instructions: true,
            qrcode: true,
            signature: true,
          },
        },
        consents: {
          select: {
            id: true,
            consentType: true,
            language: true,
            text: true,
            signedAt: true,
            signer: true,
            method: true,
          },
        },
        labOrders: {
          select: {
            id: true,
            tests: true,
            partner: true,
            status: true,
            resultsRef: true,
          },
        },
        deviceLogs: {
          select: {
            id: true,
            deviceModel: true,
            serialNo: true,
            parameters: true,
            photoRefs: true,
            operatorId: true,
          },
        },
      },
    });

    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    // Parse JSON fields
    const parsedVisit = {
      ...visit,
      vitals: this.safeParse<any>(visit.vitals as string, null),
      complaints: this.safeParse<any[]>(visit.complaints as string, []),
      history: this.safeParse<any>(visit.history as string, null),
      exam: this.safeParse<any>(visit.exam as string, null),
      diagnosis: this.safeParse<any[]>(visit.diagnosis as string, []),
      plan: this.safeParse<any>(visit.plan as string, null),
      attachments: this.safeParse<string[]>(visit.attachments as string, []),
      scribeJson: this.safeParse<any>(visit.scribeJson as string, null),
      doctor: visit.doctor
        ? {
            ...visit.doctor,
            name: `${(visit.doctor as any).firstName} ${(visit.doctor as any).lastName}`.trim(),
          }
        : visit.doctor,
      notes: (() => {
        try {
          const p = this.safeParse<any>(visit.plan as string, null);
          return p?.notes ?? p?.finalNotes ?? null;
        } catch {
          return null;
        }
      })(),
    };

    return parsedVisit;
  }

  async update(id: string, updateVisitDto: UpdateVisitDto, branchId: string) {
    const visit = await this.findOne(id, branchId);

    // Prepare update data
    const updateData: any = {};

    if (updateVisitDto.vitals !== undefined) {
      updateData.vitals = updateVisitDto.vitals ? JSON.stringify(updateVisitDto.vitals) : null;
    }

    if (updateVisitDto.complaints !== undefined) {
      updateData.complaints = JSON.stringify(updateVisitDto.complaints || []);
    }

    if (updateVisitDto.history !== undefined) {
      updateData.history = updateVisitDto.history ? JSON.stringify(updateVisitDto.history) : null;
    }

    if (updateVisitDto.examination !== undefined) {
      updateData.exam = updateVisitDto.examination ? JSON.stringify(updateVisitDto.examination) : null;
    }

    if (updateVisitDto.diagnosis !== undefined) {
      updateData.diagnosis = JSON.stringify(updateVisitDto.diagnosis || []);
    }

    if (updateVisitDto.treatmentPlan || updateVisitDto.notes !== undefined) {
      const currentPlan = visit.plan || {};
      const updatedPlan = {
        ...currentPlan,
        ...(updateVisitDto.treatmentPlan ? { ...updateVisitDto.treatmentPlan } : {}),
        ...(updateVisitDto.notes !== undefined ? { notes: updateVisitDto.notes } : {}),
      };
      updateData.plan = JSON.stringify(updatedPlan);
    }

    if (updateVisitDto.attachments !== undefined) {
      updateData.attachments = updateVisitDto.attachments ? JSON.stringify(updateVisitDto.attachments) : null;
    }

    if (updateVisitDto.scribeJson !== undefined) {
      updateData.scribeJson = updateVisitDto.scribeJson ? JSON.stringify(updateVisitDto.scribeJson) : null;
    }

    const updatedVisit = await this.prisma.visit.update({
      where: { id },
      data: updateData,
      include: {
        patient: {
          select: { id: true, name: true, phone: true },
        },
        doctor: {
          select: { id: true, firstName: true, lastName: true },
        },
        appointment: {
          select: { id: true, date: true, slot: true },
        },
      },
    });

    return {
      ...updatedVisit,
      doctor: updatedVisit.doctor
        ? {
            ...updatedVisit.doctor,
            name: `${(updatedVisit.doctor as any).firstName} ${(updatedVisit.doctor as any).lastName}`.trim(),
          }
        : updatedVisit.doctor,
      notes: (() => {
        try {
          const p = updatedVisit.plan ? JSON.parse(updatedVisit.plan as unknown as string) : null;
          return p?.notes ?? p?.finalNotes ?? null;
        } catch {
          return null;
        }
      })(),
    };
  }

  async complete(id: string, completeVisitDto: CompleteVisitDto, branchId: string) {
    const visit = await this.findOne(id, branchId);

    // Update visit with completion data
    const updateData: any = {};

    if (completeVisitDto.finalNotes || completeVisitDto.followUpInstructions) {
      const currentPlan = visit.plan || {};
      const updatedPlan = {
        ...currentPlan,
        ...(completeVisitDto.finalNotes ? { finalNotes: completeVisitDto.finalNotes } : {}),
        ...(completeVisitDto.followUpInstructions ? { followUpInstructions: completeVisitDto.followUpInstructions } : {}),
      };
      updateData.plan = JSON.stringify(updatedPlan);
    }

    if (completeVisitDto.followUpDate) {
      updateData.followUp = new Date(completeVisitDto.followUpDate);
    }

    // Idempotency: if appointment already completed, return current state without changing
    if (visit.appointment?.status === 'COMPLETED') {
      return {
        ...visit,
        notes: completeVisitDto.finalNotes ?? visit.notes ?? null,
      };
    }

    // Update visit and appointment status atomically
    const completedVisit = await this.prisma.$transaction(async tx => {
      const updated = await tx.visit.update({
        where: { id },
        data: updateData,
        include: {
          patient: {
            select: { id: true, name: true, phone: true },
          },
          doctor: {
            select: { id: true, firstName: true, lastName: true },
          },
          appointment: {
            select: { id: true, date: true, slot: true },
          },
        },
      });

      if (visit.appointmentId) {
        await tx.appointment.update({
          where: { id: visit.appointmentId },
          data: { status: 'COMPLETED' },
        });
      }

      return updated;
    });

    return {
      ...completedVisit,
      doctor: completedVisit.doctor
        ? {
            ...completedVisit.doctor,
            name: `${(completedVisit.doctor as any).firstName} ${(completedVisit.doctor as any).lastName}`.trim(),
          }
        : completedVisit.doctor,
      notes: completeVisitDto.finalNotes ?? (() => {
        try {
          const p = completedVisit.plan ? JSON.parse(completedVisit.plan as unknown as string) : null;
          return p?.finalNotes ?? p?.notes ?? null;
        } catch {
          return null;
        }
      })(),
    };
  }

  async remove(id: string, branchId: string) {
    const visit = await this.findOne(id, branchId);

    // Check if visit has associated prescriptions or other records
    const prescription = await this.prisma.prescription.findFirst({
      where: { visitId: id },
    });

    if (prescription) {
      throw new BadRequestException('Cannot delete visit with associated prescription');
    }

    // Block delete if attachments exist (DB-backed or legacy JSON)
    const [dbAttachmentCount, legacyAttachments] = await Promise.all([
      (this.prisma as any).visitAttachment.count({ where: { visitId: id } }),
      (async () => {
        try {
          const arr = this.safeParse<string[]>(visit.attachments as any, []);
          return Array.isArray(arr) ? arr.length : 0;
        } catch { return 0; }
      })(),
    ]);
    if (dbAttachmentCount > 0 || (legacyAttachments as any) > 0) {
      throw new BadRequestException('Cannot delete visit with attachments. Delete attachments first.');
    }

    // Soft delete by updating plan to mark deleted (preserving notes semantics)
    const currentPlan = visit.plan || {};
    const updatedPlan = {
      ...currentPlan,
      deleted: true,
      deletedAt: new Date().toISOString(),
    };

    await this.prisma.visit.update({
      where: { id },
      data: {
        plan: JSON.stringify(updatedPlan),
      },
    });

    return { message: 'Visit deleted successfully' };
  }

  async getPatientVisitHistory(query: PatientVisitHistoryDto, branchId: string) {
    const { patientId, startDate, endDate, limit = 50 } = query;
    const take = typeof limit === 'string' ? parseInt(limit, 10) || 50 : (Number.isFinite(limit as any) ? (limit as number) : 50);

    // Validate patient exists and belongs to branch
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, branchId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found in this branch');
    }

    const where: any = {
      patientId,
      patient: {
        branchId,
      },
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const visits = await this.prisma.visit.findMany({
      where,
      include: {
        doctor: {
          select: { id: true, firstName: true, lastName: true },
        },
        appointment: {
          select: { id: true, date: true, slot: true, tokenNumber: true },
        },
        prescription: {
          select: { id: true, createdAt: true, items: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take,
    });

    // Compute photo counts for each visit: DB-backed attachments + legacy JSON attachments
    const visitIds = visits.map(v => v.id);
    let dbAttachmentCounts: Record<string, number> = {};
    let dbAttachmentPreviews: Record<string, { id: string; createdAt: string; position?: string; displayOrder?: number }[]> = {};
    if (visitIds.length > 0) {
      try {
        const dbItems = await (this.prisma as any).visitAttachment.findMany({
          where: { visitId: { in: visitIds } },
          select: { id: true, visitId: true, createdAt: true, position: true, displayOrder: true },
          orderBy: [{ visitId: 'asc' }, { displayOrder: 'asc' }, { createdAt: 'asc' }],
        });
        dbAttachmentCounts = dbItems.reduce((acc: Record<string, number>, row: any) => {
          const key = row.visitId as string;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});
        // Build previews (first 2 per visit)
        dbAttachmentPreviews = dbItems.reduce((acc: Record<string, any[]>, row: any) => {
          const key = row.visitId as string;
          const arr = acc[key] || (acc[key] = []);
          if (arr.length < 2) {
            arr.push({ id: row.id as string, createdAt: (row.createdAt as Date).toISOString(), position: row.position, displayOrder: row.displayOrder });
          }
          return acc;
        }, {} as Record<string, any[]>);
      } catch {}
    }

    return {
      patient: {
        id: patient.id,
        name: patient.name,
        phone: patient.phone,
      },
      visits: visits.map(visit => {
        // Sanitize legacy filesystem attachments to avoid returning non-existent files on Railway
        const legacyRaw = this.safeParse<string[]>(visit.attachments as any, []);
        const legacySanitized = this.sanitizeAttachmentPaths(legacyRaw);
        const legacyCount = Array.isArray(legacySanitized) ? legacySanitized.length : 0;
        const dbCount = dbAttachmentCounts[visit.id] || 0;
        const photos = dbCount + legacyCount;
        // Build up to 3 preview URLs (prefer DB-backed, then legacy)
        const dbPreviews = (dbAttachmentPreviews[visit.id] || []).map(p => `/visits/${visit.id}/photos/${p.id}`);
        const legacyPreviews = Array.isArray(legacySanitized)
          ? legacySanitized.slice(0, Math.max(0, 3 - dbPreviews.length))
          : [];
        const photoPreviewUrls = [...dbPreviews, ...legacyPreviews];

        return {
          ...visit,
          vitals: this.safeParse<any>(visit.vitals as string, null),
          complaints: this.safeParse<any[]>(visit.complaints as string, []),
          diagnosis: this.safeParse<any[]>(visit.diagnosis as string, []),
          // expose a simple photos count for UI badges
          photos,
          photoPreviewUrls,
          doctor: visit.doctor
            ? {
                ...visit.doctor,
                name: `${(visit.doctor as any).firstName} ${(visit.doctor as any).lastName}`.trim(),
              }
            : visit.doctor,
          // summarize drugs for quick history view
          prescriptionDrugNames: (() => {
            try {
              const items = this.safeParse<any[]>(visit.prescription?.items as any, []);
              return Array.isArray(items) ? items.map((it: any) => it?.drugName).filter(Boolean) : [];
            } catch { return []; }
          })(),
          prescription: visit.prescription
            ? {
                id: visit.prescription.id,
                createdAt:
                  visit.prescription.createdAt instanceof Date
                    ? visit.prescription.createdAt.toISOString()
                    : (visit.prescription.createdAt as any) ?? undefined,
              }
            : null,
        };
      }),
    };
  }

  async getDoctorVisits(query: DoctorVisitsDto, branchId: string) {
    const { doctorId, date, startDate, endDate, limit = 50 } = query;

    // Validate doctor exists and belongs to branch
    const doctor = await this.prisma.user.findFirst({
      where: { id: doctorId, branchId, role: 'DOCTOR' },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor not found in this branch');
    }

    const where: any = {
      doctorId,
      doctor: {
        branchId,
      },
    };

    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
      where.createdAt = {
        gte: startOfDay,
        lte: endOfDay,
      };
    } else if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Exclude soft-deleted
    where.AND = [
      {
        OR: [
          { plan: null },
          { NOT: { plan: { contains: '"deleted": true', mode: 'insensitive' } } },
        ],
      },
    ];

    const visits = await this.prisma.visit.findMany({
      where,
      include: {
        patient: {
          select: { id: true, name: true, phone: true, gender: true },
        },
        appointment: {
          select: { id: true, date: true, slot: true, tokenNumber: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return {
      doctor: {
        id: doctor.id,
        name: `${doctor.firstName} ${doctor.lastName}`.trim(),
      },
      visits: visits.map(visit => ({
        ...visit,
        vitals: this.safeParse<any>(visit.vitals as string, null),
        complaints: this.safeParse<any[]>(visit.complaints as string, []),
        diagnosis: this.safeParse<any[]>(visit.diagnosis as string, []),
      })),
    };
  }

  async getVisitStatistics(branchId: string, startDate?: string, endDate?: string) {
    const where: any = { 
      patient: {
        branchId,
      },
      AND: [
        {
          OR: [
            { plan: null },
            { NOT: { plan: { contains: '"deleted": true', mode: 'insensitive' } } },
          ],
        },
      ],
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [
      totalVisits,
      visitsWithPrescriptions,
      visitsWithFollowUp,
      grouped,
    ] = await Promise.all([
      this.prisma.visit.count({ where }),
      this.prisma.visit.count({
        where: {
          ...where,
          prescription: { isNot: null },
        },
      }),
      this.prisma.visit.count({
        where: {
          ...where,
          followUp: { not: null },
        },
      }),
      // Use raw SQL to group by date (truncated day) for accurate average/day
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::int AS count
         FROM "visits"
         WHERE 1=1
           AND ${branchId ? 'EXISTS (SELECT 1 FROM "patients" p WHERE p.id = "visits"."patientId" AND p."branchId" = $1)' : '1=1'}
           ${where.createdAt?.gte ? 'AND "createdAt" >= $2' : ''}
           ${where.createdAt?.lte ? 'AND "createdAt" <= $3' : ''}
           AND ("plan" IS NULL OR POSITION('"deleted": true' IN "plan") = 0)
         GROUP BY 1`,
        ...(branchId ? [branchId] : []),
        ...(where.createdAt?.gte ? [where.createdAt.gte] : []),
        ...(where.createdAt?.lte ? [where.createdAt.lte] : []),
      ),
    ]);

    const days = Array.isArray(grouped) ? grouped.length : 0;
    const avgVisitsPerDay = days > 0 ? totalVisits / days : 0;

    return {
      totalVisits,
      visitsWithPrescriptions,
      visitsWithFollowUp,
      averageVisitsPerDay: Math.round(avgVisitsPerDay * 100) / 100,
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
    };
  }

  private sanitizeAttachmentPaths(
    relPaths: string[] | null | undefined,
    options?: {
      allowedPrefixes?: string[];
    },
  ): string[] {
    const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
    const prefixes = (options?.allowedPrefixes || ['/uploads/visits/']).map(prefix => {
      let normalizedPrefix = pathPosix.normalize(prefix);
      if (!normalizedPrefix.startsWith('/')) {
        normalizedPrefix = `/${normalizedPrefix}`;
      }
      if (!normalizedPrefix.endsWith('/')) {
        normalizedPrefix = `${normalizedPrefix}/`;
      }
      return normalizedPrefix;
    });

    const results = new Set<string>();

    for (const candidate of relPaths || []) {
      if (typeof candidate !== 'string') continue;

      let normalized = pathPosix.normalize(candidate.trim());
      if (!normalized.startsWith('/')) {
        normalized = `/${normalized}`;
      }

      const matchedPrefix = prefixes.find(prefix => normalized.startsWith(prefix));
      if (!matchedPrefix) continue;

      const filename = pathPosix.basename(normalized);
      if (!/^[A-Za-z0-9._-]+$/.test(filename)) continue;
      const ext = pathPosix.extname(filename).toLowerCase();
      if (!allowedExtensions.has(ext)) continue;

      const absolutePath = join(process.cwd(), normalized.replace(/^\//, ''));
      try {
        const stat = fs.statSync(absolutePath);
        if (!stat.isFile()) continue;
      } catch {
        continue;
      }

      const sanitizedPath = `${matchedPrefix}${filename}`;
      results.add(sanitizedPath.startsWith('/') ? sanitizedPath : `/${sanitizedPath}`);
    }

    return Array.from(results);
  }

  async listDraftAttachments(patientId: string, dateStr: string) {
    // DB-backed attachments
    const dbItems = await (this.prisma as any).draftAttachment.findMany({
      where: { patientId, dateStr },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, filename: true, createdAt: true, position: true, displayOrder: true },
    });

    // Legacy filesystem attachments for backward compatibility
    const baseDir = join(process.cwd(), 'uploads', 'patients', patientId, dateStr);
    let legacyFiles: string[] = [];
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      legacyFiles = entries
        .filter(e => e.isFile())
        .map(e => `/uploads/patients/${patientId}/${dateStr}/${e.name}`);
    } catch {}
    const sanitizedLegacy = this.sanitizeAttachmentPaths(legacyFiles, {
      allowedPrefixes: [`/uploads/patients/${patientId}/${dateStr}/`],
    });
    const legacyItems = sanitizedLegacy.map((url: string) => ({ url, uploadedAt: null as string | null }));

    const items = [
      ...dbItems.map((i: any) => ({ url: `/visits/photos/draft/${patientId}/${dateStr}/${i.id}`, uploadedAt: (i.createdAt as Date).toISOString(), position: i.position ?? 'OTHER', displayOrder: i.displayOrder ?? 0 })),
      ...legacyItems,
    ].sort((a, b) => {
      const ao = typeof (a as any).displayOrder === 'number' ? (a as any).displayOrder : this.positionOrderValue((a as any).position);
      const bo = typeof (b as any).displayOrder === 'number' ? (b as any).displayOrder : this.positionOrderValue((b as any).position);
      if (ao !== bo) return ao - bo;
      const at = (a as any).uploadedAt ? Date.parse((a as any).uploadedAt) : 0;
      const bt = (b as any).uploadedAt ? Date.parse((b as any).uploadedAt) : 0;
      return at - bt;
    });

    return { attachments: items.map(i => i.url), items };
  }

  async addAttachments(visitId: string, relPaths: string[], branchId: string) {
    const visit = await this.prisma.visit.findFirst({ where: { id: visitId }, include: { patient: true, doctor: true } });
    if (!visit) throw new NotFoundException('Visit not found');
    // Scope by branch via patient and doctor
    if (visit.patient.branchId !== branchId || visit.doctor.branchId !== branchId) {
      throw new NotFoundException('Visit not found in this branch');
    }
    // Save any filesystem relPaths into legacy JSON for compatibility
    const existing = this.safeParse<string[]>(visit.attachments as any, []);
    const sanitizedExisting = this.sanitizeAttachmentPaths(existing);
    const sanitizedIncoming = this.sanitizeAttachmentPaths(relPaths);
    const merged = Array.from(new Set([...(sanitizedExisting || []), ...(sanitizedIncoming || [])]));

    await this.prisma.visit.update({ where: { id: visitId }, data: { attachments: JSON.stringify(merged) } });
    return { attachments: merged };
  }

  async listAttachments(visitId: string, branchId: string) {
    const visit = await this.prisma.visit.findFirst({ where: { id: visitId }, include: { patient: true, doctor: true } });
    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.patient.branchId !== branchId || visit.doctor.branchId !== branchId) {
      throw new NotFoundException('Visit not found in this branch');
    }

    // DB-backed attachments
    const dbItems = await (this.prisma as any).visitAttachment.findMany({
      where: { visitId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, createdAt: true, position: true, displayOrder: true },
    });

    // Legacy filesystem
    const files = this.safeParse<string[]>(visit.attachments as any, []);
    const sanitized = this.sanitizeAttachmentPaths(files);
    if (sanitized.length !== files.length) {
      try {
        await this.prisma.visit.update({ where: { id: visitId }, data: { attachments: JSON.stringify(sanitized) } });
      } catch {}
    }

    const items = [
      ...dbItems.map((i: any) => ({ url: `/visits/${visitId}/photos/${i.id}`, uploadedAt: (i.createdAt as Date).toISOString(), position: i.position ?? 'OTHER', displayOrder: i.displayOrder ?? 0 })),
      ...sanitized.map((url: string) => ({ url, uploadedAt: null as string | null, position: 'OTHER', displayOrder: 999 })),
    ].sort((a, b) => {
      const ao = typeof (a as any).displayOrder === 'number' ? (a as any).displayOrder : this.positionOrderValue((a as any).position);
      const bo = typeof (b as any).displayOrder === 'number' ? (b as any).displayOrder : this.positionOrderValue((b as any).position);
      if (ao !== bo) return ao - bo;
      const at = (a as any).uploadedAt ? Date.parse((a as any).uploadedAt) : 0;
      const bt = (b as any).uploadedAt ? Date.parse((b as any).uploadedAt) : 0;
      return at - bt;
    });

    return { attachments: items.map(i => i.url), items };
  }

  private generateFilename(preferredExt: string): string {
    const ext = preferredExt.startsWith('.') ? preferredExt.toLowerCase() : `.${preferredExt.toLowerCase()}`;
    const unique = randomBytes(8).toString('hex');
    return `${Date.now()}_${unique}${ext}`;
  }

  private positionOrderValue(position?: string): number {
    switch ((position || 'OTHER').toUpperCase()) {
      case 'FRONT': return 1;
      case 'LEFT_PROFILE': return 2;
      case 'RIGHT_PROFILE': return 3;
      case 'BACK': return 4;
      case 'CLOSE_UP': return 5;
      default: return 99;
    }
  }

  async createVisitAttachment(
    visitId: string,
    branchId: string,
    params: { preferredExt: string; contentType: string; buffer: Buffer; position?: string; displayOrder?: number },
  ) {
    const visit = await this.prisma.visit.findFirst({ where: { id: visitId }, include: { patient: true, doctor: true } });
    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.patient.branchId !== branchId || visit.doctor.branchId !== branchId) {
      throw new NotFoundException('Visit not found in this branch');
    }
    const filename = this.generateFilename(params.preferredExt);
    const created = await (this.prisma as any).visitAttachment.create({
      data: {
        visitId,
        filename,
        contentType: params.contentType || 'image/jpeg',
        sizeBytes: params.buffer.length,
        data: params.buffer,
        position: (params.position as any) ?? 'OTHER',
        displayOrder: Number.isFinite(params.displayOrder as any) ? (params.displayOrder as any) : this.positionOrderValue(params.position),
      },
      select: { id: true },
    });
    return { id: created.id, url: `/visits/${visitId}/photos/${created.id}` };
  }

  async createDraftAttachment(
    patientId: string,
    dateStr: string,
    params: { preferredExt: string; contentType: string; buffer: Buffer; position?: string; displayOrder?: number },
  ) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Patient not found');
    const filename = this.generateFilename(params.preferredExt);
    const created = await (this.prisma as any).draftAttachment.create({
      data: {
        patientId,
        dateStr,
        filename,
        contentType: params.contentType || 'image/jpeg',
        sizeBytes: params.buffer.length,
        data: params.buffer,
        position: (params.position as any) ?? 'OTHER',
        displayOrder: Number.isFinite(params.displayOrder as any) ? (params.displayOrder as any) : this.positionOrderValue(params.position),
      },
      select: { id: true },
    });
    return { id: created.id, url: `/visits/photos/draft/${patientId}/${dateStr}/${created.id}` };
  }

  async getVisitAttachmentBinary(visitId: string, attachmentId: string, branchId: string) {
    const att = await (this.prisma as any).visitAttachment.findFirst({
      where: { id: attachmentId, visitId },
      select: { data: true, contentType: true, visit: { select: { patient: { select: { branchId: true } }, doctor: { select: { branchId: true } } } } },
    });
    if (!att) throw new NotFoundException('Attachment not found');
    // Optional bypass for single-branch deployments
    if (String(process.env.DISABLE_BRANCH_ENFORCEMENT).toLowerCase() !== 'true') {
      const pBranch = (att.visit as any).patient.branchId;
      const dBranch = (att.visit as any).doctor.branchId;
      if (pBranch !== branchId || dBranch !== branchId) throw new NotFoundException('Attachment not found');
    }
    return { data: Buffer.from(att.data as unknown as ArrayBuffer), contentType: att.contentType };
  }

  async getDraftAttachmentBinary(patientId: string, dateStr: string, attachmentId: string) {
    const att = await (this.prisma as any).draftAttachment.findFirst({
      where: { id: attachmentId, patientId, dateStr },
      select: { data: true, contentType: true },
    });
    if (!att) throw new NotFoundException('Attachment not found');
    return { data: Buffer.from(att.data as unknown as ArrayBuffer), contentType: att.contentType };
  }
  
  async deleteDraftAttachment(patientId: string, dateStr: string, attachmentId: string) {
    const att = await (this.prisma as any).draftAttachment.findFirst({ where: { id: attachmentId, patientId, dateStr }, select: { id: true } });
    if (!att) throw new NotFoundException('Attachment not found');
    await (this.prisma as any).draftAttachment.delete({ where: { id: attachmentId } });
    return { ok: true };
  }
  
  async deleteVisitAttachment(visitId: string, attachmentId: string, branchId: string) {
    const att = await (this.prisma as any).visitAttachment.findFirst({
      where: { id: attachmentId, visitId },
      select: {
        id: true,
        visit: { select: { patient: { select: { branchId: true } }, doctor: { select: { branchId: true } } } },
      },
    });
    if (!att) throw new NotFoundException('Attachment not found');
    const pBranch = (att.visit as any).patient.branchId;
    const dBranch = (att.visit as any).doctor.branchId;
    if (pBranch !== branchId || dBranch !== branchId) throw new NotFoundException('Attachment not found');
    await (this.prisma as any).visitAttachment.delete({ where: { id: attachmentId } });
    return { ok: true };
  }

  async deleteLegacyAttachment(visitId: string, url: string, branchId: string) {
    const visit = await this.prisma.visit.findFirst({ where: { id: visitId }, include: { patient: true, doctor: true } });
    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.patient.branchId !== branchId || visit.doctor.branchId !== branchId) {
      throw new NotFoundException('Visit not found in this branch');
    }

    const existing = this.safeParse<string[]>(visit.attachments as any, []);
    const sanitizedExisting = this.sanitizeAttachmentPaths(existing);
    const sanitizedTargetList = this.sanitizeAttachmentPaths([url]);
    const target = sanitizedTargetList[0];
    if (!target) {
      // If the provided URL is invalid or not part of allowed paths, treat as not found for safety
      throw new NotFoundException('Attachment not found');
    }

    const next = sanitizedExisting.filter(u => u !== target);
    if (next.length === sanitizedExisting.length) {
      // nothing to remove
      throw new NotFoundException('Attachment not found');
    }

    // Attempt filesystem delete best-effort
    try {
      const absolutePath = join(process.cwd(), target.replace(/^\//, ''));
      try {
        const stat = fs.statSync(absolutePath);
        if (stat.isFile()) {
          fs.unlinkSync(absolutePath);
        }
      } catch {}
    } catch {}

    await (this.prisma as any).visit.update({ where: { id: visitId }, data: { attachments: JSON.stringify(next) } });
    return { ok: true };
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
