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
  IsBoolean,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PrescriptionStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum PrescriptionLanguage {
  EN = 'EN',
  TE = 'TE',
  HI = 'HI',
}

export enum DosageUnit {
  MG = 'MG',
  ML = 'ML',
  MCG = 'MCG',
  IU = 'IU',
  TABLET = 'TABLET',
  CAPSULE = 'CAPSULE',
  DROP = 'DROP',
  SPRAY = 'SPRAY',
  PATCH = 'PATCH',
  INJECTION = 'INJECTION',
}

export enum Frequency {
  ONCE_DAILY = 'ONCE_DAILY',
  TWICE_DAILY = 'TWICE_DAILY',
  THREE_TIMES_DAILY = 'THREE_TIMES_DAILY',
  FOUR_TIMES_DAILY = 'FOUR_TIMES_DAILY',
  EVERY_4_HOURS = 'EVERY_4_HOURS',
  EVERY_6_HOURS = 'EVERY_6_HOURS',
  EVERY_8_HOURS = 'EVERY_8_HOURS',
  EVERY_12_HOURS = 'EVERY_12_HOURS',
  AS_NEEDED = 'AS_NEEDED',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export enum DurationUnit {
  DAYS = 'DAYS',
  WEEKS = 'WEEKS',
  MONTHS = 'MONTHS',
  YEARS = 'YEARS',
}

export enum RefillStatus {
  NONE = 'NONE',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
}

export class PrescriptionItemDto {
  @IsString()
  drugName: string;

  @IsOptional()
  @IsString()
  genericName?: string;

  @IsOptional()
  @IsString()
  brandName?: string;

  @IsNumber()
  @Min(0.01)
  dosage: number;

  @IsEnum(DosageUnit)
  dosageUnit: DosageUnit;

  @IsEnum(Frequency)
  frequency: Frequency;

  @IsNumber()
  @Min(1)
  duration: number;

  @IsEnum(DurationUnit)
  durationUnit: DurationUnit;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsString()
  route?: string; // Oral, Topical, Injection, etc.

  @IsOptional()
  @IsString()
  timing?: string; // Before meals, After meals, etc.

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isGeneric?: boolean = true;

  @IsOptional()
  @IsString()
  hsnCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  mrp?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  gstRate?: number = 18;

  // Dermatology-specific optional fields
  @IsOptional()
  @IsString()
  applicationSite?: string; // e.g., Face, Scalp, Folds

  @IsOptional()
  @IsString()
  applicationAmount?: string; // e.g., 1 FTU, 2 g

  @IsOptional()
  @IsString()
  dayPart?: string; // AM/PM/BID/QHS

  @IsOptional()
  @IsBoolean()
  leaveOn?: boolean; // true=leave-on, false=wash-off

  @IsOptional()
  @IsNumber()
  @Min(0)
  washOffAfterMinutes?: number; // if not leaveOn

  @IsOptional()
  @IsString()
  taperSchedule?: string; // Steroid taper details

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightMgPerKgPerDay?: number; // for isotretinoin, etc.

  @IsOptional()
  @IsNumber()
  @Min(0)
  calculatedDailyDoseMg?: number; // computed dose

  @IsOptional()
  @IsBoolean()
  pregnancyWarning?: boolean;

  @IsOptional()
  @IsBoolean()
  photosensitivityWarning?: boolean;

  @IsOptional()
  @IsString()
  foodInstructions?: string; // with/after food, avoid dairy, etc.

  @IsOptional()
  @IsString()
  pulseRegimen?: string; // antifungal pulses, etc.
}

export class CreatePrescriptionDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  visitId: string;

  @IsUUID()
  doctorId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];

  @IsOptional()
  @IsString()
  diagnosis?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(PrescriptionLanguage)
  language?: PrescriptionLanguage = PrescriptionLanguage.EN;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  maxRefills?: number = 0;

  @IsOptional()
  @IsString()
  followUpInstructions?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsObject()
  procedureMetrics?: Record<string, any>;
}

export class UpdatePrescriptionDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items?: PrescriptionItemDto[];

  @IsOptional()
  @IsString()
  diagnosis?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(PrescriptionLanguage)
  language?: PrescriptionLanguage;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  maxRefills?: number;

  @IsOptional()
  @IsString()
  followUpInstructions?: string;

  @IsOptional()
  @IsEnum(PrescriptionStatus)
  status?: PrescriptionStatus;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class RefillPrescriptionDto {
  @IsUUID()
  prescriptionId: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  requestedDate?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class ApproveRefillDto {
  @IsUUID()
  refillId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  approvedDate?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class DrugInteractionDto {
  @IsString()
  drug1: string;

  @IsString()
  drug2: string;

  @IsEnum(['MAJOR', 'MODERATE', 'MINOR'])
  severity: 'MAJOR' | 'MODERATE' | 'MINOR';

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  recommendation?: string;
}

export class PrescriptionTemplateDto {
  @IsString()
  name: string;

  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  specialty?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean = false;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
