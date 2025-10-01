import { IsString, IsOptional, IsEnum, IsBoolean, IsUUID, IsDateString } from 'class-validator';
import { UserRole, UserStatus } from '@prisma/client';

// Runtime enums for class-validator evaluation
export enum UserRoleEnum {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  DOCTOR = 'DOCTOR',
  NURSE = 'NURSE',
  RECEPTION = 'RECEPTION',
  ACCOUNTANT = 'ACCOUNTANT',
  PHARMACIST = 'PHARMACIST',
  LAB_TECH = 'LAB_TECH',
  MANAGER = 'MANAGER',
  PATIENT = 'PATIENT',
}

export enum UserStatusEnum {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING = 'PENDING',
}
import { PaginationDto } from '../../../shared/dto/pagination.dto';

// User Query DTOs
export class QueryUsersDto extends PaginationDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(UserRoleEnum)
  @IsOptional()
  role?: UserRole;

  @IsEnum(UserStatusEnum)
  @IsOptional()
  status?: UserStatus;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsString()
  @IsOptional()
  designation?: string;

  @IsDateString()
  @IsOptional()
  dateFrom?: Date;

  @IsDateString()
  @IsOptional()
  dateTo?: Date;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// Branch Query DTOs
export class QueryBranchesDto extends PaginationDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// Permission Query DTOs
export class QueryPermissionsDto extends PaginationDto {
  @IsString()
  @IsOptional()
  search?: string;

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

// Role Query DTOs
export class QueryRolesDto extends PaginationDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// User Statistics DTOs
export class UserStatisticsDto {
  @IsDateString()
  @IsOptional()
  startDate?: Date;

  @IsDateString()
  @IsOptional()
  endDate?: Date;

  @IsUUID()
  @IsOptional()
  branchId?: string;
}

// User Activity DTOs
export class UserActivityDto extends PaginationDto {
  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsDateString()
  @IsOptional()
  startDate?: Date;

  @IsDateString()
  @IsOptional()
  endDate?: Date;

  @IsString()
  @IsOptional()
  action?: string;
}

// User Dashboard DTOs
export class UserDashboardDto {
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsDateString()
  @IsOptional()
  startDate?: Date;

  @IsDateString()
  @IsOptional()
  endDate?: Date;
}
