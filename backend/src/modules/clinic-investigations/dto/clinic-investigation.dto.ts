import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import {
  MAX_INVESTIGATION_NAME_LENGTH,
  collapseWhitespace,
} from '../investigation-name';

export class ClinicInvestigationNameDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? collapseWhitespace(value) : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_INVESTIGATION_NAME_LENGTH)
  name: string;
}
