import { IsString, Matches, MaxLength } from 'class-validator';

export class CodeRequestDto {
  @IsString()
  @MaxLength(32)
  phone!: string;
}

export class VerifyDto extends CodeRequestDto {
  @IsString()
  @Matches(/^\s*\d{6}\s*$/)
  code!: string;
}

export class ChooseProfileDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{22}$/)
  ref!: string;
}
