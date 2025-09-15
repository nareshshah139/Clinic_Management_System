import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LinkPatientUserDto {
  @IsOptional()
  @IsString()
  userId?: string; // Link to an existing user

  @IsOptional()
  @IsEmail()
  email?: string; // Create a new user if userId not provided

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