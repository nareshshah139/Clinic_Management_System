import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { extname, posix, resolve, sep } from 'path';
import { PrismaService } from '../../shared/database/prisma.service';

const IMAGE_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};
// A path segment is a plain name. A leading dot is refused, which rules out "." and "..".
const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
const MAX_DEPTH = 6;
// Server working directories under uploads/ that never hold a patient's file.
const INTERNAL_AREAS = new Set(['tmp', 'pharmacy-agent']);

/** Normalises a stored reference the way the visit attachment lists do. */
function storedPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = posix.normalize(value.trim());
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function storedPaths(json: string | null): (string | null)[] {
  try {
    const parsed: unknown = JSON.parse(json ?? '[]');
    return Array.isArray(parsed) ? parsed.map(storedPath) : [];
  } catch {
    return [];
  }
}

@Injectable()
export class UploadsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @cc [owner:nareshshah139,label:security] upload-branch-ownership
   * A file under uploads/ MUST be read only when a record in the caller's branch points at it: a
   * live visit's legacy attachment list, the patient named in a patients/ path, or a patient photo
   * that no other branch also claims. Anything else, including a missing file, MUST answer 404.
   * A path with a segment that is not a plain file name MUST be refused before any lookup.
   */
  async read(requested: string | string[], branchId: string | undefined) {
    const segments = (
      Array.isArray(requested) ? requested.join('/') : String(requested ?? '')
    ).split('/');
    if (
      segments.length > MAX_DEPTH ||
      segments.some((segment) => !SEGMENT.test(segment))
    ) {
      throw new BadRequestException('Invalid file path');
    }
    const contentType =
      IMAGE_TYPES[extname(segments[segments.length - 1]).toLowerCase()];
    if (
      !branchId ||
      !contentType ||
      !(await this.belongsToBranch(segments, branchId))
    ) {
      throw new NotFoundException('File not found');
    }
    try {
      const root = await fs.realpath(resolve(process.cwd(), 'uploads'));
      // realpath follows links, so a link planted inside uploads/ cannot lead outside it.
      const file = await fs.realpath(resolve(root, ...segments));
      if (!file.startsWith(root + sep) || !(await fs.stat(file)).isFile())
        throw new Error('Not a stored file');
      return { data: await fs.readFile(file), contentType };
    } catch {
      throw new NotFoundException('File not found');
    }
  }

  private async belongsToBranch(
    segments: string[],
    branchId: string,
  ): Promise<boolean> {
    const stored = `/uploads/${segments.join('/')}`;
    const [area, ...rest] = segments;

    if (area === 'visits') {
      if (rest.length !== 1) return false;
      // The column holds a JSON list, so the query narrows by file name and the exact match is made here.
      const visits = await this.prisma.visit.findMany({
        where: {
          deletedAt: null,
          patient: { branchId },
          attachments: { contains: rest[0] },
        },
        select: { attachments: true },
      });
      return visits.some((visit) =>
        storedPaths(visit.attachments).includes(stored),
      );
    }

    if (area === 'patients') {
      if (rest.length !== 3 || !/^\d{8}$/.test(rest[1])) return false;
      const patient = await this.prisma.patient.findFirst({
        where: { id: rest[0], branchId },
        select: { id: true },
      });
      return !!patient;
    }

    if (INTERNAL_AREAS.has(area)) return false;

    // Any staff member can set a patient's photoUrl, so a second branch naming the same file is
    // a conflict and not a grant.
    const claims = await this.prisma.patient.findMany({
      where: { photoUrl: { in: [stored, stored.slice(1)] } },
      select: { branchId: true },
    });
    return (
      claims.length > 0 &&
      claims.every((patient) => patient.branchId === branchId)
    );
  }
}
