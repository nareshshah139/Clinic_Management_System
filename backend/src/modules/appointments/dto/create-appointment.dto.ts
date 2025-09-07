import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsObject,
} from 'class-validator';
import { VisitType } from '@prisma/client';

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
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
