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

/**
 * @cc [owner:nareshshah139,label:security] clinic-investigation-branch-isolation
 * A branch MUST list, rename and delete only its own investigations. An id from another branch
 * MUST get 404 and stay unchanged. Two branches MAY hold the same name independently.
 */
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

  /**
   * @cc [owner:nareshshah139,label:integrity] clinic-investigation-create-once
   * Creating a name whose normalized form already exists in the branch MUST return the existing
   * row with its original spelling and MUST NOT add a second one, including when equal requests
   * arrive at the same time.
   */
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

  /**
   * @cc [owner:nareshshah139,label:integrity] clinic-investigation-rename-unique
   * Renaming MUST store the new spelling, normalized the same way as on create, and MUST return
   * 409 and change nothing when another investigation of the branch already has that normalized
   * name. Changing only the case or spacing of a row's own name MUST succeed.
   */
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
