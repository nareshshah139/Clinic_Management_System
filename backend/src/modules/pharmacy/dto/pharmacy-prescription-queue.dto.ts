import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
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

  @ApiPropertyOptional({
    description: 'With status=expired: true keeps only paused tasks, false keeps only the rest',
  })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value))
  @IsBoolean()
  paused?: boolean;

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
