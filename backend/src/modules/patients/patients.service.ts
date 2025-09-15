import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { LinkPatientUserDto } from './dto/link-patient-user.dto';
import { UsersService } from '../users/users.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService, private usersService: UsersService) {}

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

    const where = {
      branchId,
      ...(gender ? { gender: { contains: gender, mode: 'insensitive' as const } } : {}),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { abhaId: { contains: search } },
        ],
      }),
    } as any;

    const [patients, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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

  async findOne(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
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

  async update(id: string, updatePatientDto: UpdatePatientDto) {
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
