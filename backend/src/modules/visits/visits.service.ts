import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { CreateVisitDto, UpdateVisitDto, CompleteVisitDto } from './dto/create-visit.dto';
import { QueryVisitsDto, PatientVisitHistoryDto, DoctorVisitsDto } from './dto/query-visit.dto';
import { Language } from '@prisma/client';

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

    // Create visit
    const visit = await this.prisma.visit.create({
      data: {
        patientId,
        doctorId,
        appointmentId,
        vitals: vitals ? JSON.stringify(vitals) : null,
        complaints: JSON.stringify(complaints),
        history: history ? JSON.stringify(history) : null,
        exam: examination ? JSON.stringify(examination) : null,
        diagnosis: diagnosis ? JSON.stringify(diagnosis) : null,
        plan: treatmentPlan ? JSON.stringify(treatmentPlan) : null,
        attachments: attachments ? JSON.stringify(attachments) : null,
        scribeJson: scribeJson ? JSON.stringify(scribeJson) : null,
        branchId,
        notes,
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
          select: { id: true, name: true, email: true },
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

    // Update appointment status if linked
    if (appointmentId) {
      await this.prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: 'IN_PROGRESS' },
      });
    }

    return visit;
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

    const skip = (page - 1) * limit;

    const where: any = {
      branchId,
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

    // Search filter
    if (search) {
      where.OR = [
        {
          complaints: {
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
            select: { id: true, name: true },
          },
          appointment: {
            select: { id: true, date: true, slot: true, tokenNumber: true },
          },
        },
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      this.prisma.visit.count({ where }),
    ]);

    return {
      visits,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, branchId: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id, branchId },
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
          select: { id: true, name: true, email: true },
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
      vitals: visit.vitals ? JSON.parse(visit.vitals as string) : null,
      complaints: visit.complaints ? JSON.parse(visit.complaints as string) : [],
      history: visit.history ? JSON.parse(visit.history as string) : null,
      exam: visit.exam ? JSON.parse(visit.exam as string) : null,
      diagnosis: visit.diagnosis ? JSON.parse(visit.diagnosis as string) : [],
      plan: visit.plan ? JSON.parse(visit.plan as string) : null,
      attachments: visit.attachments ? JSON.parse(visit.attachments as string) : [],
      scribeJson: visit.scribeJson ? JSON.parse(visit.scribeJson as string) : null,
    };

    return parsedVisit;
  }

  async update(id: string, updateVisitDto: UpdateVisitDto, branchId: string) {
    const visit = await this.findOne(id, branchId);

    // Prepare update data
    const updateData: any = {};

    if (updateVisitDto.vitals) {
      updateData.vitals = JSON.stringify(updateVisitDto.vitals);
    }

    if (updateVisitDto.complaints) {
      updateData.complaints = JSON.stringify(updateVisitDto.complaints);
    }

    if (updateVisitDto.history !== undefined) {
      updateData.history = updateVisitDto.history ? JSON.stringify(updateVisitDto.history) : null;
    }

    if (updateVisitDto.examination) {
      updateData.exam = JSON.stringify(updateVisitDto.examination);
    }

    if (updateVisitDto.diagnosis) {
      updateData.diagnosis = JSON.stringify(updateVisitDto.diagnosis);
    }

    if (updateVisitDto.treatmentPlan) {
      updateData.plan = JSON.stringify(updateVisitDto.treatmentPlan);
    }

    if (updateVisitDto.attachments) {
      updateData.attachments = JSON.stringify(updateVisitDto.attachments);
    }

    if (updateVisitDto.scribeJson) {
      updateData.scribeJson = JSON.stringify(updateVisitDto.scribeJson);
    }

    if (updateVisitDto.notes !== undefined) {
      updateData.notes = updateVisitDto.notes;
    }

    const updatedVisit = await this.prisma.visit.update({
      where: { id },
      data: updateData,
      include: {
        patient: {
          select: { id: true, name: true, phone: true },
        },
        doctor: {
          select: { id: true, name: true },
        },
        appointment: {
          select: { id: true, date: true, slot: true },
        },
      },
    });

    return updatedVisit;
  }

  async complete(id: string, completeVisitDto: CompleteVisitDto, branchId: string) {
    const visit = await this.findOne(id, branchId);

    // Update visit with completion data
    const updateData: any = {};

    if (completeVisitDto.finalNotes) {
      updateData.notes = completeVisitDto.finalNotes;
    }

    if (completeVisitDto.followUpDate) {
      updateData.followUp = new Date(completeVisitDto.followUpDate);
    }

    if (completeVisitDto.followUpInstructions) {
      // Update treatment plan with follow-up instructions
      const currentPlan = visit.plan || {};
      const updatedPlan = {
        ...currentPlan,
        followUpInstructions: completeVisitDto.followUpInstructions,
      };
      updateData.plan = JSON.stringify(updatedPlan);
    }

    const completedVisit = await this.prisma.visit.update({
      where: { id },
      data: updateData,
      include: {
        patient: {
          select: { id: true, name: true, phone: true },
        },
        doctor: {
          select: { id: true, name: true },
        },
        appointment: {
          select: { id: true, date: true, slot: true },
        },
      },
    });

    // Update appointment status to completed if linked
    if (visit.appointmentId) {
      await this.prisma.appointment.update({
        where: { id: visit.appointmentId },
        data: { status: 'COMPLETED' },
      });
    }

    return completedVisit;
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

    // Soft delete by updating notes
    await this.prisma.visit.update({
      where: { id },
      data: {
        notes: `[DELETED] ${visit.notes || ''}`,
      },
    });

    return { message: 'Visit deleted successfully' };
  }

  async getPatientVisitHistory(query: PatientVisitHistoryDto, branchId: string) {
    const { patientId, startDate, endDate, limit = 50 } = query;

    // Validate patient exists and belongs to branch
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, branchId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found in this branch');
    }

    const where: any = {
      patientId,
      branchId,
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
          select: { id: true, name: true },
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
      patient: {
        id: patient.id,
        name: patient.name,
        phone: patient.phone,
      },
      visits: visits.map(visit => ({
        ...visit,
        vitals: visit.vitals ? JSON.parse(visit.vitals as string) : null,
        complaints: visit.complaints ? JSON.parse(visit.complaints as string) : [],
        diagnosis: visit.diagnosis ? JSON.parse(visit.diagnosis as string) : [],
      })),
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
      branchId,
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
        name: doctor.name,
      },
      visits: visits.map(visit => ({
        ...visit,
        vitals: visit.vitals ? JSON.parse(visit.vitals as string) : null,
        complaints: visit.complaints ? JSON.parse(visit.complaints as string) : [],
        diagnosis: visit.diagnosis ? JSON.parse(visit.diagnosis as string) : [],
      })),
    };
  }

  async getVisitStatistics(branchId: string, startDate?: string, endDate?: string) {
    const where: any = { branchId };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [
      totalVisits,
      visitsWithPrescriptions,
      visitsWithFollowUp,
      averageVisitsPerDay,
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
          followUp: { isNot: null },
        },
      }),
      this.prisma.visit.groupBy({
        by: ['createdAt'],
        where,
        _count: { id: true },
      }),
    ]);

    const days = averageVisitsPerDay.length;
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
}
