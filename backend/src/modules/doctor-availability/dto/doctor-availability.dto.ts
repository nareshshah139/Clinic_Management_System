import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TimeOffKind } from '@prisma/client';
import { MAX_BOOKINGS_PER_SLOT } from '../availability';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

export class WeeklyShiftDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @Matches(HHMM, { message: 'start must be HH:MM' })
  start: string;

  @Matches(HHMM, { message: 'end must be HH:MM' })
  end: string;
}

export class ReplaceWorkingHoursDto {
  @IsArray()
  @ArrayMaxSize(70)
  @ValidateNested({ each: true })
  @Type(() => WeeklyShiftDto)
  hours: WeeklyShiftDto[];
}

export class CreateTimeOffDto {
  @IsOptional()
  @IsString()
  doctorId?: string;

  @IsEnum(TimeOffKind)
  kind: TimeOffKind;

  @IsISO8601({ strict: true })
  startsAt: string;

  @IsISO8601({ strict: true })
  endsAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class SetBookingLimitDto {
  @IsInt()
  @Min(1)
  @Max(MAX_BOOKINGS_PER_SLOT)
  maxBookingsPerSlot: number;
}

export class AvailabilityRangeDto {
  @IsOptional()
  @Matches(DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

export class AvailabilityDayDto {
  @Matches(DATE, { message: 'date must be YYYY-MM-DD' })
  date: string;
}
