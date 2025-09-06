import { Injectable, NotFoundException, ConflictException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { CreateUserDto, UpdateUserDto, ChangePasswordDto, ResetPasswordDto, SetPasswordDto, UpdateProfileDto, AssignRoleDto, UpdatePermissionsDto, UserStatusDto, CreateBranchDto, UpdateBranchDto, CreatePermissionDto, UpdatePermissionDto, CreateRoleDto, UpdateRoleDto } from './dto/user.dto';
import { QueryUsersDto, QueryBranchesDto, QueryPermissionsDto, QueryRolesDto, UserStatisticsDto, UserActivityDto, UserDashboardDto } from './dto/query-user.dto';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // User Management Methods
  async createUser(createUserDto: CreateUserDto, branchId: string) {
    // Check if email already exists
    const existingUser = await this.prisma.user.findFirst({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Check if employee ID already exists in the branch
    if (createUserDto.employeeId) {
      const existingEmployee = await this.prisma.user.findFirst({
        where: { 
          employeeId: createUserDto.employeeId,
          branchId: createUserDto.branchId,
        },
      });

      if (existingEmployee) {
        throw new ConflictException('Employee ID already exists in this branch');
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
        branchId,
        status: UserStatus.ACTIVE,
        permissions: createUserDto.permissions ? JSON.stringify(createUserDto.permissions) : null,
        metadata: createUserDto.metadata ? JSON.stringify(createUserDto.metadata) : null,
      },
      include: {
        branch: true,
      },
    });

    return this.formatUser(user);
  }

  async findAllUsers(query: QueryUsersDto, branchId: string) {
    const { page, limit, search, role, status, department, designation, dateFrom, dateTo, isActive } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      branchId,
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) where.role = role;
    if (status) where.status = status;
    if (department) where.department = department;
    if (designation) where.designation = designation;
    if (isActive !== undefined) where.isActive = isActive;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          branch: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users: users.map(user => this.formatUser(user)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findUserById(id: string, branchId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, branchId },
      include: {
        branch: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.formatUser(user);
  }

  async updateUser(id: string, updateUserDto: UpdateUserDto, branchId: string) {
    const existingUser = await this.prisma.user.findFirst({
      where: { id, branchId },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    // Check if email already exists (excluding current user)
    if (updateUserDto.email && updateUserDto.email !== existingUser.email) {
      const emailExists = await this.prisma.user.findFirst({
        where: { 
          email: updateUserDto.email,
          id: { not: id },
        },
      });

      if (emailExists) {
        throw new ConflictException('User with this email already exists');
      }
    }

    // Check if employee ID already exists (excluding current user)
    if (updateUserDto.employeeId && updateUserDto.employeeId !== existingUser.employeeId) {
      const employeeExists = await this.prisma.user.findFirst({
        where: { 
          employeeId: updateUserDto.employeeId,
          branchId,
          id: { not: id },
        },
      });

      if (employeeExists) {
        throw new ConflictException('Employee ID already exists in this branch');
      }
    }

    const updateData: any = { ...updateUserDto };
    
    if (updateUserDto.permissions) {
      updateData.permissions = JSON.stringify(updateUserDto.permissions);
    }
    
    if (updateUserDto.metadata) {
      updateData.metadata = JSON.stringify(updateUserDto.metadata);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        branch: true,
      },
    });

    return this.formatUser(user);
  }

  async deleteUser(id: string, branchId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, branchId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user has any related records
    const hasAppointments = await this.prisma.appointment.count({
      where: { doctorId: id },
    });

    const hasVisits = await this.prisma.visit.count({
      where: { doctorId: id },
    });

    if (hasAppointments > 0 || hasVisits > 0) {
      throw new BadRequestException('Cannot delete user with existing appointments or visits');
    }

    await this.prisma.user.delete({
      where: { id },
    });

    return { message: 'User deleted successfully' };
  }

  // Password Management Methods
  async changePassword(id: string, changePasswordDto: ChangePasswordDto, branchId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.passwordHash) {
      throw new BadRequestException('User does not have a password set');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(changePasswordDto.currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Verify new password confirmation
    if (changePasswordDto.newPassword !== changePasswordDto.confirmPassword) {
      throw new BadRequestException('New password and confirmation do not match');
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(changePasswordDto.newPassword, 10);

    // Update password
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: hashedNewPassword },
    });

    return { message: 'Password changed successfully' };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: resetPasswordDto.email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate reset token
    const token = this.jwtService.sign(
      { userId: user.id, email: user.email },
      { expiresIn: '1h' }
    );

    // Store reset token
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour
      },
    });

    return {
      message: 'Password reset token generated',
      token,
    };
  }

  async setPassword(setPasswordDto: SetPasswordDto) {
    // Verify token
    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: { token: setPasswordDto.token },
    });

    if (!resetToken || resetToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Verify password confirmation
    if (setPasswordDto.password !== setPasswordDto.confirmPassword) {
      throw new BadRequestException('Password and confirmation do not match');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(setPasswordDto.password, 10);

    // Update user password
    await this.prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: hashedPassword },
    });

    // Delete reset token
    await this.prisma.passwordResetToken.delete({
      where: { id: resetToken.id },
    });

    return { message: 'Password set successfully' };
  }

  // Profile Management Methods
  async updateProfile(id: string, updateProfileDto: UpdateProfileDto, branchId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, branchId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updateData: any = { ...updateProfileDto };
    
    if (updateProfileDto.metadata) {
      updateData.metadata = JSON.stringify(updateProfileDto.metadata);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        branch: true,
      },
    });

    return this.formatUser(updatedUser);
  }

  async updateUserStatus(id: string, userStatusDto: UserStatusDto, branchId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, branchId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { status: userStatusDto.status },
      include: {
        branch: true,
      },
    });

    return this.formatUser(updatedUser);
  }

  // Role and Permission Management Methods
  async assignRole(id: string, assignRoleDto: AssignRoleDto, branchId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, branchId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const role = await this.prisma.role.findFirst({
      where: { id: assignRoleDto.roleId, branchId },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // Check if user already has this role
    const existingRole = await this.prisma.userRolePermission.findFirst({
      where: { userId: id, roleId: assignRoleDto.roleId },
    });

    if (existingRole) {
      throw new ConflictException('User already has this role');
    }

    await this.prisma.userRolePermission.create({
      data: {
        userId: id,
        roleId: assignRoleDto.roleId,
      },
    });

    const updatedUser = await this.prisma.user.findFirst({
      where: { id, branchId },
      include: {
        branch: true,
      },
    });

    return this.formatUser(updatedUser);
  }

  async updatePermissions(id: string, updatePermissionsDto: UpdatePermissionsDto, branchId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, branchId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { permissions: JSON.stringify(updatePermissionsDto.permissions) },
      include: {
        branch: true,
      },
    });

    return this.formatUser(updatedUser);
  }

  // Branch Management Methods
  async createBranch(createBranchDto: CreateBranchDto, branchId: string) {
    // Check if branch name already exists
    const existingBranch = await this.prisma.branch.findFirst({
      where: { name: createBranchDto.name },
    });

    if (existingBranch) {
      throw new ConflictException('Branch with this name already exists');
    }

    const branch = await this.prisma.branch.create({
      data: createBranchDto,
    });

    return branch;
  }

  async findAllBranches(query: QueryBranchesDto) {
    const { page, limit, search, city, state } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (city) where.city = city;
    if (state) where.state = state;

    const [branches, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.branch.count({ where }),
    ]);

    return {
      branches,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findBranchById(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
  }

  async updateBranch(id: string, updateBranchDto: UpdateBranchDto) {
    const existingBranch = await this.prisma.branch.findUnique({
      where: { id },
    });

    if (!existingBranch) {
      throw new NotFoundException('Branch not found');
    }

    // Check if branch name already exists (excluding current branch)
    if (updateBranchDto.name && updateBranchDto.name !== existingBranch.name) {
      const nameExists = await this.prisma.branch.findFirst({
        where: { 
          name: updateBranchDto.name,
          id: { not: id },
        },
      });

      if (nameExists) {
        throw new ConflictException('Branch with this name already exists');
      }
    }

    const branch = await this.prisma.branch.update({
      where: { id },
      data: updateBranchDto,
    });

    return branch;
  }

  async deleteBranch(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    // Check if branch has users
    const userCount = await this.prisma.user.count({
      where: { branchId: id },
    });

    if (userCount > 0) {
      throw new BadRequestException('Cannot delete branch with existing users');
    }

    await this.prisma.branch.delete({
      where: { id },
    });

    return { message: 'Branch deleted successfully' };
  }

  // Permission Management Methods
  async createPermission(createPermissionDto: CreatePermissionDto, branchId: string) {
    // Check if permission already exists
    const existingPermission = await this.prisma.permission.findFirst({
      where: { name: createPermissionDto.name },
    });

    if (existingPermission) {
      throw new ConflictException('Permission with this name already exists');
    }

    const permission = await this.prisma.permission.create({
      data: {
        ...createPermissionDto,
        branchId,
      },
    });

    return permission;
  }

  async findAllPermissions(query: QueryPermissionsDto, branchId: string) {
    const { page, limit, search, type } = query;
    const skip = (page - 1) * limit;

    const where: any = { branchId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (type) where.type = type;

    const [permissions, total] = await Promise.all([
      this.prisma.permission.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.permission.count({ where }),
    ]);

    return {
      permissions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPermissionById(id: string, branchId: string) {
    const permission = await this.prisma.permission.findFirst({
      where: { id, branchId },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    return permission;
  }

  async updatePermission(id: string, updatePermissionDto: UpdatePermissionDto, branchId: string) {
    const existingPermission = await this.prisma.permission.findFirst({
      where: { id, branchId },
    });

    if (!existingPermission) {
      throw new NotFoundException('Permission not found');
    }

    // Check if permission name already exists (excluding current permission)
    if (updatePermissionDto.name && updatePermissionDto.name !== existingPermission.name) {
      const nameExists = await this.prisma.permission.findFirst({
        where: { 
          name: updatePermissionDto.name,
          id: { not: id },
        },
      });

      if (nameExists) {
        throw new ConflictException('Permission with this name already exists');
      }
    }

    const permission = await this.prisma.permission.update({
      where: { id },
      data: updatePermissionDto,
    });

    return permission;
  }

  async deletePermission(id: string, branchId: string) {
    const permission = await this.prisma.permission.findFirst({
      where: { id, branchId },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    await this.prisma.permission.delete({
      where: { id },
    });

    return { message: 'Permission deleted successfully' };
  }

  // Role Management Methods
  async createRole(createRoleDto: CreateRoleDto, branchId: string) {
    // Check if role already exists
    const existingRole = await this.prisma.role.findFirst({
      where: { name: createRoleDto.name },
    });

    if (existingRole) {
      throw new ConflictException('Role with this name already exists');
    }

    const role = await this.prisma.role.create({
      data: {
        ...createRoleDto,
        branchId,
        permissions: JSON.stringify(createRoleDto.permissions || []),
      },
    });

    return {
      ...role,
      permissions: JSON.parse(role.permissions || '[]'),
    };
  }

  async findAllRoles(query: QueryRolesDto, branchId: string) {
    const { page, limit, search, isActive } = query;
    const skip = (page - 1) * limit;

    const where: any = { branchId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isActive !== undefined) where.isActive = isActive;

    const [roles, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.role.count({ where }),
    ]);

    return {
      roles: roles.map(role => ({
        ...role,
        permissions: JSON.parse(role.permissions || '[]'),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findRoleById(id: string, branchId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, branchId },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return {
      ...role,
      permissions: JSON.parse(role.permissions || '[]'),
    };
  }

  async updateRole(id: string, updateRoleDto: UpdateRoleDto, branchId: string) {
    const existingRole = await this.prisma.role.findFirst({
      where: { id, branchId },
    });

    if (!existingRole) {
      throw new NotFoundException('Role not found');
    }

    // Check if role name already exists (excluding current role)
    if (updateRoleDto.name && updateRoleDto.name !== existingRole.name) {
      const nameExists = await this.prisma.role.findFirst({
        where: { 
          name: updateRoleDto.name,
          id: { not: id },
        },
      });

      if (nameExists) {
        throw new ConflictException('Role with this name already exists');
      }
    }

    const updateData: any = { ...updateRoleDto };
    
    if (updateRoleDto.permissions) {
      updateData.permissions = JSON.stringify(updateRoleDto.permissions);
    }

    const role = await this.prisma.role.update({
      where: { id },
      data: updateData,
    });

    return {
      ...role,
      permissions: JSON.parse(role.permissions || '[]'),
    };
  }

  async deleteRole(id: string, branchId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, branchId },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // Check if role is assigned to any users
    const userCount = await this.prisma.userRolePermission.count({
      where: { roleId: id },
    });

    if (userCount > 0) {
      throw new BadRequestException('Cannot delete role that is assigned to users');
    }

    await this.prisma.role.delete({
      where: { id },
    });

    return { message: 'Role deleted successfully' };
  }

  // Statistics and Analytics Methods
  async getUserStatistics(branchId: string): Promise<UserStatisticsDto> {
    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      roleBreakdown,
      departmentBreakdown,
      recentUsers,
    ] = await Promise.all([
      this.prisma.user.count({ where: { branchId } }),
      this.prisma.user.count({ where: { branchId, status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { branchId, status: UserStatus.INACTIVE } }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: { branchId },
        _count: { role: true },
      }),
      this.prisma.user.groupBy({
        by: ['department'],
        where: { branchId, department: { not: null } },
        _count: { department: true },
      }),
      this.prisma.user.findMany({
        where: { branchId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          status: true,
        },
      }),
    ]);

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      roleBreakdown,
      departmentBreakdown,
      recentUsers,
    };
  }

  async getUserDashboard(branchId: string): Promise<UserDashboardDto> {
    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      recentUsers,
      roleBreakdown,
      topDepartments,
    ] = await Promise.all([
      this.prisma.user.count({ where: { branchId } }),
      this.prisma.user.count({ where: { branchId, status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { branchId, status: UserStatus.INACTIVE } }),
      this.prisma.user.findMany({
        where: { branchId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          createdAt: true,
        },
      }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: { branchId },
        _count: { role: true },
      }),
      this.prisma.user.groupBy({
        by: ['department'],
        where: { branchId, department: { not: null } },
        _count: { department: true },
        orderBy: { _count: { department: 'desc' } },
        take: 5,
      }),
    ]);

    return {
      summary: {
        totalUsers,
        activeUsers,
        inactiveUsers,
      },
      recentUsers,
      roleBreakdown,
      topDepartments,
    };
  }

  // Helper method to format user data
  private formatUser(user: any) {
    return {
      ...user,
      permissions: this.safeJsonParse(user.permissions, []),
      metadata: this.safeJsonParse(user.metadata, null),
    };
  }

  // Helper method to safely parse JSON
  private safeJsonParse(jsonString: any, defaultValue: any) {
    if (!jsonString) {
      return defaultValue;
    }
    
    if (typeof jsonString === 'string') {
      if (jsonString.trim() === '') {
        return defaultValue;
      }
      try {
        return JSON.parse(jsonString);
      } catch (error) {
        return defaultValue;
      }
    }
    
    // If it's already an object/array, return it as is
    return jsonString;
  }
}
