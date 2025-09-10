import { IsString, IsOptional, IsEmail, IsEnum, IsBoolean, IsUUID, IsArray, IsDateString, MinLength, MaxLength } from 'class-validator';
import { UserRole, UserStatus } from '@prisma/client';

// User Management DTOs
export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  password: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsOptional()
  employeeId?: string;

  @IsString()
  @IsOptional()
  designation?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsDateString()
  @IsOptional()
  dateOfJoining?: Date;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  pincode?: string;

  @IsString()
  @IsOptional()
  emergencyContact?: string;

  @IsString()
  @IsOptional()
  emergencyPhone?: string;

  @IsArray()
  @IsOptional()
  permissions?: string[];

  @IsOptional()
  metadata?: any;
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(50)
  firstName?: string;

  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(50)
  lastName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsString()
  @IsOptional()
  employeeId?: string;

  @IsString()
  @IsOptional()
  designation?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsDateString()
  @IsOptional()
  dateOfJoining?: Date;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  pincode?: string;

  @IsString()
  @IsOptional()
  emergencyContact?: string;

  @IsString()
  @IsOptional()
  emergencyPhone?: string;

  @IsArray()
  @IsOptional()
  permissions?: string[];

  @IsOptional()
  metadata?: any;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  newPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  confirmPassword: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email: string;
}

export class SetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  password: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  confirmPassword: string;

  @IsString()
  resetToken: string;
}

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(50)
  firstName?: string;

  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(50)
  lastName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  pincode?: string;

  @IsString()
  @IsOptional()
  emergencyContact?: string;

  @IsString()
  @IsOptional()
  emergencyPhone?: string;
}

export class AssignRoleDto {
  @IsEnum(UserRole)
  role: UserRole;

  @IsArray()
  @IsOptional()
  permissions?: string[];
}

export class UpdatePermissionsDto {
  @IsArray()
  permissions: string[];
}

export class UserStatusDto {
  @IsEnum(UserStatus)
  status: UserStatus;

  @IsString()
  @IsOptional()
  reason?: string;
}

// Branch Management DTOs
export class CreateBranchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  address: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  pincode?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  gstNumber?: string;

  @IsString()
  @IsOptional()
  licenseNumber?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  metadata?: any;
}

export class UpdateBranchDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  pincode?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  gstNumber?: string;

  @IsString()
  @IsOptional()
  licenseNumber?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  metadata?: any;
}

// Permission Management DTOs
export class CreatePermissionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  resource: string;

  @IsString()
  action: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdatePermissionDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  resource?: string;

  @IsString()
  @IsOptional()
  action?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// Role Management DTOs
export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsOptional()
  permissions?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsOptional()
  permissions?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
