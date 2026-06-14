import { IsOptional, IsEnum, IsString, IsUUID, IsArray } from 'class-validator';
import type { AppointmentStatus } from '@prisma/client';

// Runtime enum to ensure decorator evaluation doesn't receive undefined.
export enum AppointmentStatusEnum {
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  CHECKED_IN = 'CHECKED_IN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export class UpdateAppointmentDto {
  @IsOptional()
  @IsEnum(AppointmentStatusEnum)
  status?: AppointmentStatus;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  source?: string;
}

export class BulkUpdateAppointmentsDto {
  @IsArray()
  @IsUUID({}, { each: true })
  appointmentIds: string[];

  @IsOptional()
  @IsEnum(AppointmentStatusEnum)
  status?: AppointmentStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
