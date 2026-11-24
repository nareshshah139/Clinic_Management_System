import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const RESOLUTION_CODES = ['REPLIED', 'CALLED', 'REVIEW_BOOKED', 'ADVICE_GIVEN', 'NO_ACTION_NEEDED', 'WRONG_NUMBER'] as const;
export type ResolutionCode = (typeof RESOLUTION_CODES)[number];

export class ResolveItemDto {
  @IsIn(RESOLUTION_CODES)
  code!: ResolutionCode;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note!: string;
}

export class StaffReplyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  body!: string;
}

export class LogCallDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note!: string;
}

export class AssignMessageDto {
  @IsString()
  @IsNotEmpty()
  patientId!: string;
}
