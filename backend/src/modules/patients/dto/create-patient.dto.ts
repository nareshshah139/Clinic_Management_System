import {
  IsString,
  IsOptional,
  IsDateString,
  IsPhoneNumber,
} from 'class-validator';

export class CreatePatientDto {
  @IsOptional()
  @IsString()
  abhaId?: string;

  @IsString()
  name: string;

  @IsString()
  gender: string;

  @IsDateString()
  dob: string;

  @IsPhoneNumber('IN')
  phone: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  allergies?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  referralSource?: string; // Instagram/Twitter/Google/Doctor/Friends & Family
}
