import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../../shared/database/prisma.service';

export const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

/**
 * @cc [owner:nareshshah139,label:product;security] doctor-signature-default
 * The bundled signature is available only for an active Dr. Praneeta Jain in
 * the requested branch with no signature history. An upload overrides it;
 * removal or invalid saved data MUST NOT resurrect the bundled default.
 */
export async function readDoctorSignature(prisma: PrismaService, branchId: string, doctorId: string) {
  const signature = await prisma.clinicAsset.findFirst({
    where: { branchId, ownerId: doctorId, type: 'SIGNATURE', isActive: true,
      owner: { role: 'DOCTOR', isActive: true, branchId } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: { id: true, url: true },
  });
  if (!signature) {
    const doctor = await prisma.user.findFirst({
      where: { id: doctorId, branchId, role: 'DOCTOR', isActive: true },
      select: { firstName: true, lastName: true },
    });
    const name = doctor && `${doctor.firstName} ${doctor.lastName}`.trim().replace(/^dr\.?\s+/i, '').replace(/\s+/g, ' ').toLowerCase();
    if (name !== 'praneeta jain') return null;
    const history = await prisma.clinicAsset.findFirst({
      where: { branchId, ownerId: doctorId, type: 'SIGNATURE' }, select: { id: true },
    });
    if (history) return null;
    const png = await readFile(join(__dirname, 'assets', 'Dr_Praneeta_Jain_signature.png'));
    const metadata = await sharp(png).metadata();
    return { id: `default:${doctorId}`, url: `data:image/png;base64,${png.toString('base64')}`, width: metadata.width!, height: metadata.height! };
  }
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(signature.url)) return null;
  try {
    const metadata = await sharp(Buffer.from(signature.url.split(',')[1], 'base64'), { limitInputPixels: 16_000_000 }).metadata();
    return ['png', 'jpeg'].includes(metadata.format || '') && metadata.width && metadata.height && (metadata.pages || 1) === 1
      ? { ...signature, width: metadata.width, height: metadata.height } : null;
  } catch {
    return null;
  }
}

/**
 * @cc [owner:nareshshah139,label:security] signature-raster-upload
 * Missing, oversized, corrupt, animated or non-PNG/JPEG uploads MUST fail with
 * BadRequestException. Accepted images retain alpha and contain raster data only.
 */
export async function signatureDataUrl(file?: Express.Multer.File): Promise<string> {
  if (!file?.buffer?.length || file.buffer.length > MAX_SIGNATURE_BYTES) {
    throw new BadRequestException('Choose a PNG or JPG signature image up to 2 MB.');
  }
  if (!['image/png', 'image/jpeg'].includes(file.mimetype)) {
    throw new BadRequestException('Signature must be a PNG or JPG image.');
  }
  try {
    const image = sharp(file.buffer, { limitInputPixels: 16_000_000 });
    const metadata = await image.metadata();
    if (!['png', 'jpeg'].includes(metadata.format || '') || (metadata.pages || 1) !== 1) throw new Error('Unsupported image');
    // Decode and re-encode to reject corrupt files, strip metadata, and retain PNG alpha.
    const png = await image.rotate().resize({ width: 1000, height: 500, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    throw new BadRequestException('This image could not be read. Choose a valid PNG or JPG signature.');
  }
}
