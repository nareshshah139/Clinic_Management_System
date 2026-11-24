import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { PlanContent } from './content';
import { ImportResult, importFollowUpData, readDataFiles } from './plan-import';
import { stopTracks } from './tracks';

@Injectable()
export class FollowUpsService {
  constructor(private readonly prisma: PrismaService) {}

  async importData(actorId: string | null): Promise<ImportResult[]> {
    const files = readDataFiles();
    return this.prisma.$transaction((tx) => importFollowUpData(tx, files, actorId));
  }

  /** The current version of every plan, for the visit form's picker (PP-26). */
  async listPlans() {
    const plans = await this.prisma.followUpPlan.findMany({
      orderBy: { key: 'asc' },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    return plans.filter((p) => p.versions.length).map((p) => {
      const v = p.versions[0];
      const content = v.content as unknown as PlanContent;
      return {
        key: p.key,
        planVersionId: v.id,
        version: v.version,
        name: content.name,
        steps: content.steps.map(({ key, offsetDays, windowDays }) => ({ key, offsetDays, windowDays })),
      };
    });
  }

  async activeTracks(patientId: string, branchId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, branchId }, select: { id: true } });
    if (!patient) throw new NotFoundException('Patient not found');
    return this.prisma.followUpTrack.findMany({
      where: { patientId, state: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, visitId: true, anchorDate: true, createdAt: true,
        planVersion: { select: { id: true, version: true, content: true, plan: { select: { key: true } } } },
        checkIns: { orderBy: { seq: 'asc' }, select: { id: true, stepKey: true, state: true, opensAt: true, closesAt: true } },
      },
    });
  }

  async stopTrack(trackId: string, branchId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const track = await tx.followUpTrack.findFirst({ where: { id: trackId, patient: { branchId } }, select: { id: true } });
      if (!track) throw new NotFoundException('Track not found');
      await tx.$queryRaw`SELECT id FROM follow_up_tracks WHERE id = ${trackId} FOR UPDATE`;
      const stopped = await stopTracks(tx, { id: trackId }, 'doctor-stopped', actorId);
      return { stopped: stopped === 1 };
    });
  }
}
