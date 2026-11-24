import { PrismaClient } from '@prisma/client';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PrismaService } from '../../../shared/database/prisma.service';
import { localDatabase } from '../../../shared/testing/local-database';
import { UploadsService } from '../uploads.service';

const databaseTests = process.env.VISIT_LIFECYCLE_TEST_DATABASE_URL
  ? describe
  : describe.skip;
databaseTests('Upload ownership on PostgreSQL', () => {
  let db: PrismaClient;
  let cleanup: () => Promise<void>;
  let uploads: UploadsService;
  let cwd: string;
  const read = async (url: string, branchId: string) =>
    (
      await uploads.read(url.replace('/uploads/', ''), branchId)
    ).data.toString();

  beforeAll(async () => {
    ({ prisma: db, cleanup } = await localDatabase(
      process.env.VISIT_LIFECYCLE_TEST_DATABASE_URL!,
    ));
    uploads = new UploadsService(db as PrismaService);
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-db-spec-'));
    jest.spyOn(process, 'cwd').mockReturnValue(cwd);
    for (const file of [
      'visits/1700000000000_0123456789abcdef.jpg',
      'visits/1700000000000x0123456789abcdef.jpg',
      'visits/removed.jpg',
      'patients/patient-a/20250101/front.png',
      'photos/face.webp',
      'photos/shared.jpg',
    ]) {
      fs.mkdirSync(path.dirname(path.join(cwd, 'uploads', file)), {
        recursive: true,
      });
      fs.writeFileSync(path.join(cwd, 'uploads', file), file);
    }
    for (const id of ['branch-a', 'branch-b']) {
      await db.branch.create({
        data: { id, name: `SYNTHETIC ${id}`, address: 'Test' },
      });
      await db.user.create({
        data: {
          id: `doctor-${id}`,
          branchId: id,
          firstName: 'Synthetic',
          lastName: 'Doctor',
          email: `${id}@example.invalid`,
          password: 'NO_LOGIN',
          role: 'DOCTOR',
        },
      });
    }
    await db.patient.create({
      data: {
        id: 'patient-a',
        branchId: 'branch-a',
        name: 'SYNTHETIC A',
        phone: '9000000001',
        gender: 'F',
        photoUrl: '/uploads/photos/face.webp',
      },
    });
    await db.patient.create({
      data: {
        id: 'patient-a2',
        branchId: 'branch-a',
        name: 'SYNTHETIC A2',
        phone: '9000000002',
        gender: 'F',
        photoUrl: 'uploads/photos/shared.jpg',
      },
    });
    await db.patient.create({
      data: {
        id: 'patient-b',
        branchId: 'branch-b',
        name: 'SYNTHETIC B',
        phone: '9000000003',
        gender: 'F',
      },
    });
    const visit = (
      id: string,
      patientId: string,
      branchId: string,
      attachments: string[],
      deletedAt: Date | null = null,
    ) =>
      db.visit.create({
        data: {
          id,
          patientId,
          doctorId: `doctor-${branchId}`,
          complaints: '[]',
          attachments: JSON.stringify(attachments),
          deletedAt,
        },
      });
    await visit('visit-a', 'patient-a', 'branch-a', [
      '/uploads/visits/1700000000000_0123456789abcdef.jpg',
    ]);
    await visit(
      'visit-a-removed',
      'patient-a',
      'branch-a',
      ['/uploads/visits/removed.jpg'],
      new Date(),
    );
    // "_" is a single-character wildcard in LIKE; this name differs from visit-a's file only there.
    await visit('visit-b', 'patient-b', 'branch-b', [
      '/uploads/visits/1700000000000x0123456789abcdef.jpg',
    ]);
  }, 120_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    fs.rmSync(cwd, { recursive: true, force: true });
    await cleanup?.();
  });

  it('reads a legacy visit file, a draft file and a patient photo for the owning branch', async () => {
    expect(
      await read(
        '/uploads/visits/1700000000000_0123456789abcdef.jpg',
        'branch-a',
      ),
    ).toBe('visits/1700000000000_0123456789abcdef.jpg');
    expect(
      await read('/uploads/patients/patient-a/20250101/front.png', 'branch-a'),
    ).toBe('patients/patient-a/20250101/front.png');
    expect(await read('/uploads/photos/face.webp', 'branch-a')).toBe(
      'photos/face.webp',
    );
    expect(await read('/uploads/photos/shared.jpg', 'branch-a')).toBe(
      'photos/shared.jpg',
    );
  });

  it.each([
    '/uploads/visits/1700000000000_0123456789abcdef.jpg',
    '/uploads/patients/patient-a/20250101/front.png',
    '/uploads/photos/face.webp',
    '/uploads/photos/shared.jpg',
  ])('hides %s from another branch', async (url) => {
    await expect(read(url, 'branch-b')).rejects.toThrow('File not found');
  });

  it('matches a visit file by its exact name and skips deleted visits', async () => {
    expect(
      await read(
        '/uploads/visits/1700000000000x0123456789abcdef.jpg',
        'branch-b',
      ),
    ).toBe('visits/1700000000000x0123456789abcdef.jpg');
    await expect(
      read('/uploads/visits/1700000000000x0123456789abcdef.jpg', 'branch-a'),
    ).rejects.toThrow('File not found');
    await expect(
      read('/uploads/visits/removed.jpg', 'branch-a'),
    ).rejects.toThrow('File not found');
  });

  it('stops serving a patient photo once a second branch claims the same file', async () => {
    await db.patient.update({
      where: { id: 'patient-b' },
      data: { photoUrl: '/uploads/photos/shared.jpg' },
    });
    await expect(
      read('/uploads/photos/shared.jpg', 'branch-a'),
    ).rejects.toThrow('File not found');
    await expect(
      read('/uploads/photos/shared.jpg', 'branch-b'),
    ).rejects.toThrow('File not found');
  });
});
