import { CLINIC_STAFF_ROLES } from '../../shared/decorators/clinic-staff-roles';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Request, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_SIGNATURE_BYTES } from './doctor-signature';
import { MAX_LETTERHEAD_BYTES } from './doctor-letterhead';
import { ValidationPipe } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, ChangePasswordDto, UpdateProfileDto, AssignRoleDto, UpdatePermissionsDto, UserStatusDto, CreateBranchDto, UpdateBranchDto, CreatePermissionDto, UpdatePermissionDto, CreateRoleDto, UpdateRoleDto } from './dto/user.dto';
import { QueryUsersDto, QueryBranchesDto, QueryPermissionsDto, QueryRolesDto, UserStatisticsDto, UserActivityDto, UserDashboardDto } from './dto/query-user.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Authenticated, Roles } from '../../shared/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

/**
 * @cc [owner:nareshshah139,label:security] user-admin-writes-managers-only
 * Creating, editing or deleting a user, changing a user's role, permissions or status, and every
 * branch, permission and role write MUST succeed for OWNER, ADMIN and DOCTOR and MUST return 403
 * without writing for every other role, including when the caller targets their own record.
 */
const MANAGE = [UserRole.OWNER, UserRole.ADMIN];

interface AuthenticatedRequest {
  user: {
    id: string;
    branchId: string;
    role: string;
  };
}

@Controller('users')
@Roles(...CLINIC_STAFF_ROLES)
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * @cc [owner:nareshshah139,label:security] me-assets-act-on-caller
   * The /users/me signature and letterhead routes MUST change only the session caller's own asset;
   * an id in the body or query MUST NOT redirect the write. A caller who is not an active DOCTOR
   * MUST get 403 without a write.
   */
  @Post('me/signature')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIGNATURE_BYTES, files: 1 } }))
  uploadOwnSignature(@Request() req: AuthenticatedRequest, @UploadedFile() file?: Express.Multer.File) {
    return this.usersService.uploadOwnSignature(req.user, file);
  }

  @Delete('me/signature')
  removeOwnSignature(@Request() req: AuthenticatedRequest) {
    return this.usersService.removeOwnSignature(req.user);
  }

  @Get(':id/signature')
  getDoctorSignature(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.usersService.getDoctorSignature(id, req.user.branchId);
  }

  @Post('me/letterhead')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_LETTERHEAD_BYTES, files: 1 } }))
  uploadOwnLetterhead(@Request() req: AuthenticatedRequest, @UploadedFile() file?: Express.Multer.File) {
    return this.usersService.uploadOwnLetterhead(req.user, file);
  }

  @Delete('me/letterhead')
  removeOwnLetterhead(@Request() req: AuthenticatedRequest) {
    return this.usersService.removeOwnLetterhead(req.user);
  }

  @Get(':id/letterhead')
  getDoctorLetterhead(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.usersService.getDoctorLetterhead(id, req.user.branchId);
  }

  // User Management Endpoints
  @Post()
  @Roles(...MANAGE)
  createUser(@Body() createUserDto: CreateUserDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.createUser(createUserDto, req.user.branchId);
  }

  @Get()
  findAllUsers(@Query(new ValidationPipe({ transform: true })) query: QueryUsersDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.findAllUsers(query, req.user.branchId);
  }

  @Get('statistics')
  getUserStatistics(@Query() query: UserStatisticsDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.getUserStatistics(query, req.user.branchId);
  }

  @Get('dashboard')
  getUserDashboard(@Query() query: UserDashboardDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.getUserDashboard(query, req.user.branchId);
  }

  @Get(':id')
  findUserById(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.usersService.findUserById(id, req.user.branchId);
  }

  @Patch(':id')
  @Roles(...MANAGE)
  updateUser(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.updateUser(id, updateUserDto, req.user.branchId);
  }

  @Delete(':id')
  @Roles(...MANAGE)
  deleteUser(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.usersService.deleteUser(id, req.user.branchId);
  }

  @Post(':id/change-password')
  @Authenticated()
  changePassword(@Param('id') id: string, @Body() changePasswordDto: ChangePasswordDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.changePassword(id, changePasswordDto, req.user);
  }



  @Patch(':id/profile')
  @Authenticated()
  updateProfile(@Param('id') id: string, @Body() updateProfileDto: UpdateProfileDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.updateProfile(id, updateProfileDto, req.user);
  }

  @Patch(':id/role')
  @Roles(...MANAGE)
  assignRole(@Param('id') id: string, @Body() assignRoleDto: AssignRoleDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.assignRole(id, assignRoleDto, req.user.branchId);
  }

  @Patch(':id/permissions')
  @Roles(...MANAGE)
  updatePermissions(@Param('id') id: string, @Body() updatePermissionsDto: UpdatePermissionsDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.updatePermissions(id, updatePermissionsDto, req.user.branchId);
  }

  @Patch(':id/status')
  @Roles(...MANAGE)
  updateUserStatus(@Param('id') id: string, @Body() userStatusDto: UserStatusDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.updateUserStatus(id, userStatusDto, req.user.branchId);
  }

  // Branch Management Endpoints
  @Post('branches')
  @Roles(...MANAGE)
  createBranch(@Body() createBranchDto: CreateBranchDto) {
    return this.usersService.createBranch(createBranchDto);
  }

  @Get('branches')
  findAllBranches(@Query(new ValidationPipe({ transform: true })) query: QueryBranchesDto) {
    return this.usersService.findAllBranches(query);
  }

  @Get('branches/:id')
  findBranchById(@Param('id') id: string) {
    return this.usersService.findBranchById(id);
  }

  @Patch('branches/:id')
  @Roles(...MANAGE)
  updateBranch(@Param('id') id: string, @Body() updateBranchDto: UpdateBranchDto) {
    return this.usersService.updateBranch(id, updateBranchDto);
  }

  @Delete('branches/:id')
  @Roles(...MANAGE)
  deleteBranch(@Param('id') id: string) {
    return this.usersService.deleteBranch(id);
  }

  // Permission Management Endpoints
  @Post('permissions')
  @Roles(...MANAGE)
  createPermission(@Body() createPermissionDto: CreatePermissionDto) {
    return this.usersService.createPermission(createPermissionDto);
  }

  @Get('permissions')
  findAllPermissions(@Query(new ValidationPipe({ transform: true })) query: QueryPermissionsDto) {
    return this.usersService.findAllPermissions(query);
  }

  @Get('permissions/:id')
  findPermissionById(@Param('id') id: string) {
    return this.usersService.findPermissionById(id);
  }

  @Patch('permissions/:id')
  @Roles(...MANAGE)
  updatePermission(@Param('id') id: string, @Body() updatePermissionDto: UpdatePermissionDto) {
    return this.usersService.updatePermission(id, updatePermissionDto);
  }

  @Delete('permissions/:id')
  @Roles(...MANAGE)
  deletePermission(@Param('id') id: string) {
    return this.usersService.deletePermission(id);
  }

  // Role Management Endpoints
  @Post('roles')
  @Roles(...MANAGE)
  createRole(@Body() createRoleDto: CreateRoleDto) {
    return this.usersService.createRole(createRoleDto);
  }

  @Get('roles')
  findAllRoles(@Query(new ValidationPipe({ transform: true })) query: QueryRolesDto) {
    return this.usersService.findAllRoles(query);
  }

  @Get('roles/:id')
  findRoleById(@Param('id') id: string) {
    return this.usersService.findRoleById(id);
  }

  @Patch('roles/:id')
  @Roles(...MANAGE)
  updateRole(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.usersService.updateRole(id, updateRoleDto);
  }

  @Delete('roles/:id')
  @Roles(...MANAGE)
  deleteRole(@Param('id') id: string) {
    return this.usersService.deleteRole(id);
  }
}
