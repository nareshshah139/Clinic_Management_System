import { IsByteLength, IsString, MaxLength, MinLength } from 'class-validator';

/** bcrypt reads only the first 72 bytes, so a longer password would not all protect the account. */
export const BCRYPT_MAX_BYTES = 72;
export const PASSWORD_BYTES = '$property must be at most 72 bytes; letters outside English can take up to 4 bytes each';

export class ResetPasswordDto {
  /** The 8-character code a manager issued; dashes and spaces are allowed. */
  @IsString()
  @MinLength(8)
  @MaxLength(16)
  code: string;

  @IsString()
  @MinLength(8)
  @IsByteLength(0, BCRYPT_MAX_BYTES, { message: PASSWORD_BYTES })
  password: string;

  @IsString()
  confirmPassword: string;
}
