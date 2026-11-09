import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LinkPatientUserDto {
  @IsOptional()
  @IsString()
  userId?: string; // Link to an existing user

  @IsOptional()
  @IsEmail()
  email?: string; // Link an existing patient account, or create one with the required fields

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
} 