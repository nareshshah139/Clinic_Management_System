import { displayCalendarDate } from '../../common/date-display';
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  CreateAppointmentDto,
  RescheduleAppointmentDto,
} from './dto/create-appointment.dto';
import {
  UpdateAppointmentDto,
  BulkUpdateAppointmentsDto,
} from './dto/update-appointment.dto';
import {
  QueryAppointmentsDto,
  AvailableSlotsDto,
} from './dto/query-appointment.dto';
import { SchedulingUtils, SchedulingConflict } from './utils/scheduling.utils';
import { AppointmentStatus, Prisma, VisitType, UserRole } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsAppTemplatesService } from '../whatsapp-templates/whatsapp-templates.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import {
  BlockedInterval,
  MinuteInterval,
  istClock,
  istDayEnd,
  istDayStart,
  minutesToHhmm,
  overlaps,
  slotToMinutes,
  timeOffOverlappingSlot,
} from '../doctor-availability/availability';
import {
  loadDayAvailability,
  loadTimeOff,
} from '../doctor-availability/availability.queries';

type WhatsAppTemplateComponent = {
  type: 'body';
  parameters: { type: 'text'; text: string }[];
};

/**
 * @cc [owner:nareshshah139,label:product] appointment-active-visit-link
 * Appointment detail and schedule reads MUST expose only undeleted visit links.
 * A deleted encounter MUST NOT produce a Continue Visit target.
 */
@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    @Optional()
    private notifications?: NotificationsService,
    @Optional()
    private whatsappTemplates?: WhatsAppTemplatesService,
    @Optional()
    private googleCalendar?: GoogleCalendarService,
  ) {}

  async create(
    createAppointmentDto: CreateAppointmentDto,
    branchId: string,
    callerUserId?: string,
  ) {
    const {
      patientId,
      doctorId,
      roomId,
      date,
      slot,
      visitType,
      notes,
      source,
    } = createAppointmentDto;

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

    await this.assertNoTimeOff(doctorId, date, slot, branchId);

    // Validate room if provided
    if (roomId) {
      const room = await this.prisma.room.findFirst({
        where: { id: roomId, branchId, isActive: true },
      });
      if (!room) {
        throw new NotFoundException('Room not found or inactive');
      }
    }

    const appointment = await this.withTokenRetry(() => this.prisma.$transaction(async (tx) => {
      await this.lockSchedule(tx, branchId, doctorId, roomId ?? null, date);
      await this.assertSlotFree(tx, 'Scheduling conflict detected', doctorId, roomId ?? null, date, slot, branchId);
      const tokenNumber = await this.nextDoctorToken(tx, branchId, doctorId, date);

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
    }));

    // Fire-and-forget notifications (if configured and doctor has enabled)
    if (this.notifications) {
      // Check if the doctor has enabled auto WhatsApp confirmations
      const doctorSettings = await this.prisma.user.findUnique({
        where: { id: doctorId },
        select: { metadata: true, role: true },
      });
      const branch = await this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { name: true, phone: true },
      });
      let allowWhatsApp = false;
      let useTemplate = false;
      let templateName: string | undefined;
      let templateLanguage: string | undefined;
      let waOverrideToken: string | undefined;
      let waOverridePhoneId: string | undefined;
      const meta = this.parseMetadataRecord(doctorSettings?.metadata);
      allowWhatsApp = !!meta?.whatsappAutoConfirmAppointments;
      useTemplate = !!meta?.whatsappUseTemplate;
      templateName =
        typeof meta?.whatsappTemplateName === 'string'
          ? meta.whatsappTemplateName
          : undefined;
      templateLanguage =
        typeof meta?.whatsappTemplateLanguage === 'string'
          ? meta.whatsappTemplateLanguage
          : undefined;
      // Optional per-doctor credential overrides
      waOverrideToken =
        typeof meta?.whatsappAccessToken === 'string'
          ? meta.whatsappAccessToken
          : undefined;
      waOverridePhoneId =
        typeof meta?.whatsappPhoneNumberId === 'string'
          ? meta.whatsappPhoneNumberId
          : undefined;

      const doctorName =
        `${appointment.doctor.firstName ?? ''} ${appointment.doctor.lastName ?? ''}`.trim();
      const humanDate = displayCalendarDate(date);
      const humanTime = slot;
      const summary = this.buildAppointmentSummary({
        doctorName,
        date: humanDate,
        time: humanTime,
        tokenNumber: appointment.tokenNumber ?? undefined,
      });
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
        const e164 = appointment.patient.phone.startsWith('+')
          ? appointment.patient.phone
          : `+${appointment.patient.phone}`;
        const touchpoint = 'appointment_confirmation';
        const template =
          useTemplate && this.whatsappTemplates
            ? await this.whatsappTemplates.resolveActiveTemplate({
                branchId,
                touchpoint,
                language: templateLanguage,
                ownerId: doctorId,
                name: templateName,
              })
            : null;
        const templateComponents =
          template && template.variables
            ? this.buildAppointmentTemplateComponents(template.variables, {
                patientName: appointment.patient?.name ?? '',
                patientPhone: appointment.patient?.phone ?? undefined,
                doctorName,
                appointmentDate: humanDate,
                appointmentTime: humanTime,
                visitType: appointment.visitType,
                tokenNumber: appointment.tokenNumber ?? undefined,
                clinicName: branch?.name || process.env.CLINIC_NAME || '',
                whatsappHelpNumber:
                  branch?.phone || process.env.WHATSAPP_HELP_NUMBER || '',
              })
            : undefined;
        const whatsappPayload =
          template && template.name
            ? {
                template: {
                  name: template.name,
                  language: template.language || templateLanguage || 'en',
                  components: templateComponents,
                },
              }
            : { text: template?.contentText || summary };

        this.notifications
          .sendWhatsApp({
            toPhoneE164: e164,
            overrideToken: waOverrideToken,
            overridePhoneId: waOverridePhoneId,
            ...whatsappPayload,
          })
          .catch(() => void 0);
      }
    }

    // Google Calendar sync (fire-and-forget; non-blocking)
    void this.googleCalendar
      ?.syncAppointmentEvent(appointment.id, callerUserId)
      .catch(() => void 0);

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
            patientCode: true,
            name: true,
            phone: true,
            email: true,
            gender: true,
            dob: true,
            age: true,
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
          where: { deletedAt: null },
          select: { id: true, status: true },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    return appointment;
  }

  /**
   * @cc [owner:nareshshah139,label:reliability] appointment-edit-conflicts
   * Room changes and reactivation MUST check doctor and room conflicts under schedule locks.
   * Concurrent changes to the appointment MUST fail rather than apply to stale scheduling details.
   */
  async update(
    id: string,
    updateAppointmentDto: UpdateAppointmentDto,
    branchId: string,
    callerUserId?: string,
  ) {
    const appointment = await this.findOne(id, branchId);

    // Validate room if provided
    if (updateAppointmentDto.roomId) {
      const room = await this.prisma.room.findFirst({
        where: {
          id: updateAppointmentDto.roomId,
          branchId,
          isActive: true,
        },
      });
      if (!room) {
        throw new NotFoundException('Room not found or inactive');
      }
    }

    const include = {
      patient: { select: { id: true, name: true, phone: true } },
      doctor: { select: { id: true, firstName: true, lastName: true } },
      room: { select: { id: true, name: true, type: true } },
    } as const;
    const affectsSchedule = updateAppointmentDto.roomId !== undefined || updateAppointmentDto.status !== undefined;
    const updatedAppointment = affectsSchedule
      ? await this.prisma.$transaction(async (tx) => {
          const date = appointment.date.toISOString().slice(0, 10);
          const roomId = updateAppointmentDto.roomId === undefined ? appointment.roomId : updateAppointmentDto.roomId;
          await this.lockSchedule(tx, branchId, appointment.doctorId, roomId, date);
          const current = await tx.appointment.findFirst({ where: { id, branchId } });
          if (!current || current.doctorId !== appointment.doctorId ||
              current.date.getTime() !== appointment.date.getTime() || current.slot !== appointment.slot ||
              current.roomId !== appointment.roomId || current.status !== appointment.status) {
            throw new ConflictException('Appointment changed; refresh and try again');
          }
          const status = updateAppointmentDto.status ?? current.status;
          if (status !== AppointmentStatus.CANCELLED &&
              (roomId !== current.roomId || current.status === AppointmentStatus.CANCELLED)) {
            await this.assertSlotFree(tx, 'Scheduling conflict detected', current.doctorId, roomId, date, current.slot, branchId, id);
          }
          const changed = await tx.appointment.updateMany({
            where: { id, branchId, doctorId: current.doctorId, date: current.date, slot: current.slot, roomId: current.roomId, status: current.status },
            data: updateAppointmentDto,
          });
          if (changed.count !== 1) throw new ConflictException('Appointment changed; refresh and try again');
          return tx.appointment.findUniqueOrThrow({ where: { id }, include });
        })
      : await this.prisma.appointment.update({ where: { id }, data: updateAppointmentDto, include });

    void this.googleCalendar
      ?.syncAppointmentEvent(updatedAppointment.id, callerUserId)
      .catch(() => void 0);

    return updatedAppointment;
  }

  async reschedule(
    id: string,
    rescheduleDto: RescheduleAppointmentDto,
    branchId: string,
    callerUserId?: string,
  ) {
    const appointment = await this.findOne(id, branchId);

    // Check if appointment can be rescheduled
    const canReschedule = SchedulingUtils.canRescheduleAppointment(
      appointment.date,
      appointment.status,
    );

    if (!canReschedule.canReschedule) {
      throw new BadRequestException(canReschedule.reason);
    }

    await this.assertNoTimeOff(
      appointment.doctorId,
      rescheduleDto.date,
      rescheduleDto.slot,
      branchId,
    );

    // A new day means a place in that day's queue for this doctor.
    const sameDay = appointment.date.toISOString().slice(0, 10) === rescheduleDto.date.slice(0, 10);
    const newRoomId = rescheduleDto.roomId ?? appointment.roomId ?? null;
    const rescheduledAppointment = await this.withTokenRetry(() => this.prisma.$transaction(async (tx) => {
      await this.lockSchedule(tx, branchId, appointment.doctorId, newRoomId, rescheduleDto.date);
      await this.assertSlotFree(tx, 'Scheduling conflict detected for new time slot', appointment.doctorId, newRoomId, rescheduleDto.date, rescheduleDto.slot, branchId, id);
      return tx.appointment.update({
      where: { id },
      data: {
        ...(sameDay ? {} : { tokenNumber: await this.nextDoctorToken(tx, branchId, appointment.doctorId, rescheduleDto.date) }),
        date: new Date(rescheduleDto.date),
        slot: rescheduleDto.slot,
        roomId: rescheduleDto.roomId ?? appointment.roomId ?? undefined,
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
    }));

    // Update linked Google Calendar event (non-blocking)
    void this.googleCalendar
      ?.syncAppointmentEvent(rescheduledAppointment.id, callerUserId)
      .catch(() => void 0);

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

  async remove(id: string, branchId: string, callerUserId?: string) {
    const appointment = await this.findOne(id, branchId);

    // Check if appointment can be cancelled
    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel completed appointment');
    }

    if (appointment.status === AppointmentStatus.IN_PROGRESS) {
      throw new BadRequestException('Cannot cancel appointment in progress');
    }

    // Check if already cancelled
    if (appointment.status === AppointmentStatus.CANCELLED) {
      return { message: 'Appointment is already cancelled' };
    }

    await this.prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.CANCELLED,
      },
    });

    // Remove Google Calendar event if one exists
    void this.googleCalendar
      ?.deleteAppointmentEvent(id, callerUserId)
      .catch(() => void 0);

    return { message: 'Appointment cancelled successfully' };
  }

  async getAvailableSlots(query: AvailableSlotsDto, branchId: string) {
    const {
      doctorId,
      roomId,
      date,
      durationMinutes = 30,
      startHour,
      endHour,
    } = query;

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
      .filter(
        (s) =>
          typeof s === 'string' &&
          s.length > 0 &&
          SchedulingUtils.isValidTimeSlot(s),
      );

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
        .filter(
          (s) =>
            typeof s === 'string' &&
            s.length > 0 &&
            SchedulingUtils.isValidTimeSlot(s),
        );
      bookedSlots.push(...roomBookedSlots);
    }

    const day = await loadDayAvailability(this.prisma, branchId, doctor, date);
    const hasOverride =
      Number.isInteger(startHour) || Number.isInteger(endHour);
    const workingIntervals = hasOverride
      ? [this.overrideInterval(day.working, startHour, endHour)]
      : day.working;

    const allSlots = workingIntervals.flatMap((interval) =>
      this.slotsWithin(interval, durationMinutes),
    );

    const now = istClock(new Date());
    const availableSlots = allSlots.filter((slot) => {
      const range = slotToMinutes(slot);
      return (
        bookedSlots.every((b) => !SchedulingUtils.doTimeSlotsOverlap(slot, b)) &&
        day.blocked.every((b) => !overlaps(b, range)) &&
        (date !== now.date || range.start > now.minutes)
      );
    });

    return {
      date,
      doctorId,
      roomId,
      availableSlots,
      bookedSlots: [...new Set(bookedSlots)], // Remove duplicates
      hoursSource: day.source,
      workingIntervals,
      timeOff: day.blocked,
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
          where: { deletedAt: null },
          select: { id: true, status: true },
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
          where: { deletedAt: null },
          select: { id: true, status: true },
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

  async createRoom(
    roomData: {
      name: string;
      type: string;
      capacity: number;
      isActive: boolean;
    },
    branchId: string,
  ) {
    const room = await this.prisma.room.create({
      data: {
        ...roomData,
        branchId,
      },
    });

    return room;
  }

  async updateRoom(
    roomId: string,
    roomData: {
      name: string;
      type: string;
      capacity: number;
      isActive: boolean;
    },
    branchId: string,
  ) {
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
      throw new BadRequestException(
        'Cannot delete room with existing appointments',
      );
    }

    await this.prisma.room.delete({
      where: { id: roomId },
    });

    return { message: 'Room deleted successfully' };
  }

  private buildAppointmentSummary(input: {
    doctorName: string;
    date: string;
    time: string;
    tokenNumber?: number;
  }) {
    const tokenText = input.tokenNumber ? ` Token #${input.tokenNumber}.` : '';
    return `Appointment confirmed with Dr. ${input.doctorName} on ${input.date} at ${input.time}.${tokenText}`;
  }

  private buildAppointmentTemplateComponents(
    variables: string[] | undefined,
    data: {
      patientName: string;
      patientPhone?: string;
      doctorName: string;
      appointmentDate: string;
      appointmentTime: string;
      visitType: VisitType;
      tokenNumber?: number;
      clinicName?: string;
      whatsappHelpNumber?: string;
    },
  ): WhatsAppTemplateComponent[] | undefined {
    if (!variables || variables.length === 0) return undefined;
    const parameters = variables.map((variable) => ({
      type: 'text' as const,
      text: this.resolveTemplateVariable(variable, data),
    }));
    return [{ type: 'body', parameters }];
  }

  private resolveTemplateVariable(
    key: string,
    data: {
      patientName: string;
      patientPhone?: string;
      doctorName: string;
      appointmentDate: string;
      appointmentTime: string;
      visitType: VisitType;
      tokenNumber?: number;
      clinicName?: string;
      whatsappHelpNumber?: string;
    },
  ) {
    switch (key) {
      case 'patient_name':
        return data.patientName || 'Patient';
      case 'patient_phone':
        return data.patientPhone || '';
      case 'doctor_name':
        return data.doctorName || 'Doctor';
      case 'appointment_date':
        return data.appointmentDate;
      case 'appointment_time':
        return data.appointmentTime;
      case 'appointment_mode':
        return data.visitType || 'OPD';
      case 'queue_token':
        return data.tokenNumber ? String(data.tokenNumber) : '-';
      case 'clinic_name':
        return data.clinicName || '';
      case 'whatsapp_help_number':
        return data.whatsappHelpNumber || '';
      default:
        return '';
    }
  }

  private parseMetadataRecord(value: unknown): Record<string, any> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, any>;
    }

    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, any>;
        }
      } catch {}
    }

    return {};
  }

  /**
   * @cc [owner:nareshshah139,label:product] time-off-blocks-booking
   * Creating or rescheduling an appointment MUST fail with 409 when the slot overlaps the
   * doctor's leave or blocked time, or a branch-wide holiday. Booking outside working
   * hours stays allowed; the UI only warns.
   */
  private async assertNoTimeOff(
    doctorId: string,
    date: string,
    slot: string,
    branchId: string,
  ) {
    const timeOff = await loadTimeOff(
      this.prisma,
      branchId,
      doctorId,
      istDayStart(date),
      istDayEnd(date),
    );
    const hit = timeOffOverlappingSlot(date, slot, timeOff);
    if (!hit) return;
    const message = describeTimeOff(hit);
    throw new ConflictException({
      message,
      conflicts: [{ type: 'time_off', message, timeOff: hit }],
      suggestions: [],
    });
  }

  /** Explicit startHour/endHour query params replace the doctor's hours with one window. */
  private overrideInterval(
    working: MinuteInterval[],
    startHour?: number,
    endHour?: number,
  ): MinuteInterval {
    const doctorStart = working.length
      ? Math.floor(working[0].start / 60)
      : 9;
    const doctorEnd = working.length
      ? Math.ceil(working[working.length - 1].end / 60)
      : 18;
    const start = Math.max(0, Math.min(23, startHour ?? doctorStart));
    const end = Math.max(start + 1, Math.min(24, endHour ?? doctorEnd));
    return { start: start * 60, end: end * 60 };
  }

  private slotsWithin(interval: MinuteInterval, duration: number): string[] {
    const slots: string[] = [];
    for (let m = interval.start; m < interval.end; m += duration) {
      slots.push(`${minutesToHhmm(m)}-${minutesToHhmm(m + duration)}`);
    }
    return slots;
  }

  // Private helper methods
  private validateAppointmentInputs(dto: CreateAppointmentDto): void {
    if (!SchedulingUtils.isValidTimeSlot(dto.slot)) {
      throw new BadRequestException(
        'Invalid time slot format. Use HH:MM-HH:MM',
      );
    }

    // Slots are IST wall-clock times on the clinic day.
    const appointmentStart = new Date(istDayStart(dto.date).getTime() + slotToMinutes(dto.slot).start * 60_000);
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
    db: Prisma.TransactionClient = this.prisma,
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
    const doctorAppointments = await db.appointment.findMany({
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
      const roomAppointments = await db.appointment.findMany({
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
    const bookedSlots = await this.getBookedSlots(
      doctorId,
      roomId,
      date,
      branchId,
    );
    return SchedulingUtils.suggestAlternativeSlots(
      requestedSlot,
      bookedSlots,
      3,
    );
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

    return [...new Set(appointments.map((apt) => apt.slot))];
  }

  /**
   * @cc [owner:nareshshah139,label:product] doctor-token-queue
   * Token numbers MUST count each doctor's own queue for the day in a branch, starting at 1,
   * so a patient's token reflects only that doctor's patients. Two appointments for the same
   * doctor and day MUST NOT share a token, including under concurrent booking; the database
   * unique index enforces it and booking retries on a collision.
   */
  /**
   * @cc [owner:nareshshah139,label:product] no-concurrent-double-booking
   * Booking, rescheduling, and scheduling edits MUST check doctor and room conflicts inside the write transaction
   * while holding the doctor-day lock (and the room-day lock when a room is set), so two
   * concurrent requests can never both take overlapping slots. Locks are taken doctor first,
   * then room, so lock order is fixed.
   */
  private async lockSchedule(tx: Prisma.TransactionClient, branchId: string, doctorId: string, roomId: string | null, date: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appointment-token:${branchId}:${doctorId}:${date}`}))`;
    if (roomId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appointment-room:${branchId}:${roomId}:${date}`}))`;
  }

  private async assertSlotFree(
    tx: Prisma.TransactionClient, message: string, doctorId: string, roomId: string | null,
    date: string, slot: string, branchId: string, excludeAppointmentId?: string,
  ) {
    const conflicts = await this.checkSchedulingConflicts(doctorId, roomId, date, slot, branchId, excludeAppointmentId, tx);
    if (conflicts.length === 0) return;
    const suggestions = await this.getAlternativeSlots(doctorId, roomId, date, slot, branchId);
    throw new ConflictException({ message, conflicts, suggestions });
  }

  /** Callers hold the doctor-day lock from lockSchedule. */
  private async nextDoctorToken(tx: Prisma.TransactionClient, branchId: string, doctorId: string, date: string): Promise<number> {
    const last = await tx.appointment.findFirst({
      where: {
        branchId,
        doctorId,
        date: { gte: new Date(`${date}T00:00:00.000Z`), lte: new Date(`${date}T23:59:59.999Z`) },
      },
      orderBy: { tokenNumber: 'desc' },
      select: { tokenNumber: true },
    });
    return (last?.tokenNumber ?? 0) + 1;
  }

  private async withTokenRetry<T>(write: () => Promise<T>, attempts = 5): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await write();
      } catch (error) {
        const target = (error as Prisma.PrismaClientKnownRequestError)?.meta?.target;
        const tokenCollision = (error as { code?: string })?.code === 'P2002'
          && (Array.isArray(target) ? target.includes('tokenNumber') : String(target ?? '').includes('token'));
        if (!tokenCollision || attempt >= attempts) throw error;
      }
    }
  }

}

function describeTimeOff(block: BlockedInterval): string {
  const reason = block.reason ? ` (${block.reason})` : '';
  switch (block.kind) {
    case 'LEAVE':
      return `Doctor is on leave at this time${reason}`;
    case 'HOLIDAY':
      return `The clinic is closed for a holiday at this time${reason}`;
    case 'BLOCKED':
      return `Doctor's time is blocked off at this time${reason}`;
  }
}
