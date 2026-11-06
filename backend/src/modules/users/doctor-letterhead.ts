import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../../shared/database/prisma.service';
import { isBundledAssetDoctor } from './doctor-signature';

export const MAX_LETTERHEAD_BYTES = 5 * 1024 * 1024;
/** Served by the frontend from public/; kept in sync with frontend/src/lib/prescription-letterhead.ts. */
export const BUNDLED_LETTERHEAD_URL = '/prescription-letterhead-praneeta.jpg';

export type DoctorLetterhead = { id: string; url: string; source: 'uploaded' | 'bundled' };

/**
 * @cc [owner:nareshshah139,label:product] doctor-letterhead-default
 * Each doctor's prescriptions MUST print on that doctor's own uploaded letterhead.
 * The bundled letterhead is available only for an active Dr. Praneeta Jain in the
 * requested branch with no letterhead history. Any other doctor without an upload
 * MUST get no letterhead, never Dr. Praneeta Jain's. Removal MUST NOT resurrect the default.
 */
export async function readDoctorLetterhead(prisma: PrismaService, branchId: string, doctorId: string): Promise<DoctorLetterhead | null> {
  const uploaded = await prisma.clinicAsset.findFirst({
    where: { branchId, ownerId: doctorId, type: 'LETTERHEAD', isActive: true,
      owner: { role: 'DOCTOR', isActive: true, branchId } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: { id: true, url: true },
  });
  if (uploaded) {
    return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(uploaded.url) ? { ...uploaded, source: 'uploaded' } : null;
  }
  const doctor = await prisma.user.findFirst({
    where: { id: doctorId, branchId, role: 'DOCTOR', isActive: true },
    select: { firstName: true, lastName: true },
  });
  if (!isBundledAssetDoctor(doctor)) return null;
  const history = await prisma.clinicAsset.findFirst({
    where: { branchId, ownerId: doctorId, type: 'LETTERHEAD' }, select: { id: true },
  });
  return history ? null : { id: `default:${doctorId}`, url: BUNDLED_LETTERHEAD_URL, source: 'bundled' };
}

/**
 * @cc [owner:nareshshah139,label:security] letterhead-raster-upload
 * Missing, oversized, corrupt, animated or non-PNG/JPEG uploads MUST fail with
 * BadRequestException. Accepted images are re-encoded as raster data only.
 */
export async function letterheadDataUrl(file?: Express.Multer.File): Promise<string> {
  if (!file?.buffer?.length || file.buffer.length > MAX_LETTERHEAD_BYTES) {
    throw new BadRequestException('Choose a PNG or JPG letterhead image up to 5 MB.');
  }
  if (!['image/png', 'image/jpeg'].includes(file.mimetype)) {
    throw new BadRequestException('Letterhead must be a PNG or JPG image.');
  }
  try {
    const image = sharp(file.buffer, { limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if (!['png', 'jpeg'].includes(metadata.format || '') || (metadata.pages || 1) !== 1) throw new Error('Unsupported image');
    // A4 at 200 dpi keeps print quality while bounding the stored size.
    const jpeg = await image.rotate().resize({ width: 1654, height: 2339, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch {
    throw new BadRequestException('This image could not be read. Choose a valid PNG or JPG letterhead.');
  }
}
