import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { normalizeInvestigationName } from './investigation-name';

export interface Actor {
  id: string;
  branchId: string;
  role: string;
}

const select = { id: true, name: true } as const;

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

@Injectable()
export class ClinicInvestigationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(branchId: string) {
    return this.prisma.clinicInvestigation.findMany({
      where: { branchId },
      select,
      orderBy: { normalizedName: 'asc' },
    });
  }

  async create(rawName: string, actor: Actor) {
    const { name, normalizedName } = normalizeInvestigationName(rawName);
    const existing = () =>
      this.prisma.clinicInvestigation.findUnique({
        where: {
          branchId_normalizedName: { branchId: actor.branchId, normalizedName },
        },
        select,
      });
    const found = await existing();
    if (found) return found;
    try {
      return await this.prisma.clinicInvestigation.create({
        data: {
          branchId: actor.branchId,
          name,
          normalizedName,
          createdById: actor.id,
        },
        select,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await existing();
      if (!raced) throw error;
      return raced;
    }
  }

  async rename(id: string, rawName: string, branchId: string) {
    await this.findOwned(id, branchId);
    const { name, normalizedName } = normalizeInvestigationName(rawName);
    try {
      return await this.prisma.clinicInvestigation.update({
        where: { id },
        data: { name, normalizedName },
        select,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'An investigation with that name already exists',
        );
      }
      throw error;
    }
  }

  async remove(id: string, branchId: string) {
    await this.findOwned(id, branchId);
    await this.prisma.clinicInvestigation.delete({ where: { id } });
    return { id };
  }

  private async findOwned(id: string, branchId: string) {
    const row = await this.prisma.clinicInvestigation.findFirst({
      where: { id, branchId },
      select,
    });
    if (!row) throw new NotFoundException('Investigation not found');
    return row;
  }
}
