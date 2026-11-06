import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TimeOffKind, UserRole } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  istClock,
  istDayEnd,
  istDayStart,
  minutesToHhmm,
  parseWeeklyHoursInput,
} from './availability';
import {
  loadDayAvailability,
  loadTimeOff,
  loadWeeklyHours,
} from './availability.queries';
import {
  CreateTimeOffDto,
  ReplaceWorkingHoursDto,
} from './dto/doctor-availability.dto';

export interface Actor {
  id: string;
  branchId: string;
  role: string;
}

/**
 * @cc [owner:nareshshah139,label:validation] time-off-range-validation
 * Time off MUST end after it starts and MUST NOT span more than 366 days; either failure MUST
 * return 400 and store nothing.
 */
const MAX_TIME_OFF_DAYS = 366;

@Injectable()
export class DoctorAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getAvailability(
    doctorId: string,
    branchId: string,
    range: { from?: string; to?: string },
  ) {
    const doctor = await this.findDoctor(doctorId, branchId);
    const from = istDayStart(range.from ?? istClock(new Date()).date);
    const to = range.to ? istDayEnd(range.to) : undefined;
    const [weekly, timeOff] = await Promise.all([
      loadWeeklyHours(this.prisma, branchId, doctor),
      loadTimeOff(this.prisma, branchId, doctorId, from, to),
    ]);
    return {
      doctorId,
      source: weekly.source,
      hours: weekly.hours.map((row) => ({
        weekday: row.weekday,
        start: minutesToHhmm(row.startMinute),
        end: minutesToHhmm(row.endMinute),
      })),
      timeOff,
    };
  }

  async getDay(doctorId: string, branchId: string, date: string) {
    const doctor = await this.findDoctor(doctorId, branchId);
    return loadDayAvailability(this.prisma, branchId, doctor, date);
  }

  async listHolidays(branchId: string, range: { from?: string; to?: string }) {
    return this.prisma.doctorTimeOff.findMany({
      where: {
        branchId,
        doctorId: null,
        endsAt: { gt: istDayStart(range.from ?? istClock(new Date()).date) },
        ...(range.to ? { startsAt: { lt: istDayEnd(range.to) } } : {}),
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  /**
   * @cc [owner:nareshshah139,label:security] doctor-hours-edit-access
   * OWNER and ADMIN MUST be able to replace the working hours of any doctor in their branch and a
   * DOCTOR only their own; anyone else MUST get 403. A doctor of another branch MUST get 404. An
   * empty, overlapping or malformed shift list MUST get 400 and leave the stored hours unchanged.
   */
  async replaceHours(
    doctorId: string,
    dto: ReplaceWorkingHoursDto,
    actor: Actor,
  ) {
    this.assertCanManage(actor, doctorId);
    await this.findDoctor(doctorId, actor.branchId);
    if (dto.hours.length === 0) {
      throw new BadRequestException('Add at least one shift');
    }
    const parsed = parseWeeklyHoursInput(dto.hours);
    if ('error' in parsed) throw new BadRequestException(parsed.error);
    await this.prisma.$transaction([
      this.prisma.doctorWorkingHours.deleteMany({
        where: { doctorId, branchId: actor.branchId },
      }),
      this.prisma.doctorWorkingHours.createMany({
        data: parsed.rows.map((row) => ({
          ...row,
          doctorId,
          branchId: actor.branchId,
        })),
      }),
    ]);
    return this.getAvailability(doctorId, actor.branchId, {});
  }

  /**
   * @cc [owner:nareshshah139,label:security] time-off-edit-access
   * OWNER and ADMIN MUST be able to add leave or blocked time for any doctor in their branch and a
   * DOCTOR only for themselves; anyone else MUST get 403. A branch holiday (kind HOLIDAY, with or
   * without a doctor) MUST be added by OWNER or ADMIN only, so a DOCTOR gets 403. Leave or blocked
   * time without a doctor MUST get 400, and a doctor of another branch MUST get 404.
   */
  async createTimeOff(dto: CreateTimeOffDto, actor: Actor) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (!(startsAt < endsAt)) {
      throw new BadRequestException('Time off must end after it starts');
    }
    if (endsAt.getTime() - startsAt.getTime() > MAX_TIME_OFF_DAYS * 86_400_000) {
      throw new BadRequestException('Time off cannot exceed one year');
    }
    if (dto.doctorId) {
      if (dto.kind === TimeOffKind.HOLIDAY) {
        this.assertAdmin(actor);
      } else {
        this.assertCanManage(actor, dto.doctorId);
      }
      await this.findDoctor(dto.doctorId, actor.branchId);
    } else {
      if (dto.kind !== TimeOffKind.HOLIDAY) {
        throw new BadRequestException(
          'Choose a doctor for leave or blocked time',
        );
      }
      this.assertAdmin(actor);
    }
    return this.prisma.doctorTimeOff.create({
      data: {
        branchId: actor.branchId,
        doctorId: dto.doctorId ?? null,
        kind: dto.kind,
        startsAt,
        endsAt,
        reason: dto.reason?.trim() || null,
        createdById: actor.id,
      },
    });
  }

  /**
   * @cc [owner:nareshshah139,label:security] time-off-delete-access
   * Removing leave or blocked time follows the rule for adding it: OWNER and ADMIN for any doctor
   * in their branch, a DOCTOR only their own. A branch holiday MUST be removed by OWNER or ADMIN
   * only. Time off of another branch MUST get 404 and stay stored.
   */
  async deleteTimeOff(id: string, actor: Actor) {
    const row = await this.prisma.doctorTimeOff.findFirst({
      where: { id, branchId: actor.branchId },
    });
    if (!row) throw new NotFoundException('Time off not found');
    if (row.doctorId && row.kind !== TimeOffKind.HOLIDAY) {
      this.assertCanManage(actor, row.doctorId);
    } else {
      this.assertAdmin(actor);
    }
    await this.prisma.doctorTimeOff.delete({ where: { id } });
    return { deleted: true, id };
  }

  private async findDoctor(doctorId: string, branchId: string) {
    const doctor = await this.prisma.user.findFirst({
      where: { id: doctorId, branchId, role: UserRole.DOCTOR },
      select: { id: true, metadata: true },
    });
    if (!doctor) throw new NotFoundException('Doctor not found in this branch');
    return doctor;
  }

  private assertAdmin(actor: Actor) {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.OWNER) {
      throw new ForbiddenException('Only an admin can manage clinic holidays');
    }
  }

  private assertCanManage(actor: Actor, doctorId: string) {
    if (actor.role === UserRole.ADMIN || actor.role === UserRole.OWNER) return;
    if (actor.role === UserRole.DOCTOR && actor.id === doctorId) return;
    throw new ForbiddenException(
      'You can only change your own hours and time off',
    );
  }
}
