import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { LinkPatientUserDto } from './dto/link-patient-user.dto';
import { UsersService } from '../users/users.service';
import { UserRole } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService, private usersService: UsersService, private notifications: NotificationsService) {}

  async create(createPatientDto: CreatePatientDto, branchId: string) {
    return this.prisma.patient.create({
      data: {
        ...createPatientDto,
        branchId,
        dob: new Date(createPatientDto.dob),
      },
    });
  }

  async findAll(
    options: { page: number; limit: number; search?: string; gender?: string },
    branchId: string,
  ) {
    const { page, limit, search, gender } = options;
    const skip = (page - 1) * limit;

    // Optimize search by requiring minimum 2 characters and using more efficient queries
    const searchTerm = search && search.trim().length >= 2 ? search.trim() : undefined;

    const where = {
      branchId,
      ...(gender ? { gender: { equals: gender, mode: 'insensitive' as const } } : {}),
      ...(searchTerm && {
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { phone: { startsWith: searchTerm } }, // More efficient for phone searches
          { abhaId: { contains: searchTerm } },
          { email: { contains: searchTerm, mode: 'insensitive' } },
        ],
      }),
    } as any;

    const [patients, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          abhaId: true,
          name: true,
          gender: true,
          dob: true,
          phone: true,
          email: true,
          address: true,
          emergencyContact: true,
          city: true,
          state: true,
          referralSource: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.patient.count({ where }),
    ]);

    return {
      data: patients,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, branchId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, branchId },
      include: {
        appointments: {
          orderBy: { date: 'desc' },
          take: 5,
        },
        visits: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        portalUser: true,
      },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async getNextAppointment(patientId: string, branchId: string) {
    const now = new Date();
    const appt = await this.prisma.appointment.findFirst({
      where: {
        patientId,
        branchId,
        date: { gte: now },
        status: { in: ['SCHEDULED', 'CONFIRMED'] as any },
      },
      orderBy: { date: 'asc' },
      include: {
        doctor: { select: { firstName: true, lastName: true } },
        room: { select: { name: true } },
      },
    });
    return appt;
  }

  async sendAppointmentReminder(patientId: string, branchId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, branchId } });
    if (!patient) throw new NotFoundException('Patient not found');

    const appt = await this.getNextAppointment(patientId, branchId);
    if (!appt) throw new NotFoundException('No upcoming appointment found');

    if (!patient.phone) throw new BadRequestException('Patient has no phone number');

    const doctorName = `Dr. ${[appt.doctor?.firstName || '', appt.doctor?.lastName || ''].join(' ').trim()}`.trim();
    const humanDate = new Date(appt.date).toLocaleDateString('en-IN');
    const summaryLines = [
      `Hello ${patient.name},`,
      '',
      `Reminder: Appointment with ${doctorName} on ${humanDate} at ${appt.slot}.`,
    ];
    if (typeof appt.tokenNumber === 'number') summaryLines.push(`Token: #${appt.tokenNumber}`);
    if (appt.room?.name) summaryLines.push(`Room: ${appt.room.name}`);
    summaryLines.push('', 'Please arrive 10 minutes early.');
    const text = summaryLines.join('\n');

    const e164 = patient.phone.startsWith('+') ? patient.phone : `+91${patient.phone}`;
    await this.notifications.sendWhatsApp({ toPhoneE164: e164, text });

    return { success: true };
  }

  async update(id: string, updatePatientDto: UpdatePatientDto, branchId: string) {
    // Ensure patient exists in this branch
    await this.findOne(id, branchId);

    const { dob, ...rest } = updatePatientDto as any;
    return this.prisma.patient.update({
      where: { id },
      data: {
        ...rest,
        ...(dob ? { dob: new Date(dob as any) } : {}),
      },
    });
  }

  async linkUser(patientId: string, dto: LinkPatientUserDto, branchId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, branchId } });
    if (!patient) throw new NotFoundException('Patient not found');

    if (patient.portalUserId) {
      throw new ConflictException('Patient is already linked to a user');
    }

    let userIdToLink: string | undefined = dto.userId;

    if (!userIdToLink) {
      // Validate minimal fields for creating a patient portal user
      if (!dto.email || !dto.password || !dto.firstName || !dto.lastName) {
        throw new BadRequestException('email, password, firstName, and lastName are required to create a new user');
      }

      // Create a new PATIENT user via UsersService to reuse hashing/validations
      const created = await this.usersService.createUser(
        {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          password: dto.password,
          phone: dto.phone,
          role: UserRole.PATIENT,
          branchId,
        } as any,
        branchId,
      );
      userIdToLink = created.id;
    } else {
      // Ensure the existing user is valid and of PATIENT role
      const existing = await this.prisma.user.findFirst({ where: { id: userIdToLink, branchId } });
      if (!existing) throw new NotFoundException('User not found in this branch');
      if (existing.role !== UserRole.PATIENT) {
        throw new BadRequestException('User must have PATIENT role to be linked');
      }

      // Ensure not already linked to another patient
      const alreadyLinked = await this.prisma.patient.findFirst({ where: { portalUserId: userIdToLink } });
      if (alreadyLinked) throw new ConflictException('This user is already linked to another patient');
    }

    const updated = await this.prisma.patient.update({
      where: { id: patientId },
      data: { portalUserId: userIdToLink },
      include: { portalUser: true },
    });

    return updated;
  }

  async unlinkUser(patientId: string, branchId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, branchId } });
    if (!patient) throw new NotFoundException('Patient not found');

    return this.prisma.patient.update({
      where: { id: patientId },
      data: { portalUserId: null },
      include: { portalUser: true },
    });
  }

  async getPortalUser(patientId: string, branchId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, branchId },
      include: { portalUser: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient.portalUser;
  }
}
