import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsObject,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { VisitType } from '@prisma/client';
import { type AppointmentCalendar, CALENDARS } from '../appointment-calendar';

// Runtime enum to ensure decorator evaluation doesn't receive undefined
export enum VisitTypeEnum {
  OPD = 'OPD',
  TELEMED = 'TELEMED',
  PROCEDURE = 'PROCEDURE',
}

export class CreateAppointmentDto {
  @IsString()
  patientId: string;

  @IsString()
  doctorId: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsDateString()
  date: string;

  @IsString()
  slot: string; // e.g., "10:00-10:30"

  @IsOptional()
  @IsEnum(VisitTypeEnum)
  visitType?: VisitType;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>; // Additional scheduling data

  @IsOptional()
  @IsIn(CALENDARS)
  calendar?: AppointmentCalendar;

  /** Book into a slot that already has patients, up to the doctor's limit. Sent only after the user confirms. */
  @IsOptional()
  @IsBoolean()
  allowOverbook?: boolean;
}

export class RescheduleAppointmentDto {
  @IsDateString()
  date: string;

  @IsString()
  slot: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  allowOverbook?: boolean;

  @IsOptional()
  @IsIn(CALENDARS)
  calendar?: AppointmentCalendar;
}
