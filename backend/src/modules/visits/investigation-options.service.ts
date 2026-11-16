import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';

const projection = { id: true, name: true, version: true } as const;

/**
 * @cc [owner:nareshshah139,label:product] investigation-name-identity
 * Names differing only in Unicode compatibility, whitespace or case MUST share
 * an identity. Empty, non-text and names longer than 160 characters MUST fail.
 */
export function investigationName(value: unknown): { name: string; normalizedName: string } {
  if (typeof value !== 'string') throw new BadRequestException('Enter an investigation name.');
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 160) throw new BadRequestException('Use an investigation name between 1 and 160 characters.');
  return { name, normalizedName: name.toLowerCase() };
}

function revision(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new BadRequestException('Refresh the investigation list before editing.');
  return value;
}

/**
 * @cc [owner:nareshshah139,label:security] investigation-branch-isolation
 * Catalog reads and writes MUST be restricted to the authenticated branch.
 * Catalog changes MUST NOT modify investigation strings already saved in visits.
 */
@Injectable()
export class InvestigationOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  list(branchId: string) {
    return this.prisma.investigationOption.findMany({
      where: { branchId, archivedAt: null }, select: projection, orderBy: { name: 'asc' },
    });
  }

  /**
   * @cc [owner:nareshshah139,label:product] investigation-add-idempotency
   * Adding an existing active normalized name MUST return its existing identity
   * and version. Explicitly adding an archived name restores that identity with
   * a new version. Concurrent adds MUST NOT create duplicate options.
   */
  async create(branchId: string, value: unknown) {
    const data = investigationName(value);
    for (let attempt = 0; attempt < 4; attempt++) {
      const existing = await this.prisma.investigationOption.findUnique({
        where: { branchId_normalizedName: { branchId, normalizedName: data.normalizedName } },
      });
      if (existing && !existing.archivedAt) return { id: existing.id, name: existing.name, version: existing.version };
      try {
        if (existing) {
          return await this.prisma.investigationOption.update({
            where: { id: existing.id, branchId, version: existing.version, archivedAt: { not: null } },
            data: { name: data.name, archivedAt: null, version: { increment: 1 } }, select: projection,
          });
        }
        return await this.prisma.investigationOption.create({ data: { branchId, ...data }, select: projection });
      } catch (error) {
        if (!['P2002', 'P2025'].includes((error as { code?: string }).code || '')) throw error;
      }
    }
    throw new ConflictException('The investigation list changed. Refresh and try again.');
  }

  /**
   * @cc [owner:nareshshah139,label:product] investigation-edit-stale-guard
   * Rename and archive MUST reject stale versions, archived entries and entries
   * from another branch without changing any option. A rename collision MUST fail.
   */
  async update(branchId: string, id: string, value: unknown, version: number) {
    const data = investigationName(value);
    try {
      return await this.prisma.investigationOption.update({
        where: { id, branchId, version: revision(version), archivedAt: null },
        data: { ...data, version: { increment: 1 } }, select: projection,
      });
    } catch (error) {
      this.conflict(error);
    }
  }

  /**
   * @cc [owner:nareshshah139,label:product] investigation-archive-snapshots
   * Archiving a current option MUST hide it from future catalog reads without
   * deleting the option identity or changing any saved visit selection.
   */
  async archive(branchId: string, id: string, version: number) {
    try {
      await this.prisma.investigationOption.update({
        where: { id, branchId, version: revision(version), archivedAt: null },
        data: { archivedAt: new Date(), version: { increment: 1 } }, select: projection,
      });
      return { archived: true };
    } catch (error) {
      this.conflict(error);
    }
  }

  private conflict(error: unknown): never {
    const code = (error as { code?: string })?.code;
    if (code === 'P2002') throw new ConflictException('An investigation with this name already exists.');
    if (code === 'P2025') throw new ConflictException('The investigation changed or was removed. Refresh and try again.');
    throw error;
  }
}
