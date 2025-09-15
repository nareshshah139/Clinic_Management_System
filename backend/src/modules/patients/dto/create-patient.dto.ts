import {
  IsString,
  IsOptional,
  IsDateString,
  Matches,
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

  @Matches(/^(\+91\s?)?[6-9]\d{9}$/,{ message: 'phone must be a valid Indian mobile number' })
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

  // New optional demographics/contact fields
  @IsOptional()
  @IsString()
  secondaryPhone?: string;

  @IsOptional()
  @IsString()
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsString()
  guardianName?: string;

  // Medical history as JSON string
  @IsOptional()
  @IsString()
  medicalHistory?: string;
}
