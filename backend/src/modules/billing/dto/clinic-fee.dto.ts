import { IsInt, IsNumber, IsPositive, Max, Min, ValidateIf } from 'class-validator';

export const MAX_FEE = 1_000_000;

/**
 * @cc [owner:nareshshah139,label:validation] clinic-fee-input
 * A fee MUST be null (no fee) or a number above 0 and up to 10,00,000 with at most two decimals,
 * and the version MUST be a whole number from 0. Anything else MUST get 400 and store nothing.
 */
export class SetClinicFeeDto {
  @ValidateIf((dto: SetClinicFeeDto) => dto.amount !== null)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_FEE)
  amount: number | null;

  @IsInt()
  @Min(0)
  version: number;
}
