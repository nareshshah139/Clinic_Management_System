import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

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
      ...(gender ? { gender } : {}),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { abhaId: { contains: search } },
        ],
      }),
    };

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
    return this.prisma.patient.findUnique({
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
      },
    });
  }
}
