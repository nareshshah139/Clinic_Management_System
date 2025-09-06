import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsUUID,
  IsObject,
} from 'class-validator';
import { VisitType } from '@prisma/client';

export class CreateAppointmentDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  doctorId: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsDateString()
  date: string;

  @IsString()
  slot: string; // e.g., "10:00-10:30"

  @IsOptional()
  @IsEnum(VisitType)
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
}

export class RescheduleAppointmentDto {
  @IsDateString()
  date: string;

  @IsString()
  slot: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
