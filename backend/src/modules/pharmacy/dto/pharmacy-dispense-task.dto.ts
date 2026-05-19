import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum PharmacyDispenseTaskStatusDto {
  QUEUED = 'QUEUED',
  IN_REVIEW = 'IN_REVIEW',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  PAUSED = 'PAUSED',
  READY_TO_BILL = 'READY_TO_BILL',
  PAID = 'PAID',
  DISPENSED = 'DISPENSED',
  CANCELLED = 'CANCELLED',
}

export enum PharmacyDispenseLineActionDto {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  SUBSTITUTE = 'SUBSTITUTE',
  EDITED = 'EDITED',
  UNAVAILABLE = 'UNAVAILABLE',
}

export class UpdateDispenseTaskStatusDto {
  @ApiPropertyOptional({ enum: PharmacyDispenseTaskStatusDto })
  @IsEnum(PharmacyDispenseTaskStatusDto)
  status: PharmacyDispenseTaskStatusDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reasonType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reasonNote?: string;
}

export class UpdateDispenseTaskLineDto {
  @ApiPropertyOptional({ enum: PharmacyDispenseLineActionDto })
  @IsEnum(PharmacyDispenseLineActionDto)
  action: PharmacyDispenseLineActionDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reasonType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reasonNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  substituteDrugId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  substituteDrugName?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  })
  @IsInt()
  @Min(0)
  @Max(100000)
  editedQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pharmacistNotes?: string;
}
