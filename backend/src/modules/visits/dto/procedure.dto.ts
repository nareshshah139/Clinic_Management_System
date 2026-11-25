import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Min, ValidateNested, registerDecorator } from 'class-validator';
import { UserRole } from '@prisma/client';
import { RECORD_ROLE_CHOICES, isRecordedProcedure } from '../procedure-access';

function StartsWithRecordedProcedure() {
  return (object: object, propertyName: string) => registerDecorator({
    name: 'startsWithRecordedProcedure', target: object.constructor, propertyName,
    validator: {
      validate: (value: unknown) => Array.isArray(value) && isRecordedProcedure(value[0]),
      defaultMessage: () => 'procedures must start with a procedure that names its machine',
    },
  });
}

export class UpdateProcedureAccessDto {
  @IsArray()
  @IsIn(RECORD_ROLE_CHOICES, { each: true })
  recordRoles: UserRole[];
}

class ProcedureDermatologyDto {
  @StartsWithRecordedProcedure()
  procedures: Record<string, unknown>[];
}

/** Only the procedure list and the visit notes; the rest of a visit plan stays with the visit form. */
class ProcedurePlanDto {
  @IsObject()
  @ValidateNested()
  @Type(() => ProcedureDermatologyDto)
  dermatology: ProcedureDermatologyDto;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateProcedureDto {
  @IsString()
  patientId: string;

  @IsString()
  doctorId: string;

  @IsObject()
  @ValidateNested()
  @Type(() => ProcedurePlanDto)
  treatmentPlan: ProcedurePlanDto;
}

export class UpdateProcedureDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  version?: number;

  @IsObject()
  @ValidateNested()
  @Type(() => ProcedurePlanDto)
  treatmentPlan: ProcedurePlanDto;
}
