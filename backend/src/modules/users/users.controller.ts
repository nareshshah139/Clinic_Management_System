import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Request, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, ChangePasswordDto, ResetPasswordDto, SetPasswordDto, UpdateProfileDto, AssignRoleDto, UpdatePermissionsDto, UserStatusDto, CreateBranchDto, UpdateBranchDto, CreatePermissionDto, UpdatePermissionDto, CreateRoleDto, UpdateRoleDto } from './dto/user.dto';
import { QueryUsersDto, QueryBranchesDto, QueryPermissionsDto, QueryRolesDto, UserStatisticsDto, UserActivityDto, UserDashboardDto } from './dto/query-user.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

interface AuthenticatedRequest {
  user: {
    id: string;
    branchId: string;
    role: string;
  };
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // User Management Endpoints
  @Post()
  createUser(@Body() createUserDto: CreateUserDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.createUser(createUserDto, req.user.branchId);
  }

  @Get()
  findAllUsers(@Query() query: QueryUsersDto, @Request() req: AuthenticatedRequest) {
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
  updateUser(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.updateUser(id, updateUserDto, req.user.branchId);
  }

  @Delete(':id')
  deleteUser(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.usersService.deleteUser(id, req.user.branchId);
  }

  @Post(':id/change-password')
  changePassword(@Param('id') id: string, @Body() changePasswordDto: ChangePasswordDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.changePassword(id, changePasswordDto, req.user.branchId);
  }

  @Post('reset-password')
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.usersService.resetPassword(resetPasswordDto);
  }

  @Post('set-password')
  setPassword(@Body() setPasswordDto: SetPasswordDto) {
    return this.usersService.setPassword(setPasswordDto);
  }

  @Patch(':id/profile')
  updateProfile(@Param('id') id: string, @Body() updateProfileDto: UpdateProfileDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.updateProfile(id, updateProfileDto, req.user.branchId);
  }

  @Patch(':id/role')
  assignRole(@Param('id') id: string, @Body() assignRoleDto: AssignRoleDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.assignRole(id, assignRoleDto, req.user.branchId);
  }

  @Patch(':id/permissions')
  updatePermissions(@Param('id') id: string, @Body() updatePermissionsDto: UpdatePermissionsDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.updatePermissions(id, updatePermissionsDto, req.user.branchId);
  }

  @Patch(':id/status')
  updateUserStatus(@Param('id') id: string, @Body() userStatusDto: UserStatusDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.updateUserStatus(id, userStatusDto, req.user.branchId);
  }

  // Branch Management Endpoints
  @Post('branches')
  createBranch(@Body() createBranchDto: CreateBranchDto) {
    return this.usersService.createBranch(createBranchDto);
  }

  @Get('branches')
  findAllBranches(@Query() query: QueryBranchesDto) {
    return this.usersService.findAllBranches(query);
  }

  @Get('branches/:id')
  findBranchById(@Param('id') id: string) {
    return this.usersService.findBranchById(id);
  }

  @Patch('branches/:id')
  updateBranch(@Param('id') id: string, @Body() updateBranchDto: UpdateBranchDto) {
    return this.usersService.updateBranch(id, updateBranchDto);
  }

  @Delete('branches/:id')
  deleteBranch(@Param('id') id: string) {
    return this.usersService.deleteBranch(id);
  }

  // Permission Management Endpoints
  @Post('permissions')
  createPermission(@Body() createPermissionDto: CreatePermissionDto) {
    return this.usersService.createPermission(createPermissionDto);
  }

  @Get('permissions')
  findAllPermissions(@Query() query: QueryPermissionsDto) {
    return this.usersService.findAllPermissions(query);
  }

  @Get('permissions/:id')
  findPermissionById(@Param('id') id: string) {
    return this.usersService.findPermissionById(id);
  }

  @Patch('permissions/:id')
  updatePermission(@Param('id') id: string, @Body() updatePermissionDto: UpdatePermissionDto) {
    return this.usersService.updatePermission(id, updatePermissionDto);
  }

  @Delete('permissions/:id')
  deletePermission(@Param('id') id: string) {
    return this.usersService.deletePermission(id);
  }

  // Role Management Endpoints
  @Post('roles')
  createRole(@Body() createRoleDto: CreateRoleDto) {
    return this.usersService.createRole(createRoleDto);
  }

  @Get('roles')
  findAllRoles(@Query() query: QueryRolesDto) {
    return this.usersService.findAllRoles(query);
  }

  @Get('roles/:id')
  findRoleById(@Param('id') id: string) {
    return this.usersService.findRoleById(id);
  }

  @Patch('roles/:id')
  updateRole(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.usersService.updateRole(id, updateRoleDto);
  }

  @Delete('roles/:id')
  deleteRole(@Param('id') id: string) {
    return this.usersService.deleteRole(id);
  }
}
