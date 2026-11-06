import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import {
  MAX_INVESTIGATION_NAME_LENGTH,
  collapseWhitespace,
} from '../investigation-name';

/**
 * @cc [owner:nareshshah139,label:validation] clinic-investigation-name-input
 * A name MUST be a string of 1 to 100 characters after whitespace is collapsed. A missing,
 * non-string, blank or longer name MUST get 400 and store nothing.
 */
export class ClinicInvestigationNameDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? collapseWhitespace(value) : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_INVESTIGATION_NAME_LENGTH)
  name: string;
}
