import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { CreateAppointmentDto, RescheduleAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto, BulkUpdateAppointmentsDto } from './dto/update-appointment.dto';
import { QueryAppointmentsDto, AvailableSlotsDto } from './dto/query-appointment.dto';
import { SchedulingUtils, SchedulingConflict } from './utils/scheduling.utils';
import { AppointmentStatus, VisitType, UserRole } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService, private notifications?: NotificationsService) {}

  async create(createAppointmentDto: CreateAppointmentDto, branchId: string) {
    const { patientId, doctorId, roomId, date, slot, visitType, notes, source } = createAppointmentDto;

    // Validate inputs
    this.validateAppointmentInputs(createAppointmentDto);

    // Validate patient exists and belongs to branch
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, branchId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found in this branch');
    }

    // Validate doctor exists and belongs to branch
    const doctor = await this.prisma.user.findFirst({
      where: { id: doctorId, branchId, role: UserRole.DOCTOR },
      select: { id: true, firstName: true, lastName: true, metadata: true },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor not found in this branch');
    }

    // Validate room if provided
    if (roomId) {
      const room = await this.prisma.room.findFirst({
        where: { id: roomId, branchId, isActive: true },
      });
      if (!room) {
        throw new NotFoundException('Room not found or inactive');
      }
    }

    // Check for scheduling conflicts
    const conflicts = await this.checkSchedulingConflicts(doctorId, roomId ?? null, date, slot, branchId);
    if (conflicts.length > 0) {
      const suggestions = await this.getAlternativeSlots(doctorId, roomId ?? null, date, slot, branchId);
      throw new ConflictException({
        message: 'Scheduling conflict detected',
        conflicts,
        suggestions,
      });
    }

    // Create appointment transactionally with tokenNumber generation to reduce race conditions
    const appointment = await this.prisma.$transaction(async (tx) => {
      const tokenNumber = await (async () => {
        const startOfDay = new Date(`${date}T00:00:00.000Z`);
        const endOfDay = new Date(`${date}T23:59:59.999Z`);
        const last = await tx.appointment.findFirst({
          where: { branchId, date: { gte: startOfDay, lte: endOfDay } },
          orderBy: { tokenNumber: 'desc' },
          select: { tokenNumber: true },
        });
        return ((last?.tokenNumber as number | null) || 0) + 1;
      })();

      return tx.appointment.create({
        data: {
          patientId,
          doctorId,
          roomId,
          date: new Date(date),
          slot,
          visitType: visitType || VisitType.OPD,
          notes,
          source,
          branchId,
          tokenNumber,
        },
        include: {
          patient: {
            select: { id: true, name: true, phone: true, email: true },
          },
          doctor: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          room: {
            select: { id: true, name: true, type: true },
          },
        },
      });
    });

    // Fire-and-forget notifications (if configured and doctor has enabled)
    if (this.notifications) {
      // Check if the doctor has enabled auto WhatsApp confirmations
      const doctorSettings = await this.prisma.user.findUnique({ where: { id: doctorId }, select: { metadata: true, role: true } });
      let allowWhatsApp = false;
      let useTemplate = false;
      let templateName: string | undefined;
      let templateLanguage: string | undefined;
      let waOverrideToken: string | undefined;
      let waOverridePhoneId: string | undefined;
      try {
        const meta = doctorSettings?.metadata ? JSON.parse(doctorSettings.metadata) : null;
        allowWhatsApp = !!meta?.whatsappAutoConfirmAppointments;
        useTemplate = !!meta?.whatsappUseTemplate;
        templateName = typeof meta?.whatsappTemplateName === 'string' ? meta.whatsappTemplateName : undefined;
        templateLanguage = typeof meta?.whatsappTemplateLanguage === 'string' ? meta.whatsappTemplateLanguage : undefined;
        // Optional per-doctor credential overrides
        waOverrideToken = typeof meta?.whatsappAccessToken === 'string' ? meta.whatsappAccessToken : undefined;
        waOverridePhoneId = typeof meta?.whatsappPhoneNumberId === 'string' ? meta.whatsappPhoneNumberId : undefined;
      } catch {}

      const doctorName = `${appointment.doctor.firstName ?? ''} ${appointment.doctor.lastName ?? ''}`.trim();
      const humanDate = new Date(date).toLocaleDateString();
      const summary = `Appointment confirmed with Dr. ${doctorName} on ${humanDate} at ${slot}. Token #${appointment.tokenNumber ?? ''}.`;
      // Email
      if (appointment.patient?.email) {
        this.notifications
          .sendEmail({
            to: appointment.patient.email,
            subject: 'Appointment Confirmation',
            text: summary,
            html: `<p>${summary}</p>`,
          })
          .catch(() => void 0);
      }
      // WhatsApp (only if doctor opted in)
      if (allowWhatsApp && appointment.patient?.phone) {
        // Format phone number as E.164 for WhatsApp (add + prefix if not present)
        // Phone is stored without +, so we add it for E.164 format
        const e164 = appointment.patient.phone.startsWith('+') ? appointment.patient.phone : `+${appointment.patient.phone}`;
        // Prefer template if configured on doctor
        if (useTemplate && templateName && templateLanguage) {
          this.notifications
            .sendWhatsApp({
              toPhoneE164: e164,
              template: {
                name: templateName,
                language: templateLanguage,
              },
              overrideToken: waOverrideToken,
              overridePhoneId: waOverridePhoneId,
            })
            .catch(() => void 0);
        } else {
          this.notifications
            .sendWhatsApp({
              toPhoneE164: e164,
              text: summary,
              overrideToken: waOverrideToken,
              overridePhoneId: waOverridePhoneId,
            })
            .catch(() => void 0);
        }
      }
    }

    return appointment;
  }

  async findAll(query: QueryAppointmentsDto, branchId: string) {
    const {
      doctorId,
      patientId,
      roomId,
      date,
      startDate,
      endDate,
      status,
      visitType,
      search,
      page = 1,
      limit = 20,
      sortBy = 'date',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: any = {
      branchId,
    };

    // Apply filters
    if (doctorId) where.doctorId = doctorId;
    if (patientId) where.patientId = patientId;
    if (roomId) where.roomId = roomId;
    if (status) where.status = status;
    if (visitType) where.visitType = visitType;

    // Date filters
    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
      where.date = {
        gte: startOfDay,
        lte: endOfDay,
      };
    } else if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    // Search filter
    if (search) {
      where.OR = [
        {
          patient: {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        {
          patient: {
            phone: {
              contains: search,
            },
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

    const [appointments, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include: {
          patient: {
            select: { id: true, name: true, phone: true, gender: true },
          },
          doctor: {
            select: { id: true, firstName: true, lastName: true },
          },
          room: {
            select: { id: true, name: true, type: true },
          },
        },
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return {
      appointments,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, branchId: string) {
    const appointment = await this.prisma.appointment.findFirst({
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
          },
        },
        doctor: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        room: {
          select: { id: true, name: true, type: true, capacity: true },
        },
        visit: {
          select: { id: true },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    return appointment;
  }

  async update(id: string, updateAppointmentDto: UpdateAppointmentDto, branchId: string) {
    const appointment = await this.findOne(id, branchId);

    // Validate room if provided
    if (updateAppointmentDto.roomId) {
      const room = await this.prisma.room.findFirst({
        where: { 
          id: updateAppointmentDto.roomId, 
          branchId, 
          isActive: true 
        },
      });
      if (!room) {
        throw new NotFoundException('Room not found or inactive');
      }
    }

    const updatedAppointment = await this.prisma.appointment.update({
      where: { id },
      data: updateAppointmentDto,
      include: {
        patient: {
          select: { id: true, name: true, phone: true },
        },
        doctor: {
          select: { id: true, firstName: true, lastName: true },
        },
        room: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    return updatedAppointment;
  }

  async reschedule(id: string, rescheduleDto: RescheduleAppointmentDto, branchId: string) {
    const appointment = await this.findOne(id, branchId);

    // Check if appointment can be rescheduled
    const canReschedule = SchedulingUtils.canRescheduleAppointment(
      appointment.date,
      appointment.status,
    );

    if (!canReschedule.canReschedule) {
      throw new BadRequestException(canReschedule.reason);
    }

    // Check for new scheduling conflicts
    const conflicts = await this.checkSchedulingConflicts(
      appointment.doctorId,
      (rescheduleDto.roomId ?? appointment.roomId) ?? null,
      rescheduleDto.date,
      rescheduleDto.slot,
      branchId,
      id, // Exclude current appointment from conflict check
    );

    if (conflicts.length > 0) {
      const suggestions = await this.getAlternativeSlots(
        appointment.doctorId,
        (rescheduleDto.roomId ?? appointment.roomId) ?? null,
        rescheduleDto.date,
        rescheduleDto.slot,
        branchId,
      );
      throw new ConflictException({
        message: 'Scheduling conflict detected for new time slot',
        conflicts,
        suggestions,
      });
    }

    // Update appointment with new schedule
    const rescheduledAppointment = await this.prisma.appointment.update({
      where: { id },
      data: {
        date: new Date(rescheduleDto.date),
        slot: rescheduleDto.slot,
        roomId: (rescheduleDto.roomId ?? appointment.roomId) ?? undefined,
        notes: rescheduleDto.notes || appointment.notes,
        status: AppointmentStatus.SCHEDULED, // Reset to scheduled
      },
      include: {
        patient: {
          select: { id: true, name: true, phone: true },
        },
        doctor: {
          select: { id: true, firstName: true, lastName: true },
        },
        room: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    return rescheduledAppointment;
  }

  async bulkUpdate(bulkUpdateDto: BulkUpdateAppointmentsDto, branchId: string) {
    const { appointmentIds, ...updateData } = bulkUpdateDto;

    // Verify all appointments exist and belong to the branch
    const appointments = await this.prisma.appointment.findMany({
      where: {
        id: { in: appointmentIds },
        branchId,
      },
    });

    if (appointments.length !== appointmentIds.length) {
      throw new NotFoundException('One or more appointments not found');
    }

    // Perform bulk update
    const result = await this.prisma.appointment.updateMany({
      where: {
        id: { in: appointmentIds },
        branchId,
      },
      data: updateData,
    });

    return {
      updated: result.count,
      appointmentIds,
    };
  }

  async remove(id: string, branchId: string) {
    const appointment = await this.findOne(id, branchId);

    // Check if appointment can be cancelled
    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel completed appointment');
    }

    if (appointment.status === AppointmentStatus.IN_PROGRESS) {
      throw new BadRequestException('Cannot cancel appointment in progress');
    }

    await this.prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.CANCELLED,
      },
    });

    return { message: 'Appointment cancelled successfully' };
  }

  async getAvailableSlots(query: AvailableSlotsDto, branchId: string) {
    const { doctorId, roomId, date, durationMinutes = 30, startHour, endHour } = query;

    // Validate doctor exists and belongs to branch
    const doctor = await this.prisma.user.findFirst({
      where: { id: doctorId, branchId, role: UserRole.DOCTOR },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor not found in this branch');
    }

    // Get all booked slots for the doctor on the given date
    const bookedAppointments = await this.prisma.appointment.findMany({
      where: {
        doctorId,
        date: {
          gte: new Date(`${date}T00:00:00.000Z`),
          lte: new Date(`${date}T23:59:59.999Z`),
        },
        status: {
          not: AppointmentStatus.CANCELLED,
        },
        branchId,
      },
      select: {
        slot: true,
        status: true,
      },
    });

    // Normalize and guard against any malformed/empty slot values
    const bookedSlots = bookedAppointments
      .map((apt) => apt.slot)
      .filter((s) => typeof s === 'string' && s.length > 0 && SchedulingUtils.isValidTimeSlot(s));

    // If room is specified, also check room availability
    if (roomId) {
      const roomAppointments = await this.prisma.appointment.findMany({
        where: {
          roomId,
          date: {
            gte: new Date(`${date}T00:00:00.000Z`),
            lte: new Date(`${date}T23:59:59.999Z`),
          },
          status: {
            not: AppointmentStatus.CANCELLED,
          },
          branchId,
        },
        select: {
          slot: true,
        },
      });

      const roomBookedSlots = roomAppointments
        .map((apt) => apt.slot)
        .filter((s) => typeof s === 'string' && s.length > 0 && SchedulingUtils.isValidTimeSlot(s));
      bookedSlots.push(...roomBookedSlots);
    }

    // Determine clinic hours (fallback to defaults if not provided or invalid)
    // Attempt to read working hours from doctor.metadata if available
    let doctorStart: number | undefined;
    let doctorEnd: number | undefined;
    try {
      if (doctor?.metadata) {
        const meta = typeof doctor.metadata === 'string' ? JSON.parse(doctor.metadata) : doctor.metadata;
        const hours = meta?.workingHours;
        if (hours && typeof hours === 'object') {
          // Allow per-day override; fallback to generic startHour/endHour if present
          // Resolve weekday in clinic timezone to avoid UTC off-by-one
          const tz = 'Asia/Kolkata';
          const noonUtc = new Date(`${date}T12:00:00.000Z`); // noon UTC mapped to local day deterministically
          const localNoon = new Date(noonUtc.toLocaleString('en-US', { timeZone: tz }));
          const day = localNoon.getDay(); // 0-6 in clinic TZ
          const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][day];
          const byDay = hours?.byDay?.[dayKey];
          const startCandidate = byDay?.startHour ?? hours?.startHour;
          const endCandidate = byDay?.endHour ?? hours?.endHour;
          if (Number.isInteger(startCandidate)) doctorStart = startCandidate;
          if (Number.isInteger(endCandidate)) doctorEnd = endCandidate;
        }
      }
    } catch {}

    const clinicStart = Number.isInteger(startHour) ? (startHour as number) : (Number.isInteger(doctorStart) ? (doctorStart as number) : 9);
    const clinicEnd = Number.isInteger(endHour) ? (endHour as number) : (Number.isInteger(doctorEnd) ? (doctorEnd as number) : 18);
    const normalizedStart = Math.max(0, Math.min(23, clinicStart));
    const normalizedEnd = Math.max(normalizedStart + 1, Math.min(24, clinicEnd));

    // Generate all possible slots for the day
    const allSlots = SchedulingUtils.generateTimeSlots(normalizedStart, normalizedEnd, durationMinutes);

    // Filter out booked slots by overlap, not exact string equality
    let availableSlots = allSlots.filter(slot => bookedSlots.every(b => !SchedulingUtils.doTimeSlotsOverlap(slot, b)));

    // For same-day scheduling, filter out past slots based on local time
    const getLocalDateStr = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${da}`;
    };
    // Align same-day filtering with clinic timezone (Asia/Kolkata)
    const now = new Date();
    const tz = 'Asia/Kolkata';
    const todayTz = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const todayStr = getLocalDateStr(todayTz);
    if (date === todayStr) {
      const nowTz = todayTz;
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      availableSlots = availableSlots.filter((slot) => {
        const parsed = SchedulingUtils.parseTimeSlot(slot);
        const [h, mm] = parsed.start.split(':').map((v) => parseInt(v, 10));
        const startMinutes = h * 60 + mm;
        return startMinutes > nowMinutes;
      });
    }

    return {
      date,
      doctorId,
      roomId,
      availableSlots,
      bookedSlots: [...new Set(bookedSlots)], // Remove duplicates
    };
  }

  async getDoctorSchedule(doctorId: string, date: string, branchId: string) {
    // Validate doctor exists and belongs to branch
    const doctor = await this.prisma.user.findFirst({
      where: { id: doctorId, branchId, role: UserRole.DOCTOR },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor not found in this branch');
    }

    const appointments = await this.prisma.appointment.findMany({
      where: {
        doctorId,
        date: {
          gte: new Date(`${date}T00:00:00.000Z`),
          lte: new Date(`${date}T23:59:59.999Z`),
        },
        // Do not include cancelled appointments in the schedule view
        status: {
          not: AppointmentStatus.CANCELLED,
        },
        branchId,
      },
      include: {
        patient: {
          select: { id: true, name: true, phone: true },
        },
        room: {
          select: { id: true, name: true, type: true },
        },
        visit: {
          select: { id: true },
        },
      },
      orderBy: {
        slot: 'asc',
      },
    });

    return {
      doctorId,
      doctorName: `${doctor.firstName} ${doctor.lastName}`.trim(),
      date,
      appointments,
    };
  }

  async getRoomSchedule(roomId: string, date: string, branchId: string) {
    // Validate room exists and belongs to branch
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, branchId, isActive: true },
    });
    if (!room) {
      throw new NotFoundException('Room not found or inactive');
    }

    const appointments = await this.prisma.appointment.findMany({
      where: {
        roomId,
        date: {
          gte: new Date(`${date}T00:00:00.000Z`),
          lte: new Date(`${date}T23:59:59.999Z`),
        },
        // Do not include cancelled appointments in the schedule view
        status: {
          not: AppointmentStatus.CANCELLED,
        },
        branchId,
      },
      include: {
        patient: {
          select: { id: true, name: true, phone: true },
        },
        doctor: {
          select: { id: true, firstName: true, lastName: true },
        },
        visit: {
          select: { id: true },
        },
      },
      orderBy: {
        slot: 'asc',
      },
    });

    return {
      roomId,
      roomName: room.name,
      roomType: room.type,
      date,
      appointments,
    };
  }

  async getRooms(branchId: string) {
    const rooms = await this.prisma.room.findMany({
      where: {
        branchId,
        isActive: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return {
      rooms,
    };
  }

  async getAllRooms(branchId: string) {
    const rooms = await this.prisma.room.findMany({
      where: {
        branchId,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return {
      rooms,
    };
  }

  async createRoom(roomData: { name: string; type: string; capacity: number; isActive: boolean }, branchId: string) {
    const room = await this.prisma.room.create({
      data: {
        ...roomData,
        branchId,
      },
    });

    return room;
  }

  async updateRoom(roomId: string, roomData: { name: string; type: string; capacity: number; isActive: boolean }, branchId: string) {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, branchId },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const updatedRoom = await this.prisma.room.update({
      where: { id: roomId },
      data: roomData,
    });

    return updatedRoom;
  }

  async deleteRoom(roomId: string, branchId: string) {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, branchId },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Check if room has any appointments
    const appointmentCount = await this.prisma.appointment.count({
      where: { roomId },
    });

    if (appointmentCount > 0) {
      throw new BadRequestException('Cannot delete room with existing appointments');
    }

    await this.prisma.room.delete({
      where: { id: roomId },
    });

    return { message: 'Room deleted successfully' };
  }

  // Private helper methods
  private validateAppointmentInputs(dto: CreateAppointmentDto): void {
    if (!SchedulingUtils.isValidTimeSlot(dto.slot)) {
      throw new BadRequestException('Invalid time slot format. Use HH:MM-HH:MM');
    }

    // Compare appointment slot start time against current time to allow same-day future bookings
    const timeSlot = SchedulingUtils.parseTimeSlot(dto.slot);
    const appointmentStart = new Date(`${dto.date}T${timeSlot.start}:00.000Z`);
    const now = new Date();

    if (appointmentStart < now) {
      throw new BadRequestException('Cannot schedule appointment in the past');
    }

    // Do not hard-restrict to 9-18; validation of hours is handled by available-slots logic and conflict checks
  }

  private async checkSchedulingConflicts(
    doctorId: string,
    roomId: string | null,
    date: string,
    slot: string,
    branchId: string,
    excludeAppointmentId?: string,
  ): Promise<SchedulingConflict[]> {
    const conflicts: SchedulingConflict[] = [];

    const whereClause: any = {
      branchId,
      date: {
        gte: new Date(`${date}T00:00:00.000Z`),
        lte: new Date(`${date}T23:59:59.999Z`),
      },
      status: {
        not: AppointmentStatus.CANCELLED,
      },
    };

    if (excludeAppointmentId) {
      whereClause.id = { not: excludeAppointmentId };
    }

    // Check doctor conflicts
    const doctorAppointments = await this.prisma.appointment.findMany({
      where: {
        ...whereClause,
        doctorId,
      },
      include: {
        patient: {
          select: { name: true },
        },
      },
    });

    for (const appointment of doctorAppointments) {
      if (SchedulingUtils.doTimeSlotsOverlap(slot, appointment.slot)) {
        conflicts.push({
          type: 'doctor',
          message: `Doctor is already booked during this time`,
          conflictingAppointment: {
            id: appointment.id,
            patientName: appointment.patient.name,
            slot: appointment.slot,
          },
        });
      }
    }

    // Check room conflicts if room is specified
    if (roomId) {
      const roomAppointments = await this.prisma.appointment.findMany({
        where: {
          ...whereClause,
          roomId,
        },
        include: {
          patient: {
            select: { name: true },
          },
        },
      });

      for (const appointment of roomAppointments) {
        if (SchedulingUtils.doTimeSlotsOverlap(slot, appointment.slot)) {
          conflicts.push({
            type: 'room',
            message: `Room is already booked during this time`,
            conflictingAppointment: {
              id: appointment.id,
              patientName: appointment.patient.name,
              slot: appointment.slot,
            },
          });
        }
      }
    }

    return conflicts;
  }

  private async getAlternativeSlots(
    doctorId: string,
    roomId: string | null,
    date: string,
    requestedSlot: string,
    branchId: string,
  ): Promise<string[]> {
    const bookedSlots = await this.getBookedSlots(doctorId, roomId, date, branchId);
    return SchedulingUtils.suggestAlternativeSlots(requestedSlot, bookedSlots, 3);
  }

  private async getBookedSlots(
    doctorId: string,
    roomId: string | null,
    date: string,
    branchId: string,
  ): Promise<string[]> {
    const whereClause: any = {
      branchId,
      date: {
        gte: new Date(`${date}T00:00:00.000Z`),
        lte: new Date(`${date}T23:59:59.999Z`),
      },
      status: {
        not: AppointmentStatus.CANCELLED,
      },
      OR: [{ doctorId }],
    };

    if (roomId) {
      whereClause.OR.push({ roomId });
    }

    const appointments = await this.prisma.appointment.findMany({
      where: whereClause,
      select: { slot: true },
    });

    return [...new Set(appointments.map(apt => apt.slot))];
  }

  private async generateTokenNumber(date: string, branchId: string): Promise<number> {
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const lastAppointment = await this.prisma.appointment.findFirst({
      where: {
        branchId,
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: {
        tokenNumber: 'desc',
      },
    });

    return (lastAppointment?.tokenNumber || 0) + 1;
  }
}
