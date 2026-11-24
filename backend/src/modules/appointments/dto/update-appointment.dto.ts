import { IsOptional, IsEnum, IsString, IsNotEmpty, IsArray, IsBoolean } from 'class-validator';
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
  @IsString()
  @IsNotEmpty()
  roomId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsBoolean()
  allowOverbook?: boolean;
}

export class BulkUpdateAppointmentsDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  appointmentIds: string[];

  @IsOptional()
  @IsEnum(AppointmentStatusEnum)
  status?: AppointmentStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
