import {
  IsString,
  IsOptional,
  IsUUID,
  IsObject,
  IsArray,
  ValidateNested,
  IsEnum,
  IsDateString,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Language } from '@prisma/client';

// Runtime enum for validator to avoid undefined at runtime
export enum LanguageEnum {
  EN = 'EN',
  TE = 'TE',
  HI = 'HI',
}

export class VitalsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  systolicBP?: number; // mmHg

  @IsOptional()
  @IsNumber()
  @Min(0)
  diastolicBP?: number; // mmHg

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  heartRate?: number; // bpm

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(45)
  temperature?: number; // Celsius

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  weight?: number; // kg

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(250)
  height?: number; // cm

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  oxygenSaturation?: number; // %

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  respiratoryRate?: number; // breaths per minute

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ComplaintDto {
  @IsString()
  complaint: string;

  @IsOptional()
  @IsString()
  duration?: string; // e.g., "2 days", "1 week"

  @IsOptional()
  @IsString()
  severity?: string; // Mild, Moderate, Severe

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ExaminationDto {
  @IsOptional()
  @IsString()
  generalAppearance?: string;

  @IsOptional()
  @IsString()
  skinExamination?: string;

  @IsOptional()
  @IsString()
  cardiovascularSystem?: string;

  @IsOptional()
  @IsString()
  respiratorySystem?: string;

  @IsOptional()
  @IsString()
  abdominalExamination?: string;

  @IsOptional()
  @IsString()
  neurologicalExamination?: string;

  @IsOptional()
  @IsString()
  otherFindings?: string;
}

export class DiagnosisDto {
  @IsString()
  diagnosis: string;

  @IsOptional()
  @IsString()
  icd10Code?: string;

  @IsOptional()
  @IsString()
  type?: string; // Primary, Secondary, Differential

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TreatmentPlanDto {
  @IsOptional()
  @IsString()
  medications?: string;

  @IsOptional()
  @IsString()
  procedures?: string;

  @IsOptional()
  @IsString()
  lifestyleModifications?: string;

  @IsOptional()
  @IsString()
  followUpInstructions?: string;

  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Accept a flexible dermatology plan object (investigations, procedures, counseling, etc.)
  // We intentionally keep this untyped to preserve custom nested structures used by the UI
  @IsOptional()
  @IsObject()
  dermatology?: Record<string, any>;
}

export class CreateVisitDto {
  @IsString()
  patientId: string;

  @IsString()
  doctorId: string;

  @IsOptional()
  @IsString()
  appointmentId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => VitalsDto)
  vitals?: VitalsDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComplaintDto)
  complaints: ComplaintDto[];

  @IsOptional()
  @IsString()
  history?: string; // Medical history

  @IsOptional()
  @ValidateNested()
  @Type(() => ExaminationDto)
  examination?: ExaminationDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiagnosisDto)
  diagnosis?: DiagnosisDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TreatmentPlanDto)
  treatmentPlan?: TreatmentPlanDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[]; // File references

  @IsOptional()
  @IsObject()
  scribeJson?: Record<string, any>; // AI scribe data

  @IsOptional()
  @IsEnum(LanguageEnum)
  language?: Language = Language.EN;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateVisitDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => VitalsDto)
  vitals?: VitalsDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComplaintDto)
  complaints?: ComplaintDto[];

  @IsOptional()
  @IsString()
  history?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExaminationDto)
  examination?: ExaminationDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiagnosisDto)
  diagnosis?: DiagnosisDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TreatmentPlanDto)
  treatmentPlan?: TreatmentPlanDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @IsOptional()
  @IsObject()
  scribeJson?: Record<string, any>;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CompleteVisitDto {
  @IsOptional()
  @IsString()
  finalNotes?: string;

  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @IsOptional()
  @IsString()
  followUpInstructions?: string;
}
