import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  /** The 8-character code a manager issued; dashes and spaces are allowed. */
  @IsString()
  @MinLength(8)
  @MaxLength(16)
  code: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsString()
  confirmPassword: string;
}
