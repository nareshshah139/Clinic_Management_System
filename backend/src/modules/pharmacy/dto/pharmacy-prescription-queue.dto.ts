import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum PrescriptionQueueStatus {
  PENDING = 'pending',
  PARTIAL = 'partial',
  DISPENSED = 'dispensed',
  EXPIRED = 'expired',
}

export class QueryPrescriptionQueueDto {
  @ApiPropertyOptional({
    enum: PrescriptionQueueStatus,
    description: 'Derived queue status filter',
  })
  @IsOptional()
  @IsEnum(PrescriptionQueueStatus)
  status?: PrescriptionQueueStatus;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  })
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  })
  @IsInt()
  @Min(1)
  page?: number = 1;
}
