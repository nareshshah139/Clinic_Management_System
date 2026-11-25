import { IsOptional, IsEnum, IsString, IsArray, IsBoolean } from 'class-validator';
import type { AppointmentStatus } from '@prisma/client';
import { IsEntityId } from '../../../shared/decorators/is-entity-id.decorator';

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
  @IsEntityId()
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
  @IsEntityId({ each: true })
  appointmentIds: string[];

  @IsOptional()
  @IsEnum(AppointmentStatusEnum)
  status?: AppointmentStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
