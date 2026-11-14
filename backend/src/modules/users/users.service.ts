import { Injectable, NotFoundException, ConflictException, BadRequestException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { CreateUserDto, UpdateUserDto, ChangePasswordDto, UpdateProfileDto, AssignRoleDto, UpdatePermissionsDto, UserStatusDto, CreateBranchDto, UpdateBranchDto, CreatePermissionDto, UpdatePermissionDto, CreateRoleDto, UpdateRoleDto } from './dto/user.dto';
import { QueryUsersDto, QueryBranchesDto, QueryPermissionsDto, QueryRolesDto, UserStatisticsDto, UserActivityDto, UserDashboardDto } from './dto/query-user.dto';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { readDoctorSignature, signatureDataUrl } from './doctor-signature';
import { letterheadDataUrl, readDoctorLetterhead } from './doctor-letterhead';
import { fixedGrants, permissionDeltas, tickedPermissions } from '../../shared/access/permission-grants';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async getDoctorSignature(doctorId: string, branchId: string) {
    return { signature: await readDoctorSignature(this.prisma, branchId, doctorId) };
  }

  /**
   * @cc [owner:nareshshah139,label:security] signature-owner-only
   * Signature mutations MUST require both the authenticated DOCTOR role and an
   * active doctor record matching the session user and branch; otherwise forbid.
   */
  private async requireSignatureOwner(user: { id: string; branchId: string; role: string }) {
    if (user.role !== 'DOCTOR' || !await this.prisma.user.findFirst({
      where: { id: user.id, branchId: user.branchId, role: 'DOCTOR', isActive: true },
      select: { id: true },
    })) throw new ForbiddenException('Only the logged-in doctor can change their own signature or letterhead.');
  }

  async uploadOwnSignature(user: { id: string; branchId: string; role: string }, file?: Express.Multer.File) {
    await this.requireSignatureOwner(user);
    return { signature: await this.replaceOwnAsset(user, 'SIGNATURE', 'Doctor signature', await signatureDataUrl(file)) };
  }

  /**
   * @cc [owner:nareshshah139,label:product] signature-removal-persists
   * Removing a signature MUST leave the authenticated doctor's signature absent
   * on subsequent reads, including when only the bundled default existed.
   */
  async removeOwnSignature(user: { id: string; branchId: string; role: string }) {
    await this.requireSignatureOwner(user);
    await this.replaceOwnAsset(user, 'SIGNATURE', 'Signature removed', null);
    return { signature: null };
  }

  async getDoctorLetterhead(doctorId: string, branchId: string) {
    return { letterhead: await readDoctorLetterhead(this.prisma, branchId, doctorId) };
  }

  async uploadOwnLetterhead(user: { id: string; branchId: string; role: string }, file?: Express.Multer.File) {
    await this.requireSignatureOwner(user);
    const letterhead = await this.replaceOwnAsset(user, 'LETTERHEAD', 'Doctor letterhead', await letterheadDataUrl(file));
    return { letterhead: { ...letterhead, source: 'uploaded' as const } };
  }

  /**
   * @cc [owner:nareshshah139,label:product] letterhead-removal-persists
   * Removing a letterhead MUST leave the authenticated doctor without a letterhead
   * on subsequent reads, including when only the bundled default existed.
   */
  async removeOwnLetterhead(user: { id: string; branchId: string; role: string }) {
    await this.requireSignatureOwner(user);
    await this.replaceOwnAsset(user, 'LETTERHEAD', 'Letterhead removed', null);
    return { letterhead: null };
  }

  /** Deactivates the doctor's current asset of this type; a null url records an explicit removal. */
  private async replaceOwnAsset(user: { id: string; branchId: string }, type: 'SIGNATURE' | 'LETTERHEAD', name: string, url: string | null) {
    return this.prisma.$transaction(async tx => {
      await tx.clinicAsset.updateMany({
        where: { branchId: user.branchId, ownerId: user.id, type, isActive: true },
        data: { isActive: false },
      });
      return tx.clinicAsset.create({
        data: { branchId: user.branchId, ownerId: user.id, type, name, url: url ?? '', isActive: url !== null },
        select: { id: true, url: true },
      });
    });
  }

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
          branchId: createUserDto.branchId || branchId,
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
        branchId: createUserDto.branchId || branchId,
        status: createUserDto.status ?? UserStatus.ACTIVE,
        ...(createUserDto.permissions
          ? await this.permissionColumns(createUserDto.role, createUserDto.permissions)
          : { permissions: null }),
        metadata: createUserDto.metadata ? JSON.stringify(createUserDto.metadata) : null,
      },
      include: {
        branch: true,
      },
    });

    return this.formatUser(user);
  }

  async findAllUsers(query: QueryUsersDto, branchId: string) {
    const { page = 1, limit = 10, search, role, status, department, designation, dateFrom, dateTo, isActive } = query;
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
      Object.assign(updateData, await this.permissionColumns(updateUserDto.role ?? existingUser.role, updateUserDto.permissions));
    }
    
    return this.formatUser(await this.saveUser(id, updateData));
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
  async changePassword(id: string, changePasswordDto: ChangePasswordDto, actor: { id: string; branchId: string; role: string }) {
    this.requireSelfOrManager(actor, id);
    const user = await this.prisma.user.findFirst({
      where: { id, branchId: actor.branchId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.password) {
      throw new BadRequestException('User does not have a password set');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(changePasswordDto.currentPassword, user.password);
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
      data: { password: hashedNewPassword },
    });

    return { message: 'Password changed successfully' };
  }

  // Profile Management Methods
  async updateProfile(id: string, updateProfileDto: UpdateProfileDto, actor: { id: string; branchId: string; role: string }) {
    this.requireSelfOrManager(actor, id);
    const branchId = actor.branchId;
    const user = await this.prisma.user.findFirst({
      where: { id, branchId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.formatUser(await this.saveUser(id, { ...updateProfileDto }));
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

    // Find the role by name
    const roleRecord = await this.prisma.role.findFirst({
      where: { name: assignRoleDto.role },
    });

    if (!roleRecord) {
      throw new NotFoundException('Role not found');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        role: assignRoleDto.role as UserRole,
        ...(assignRoleDto.permissions
          ? await this.permissionColumns(assignRoleDto.role, assignRoleDto.permissions)
          : { permissions: null, revokedPermissions: null }),
      },
      include: { branch: true },
    });

    return this.formatUser(updated);
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
      data: await this.permissionColumns(user.role, updatePermissionsDto.permissions),
      include: {
        branch: true,
      },
    });

    return this.formatUser(updatedUser);
  }

  async getUserPermissions(id: string, branchId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, branchId },
      select: { role: true, permissions: true, revokedPermissions: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const roleRecord = await this.prisma.role.findFirst({ where: { name: user.role }, select: { permissions: true } });
    return {
      permissions: tickedPermissions(user, roleRecord?.permissions, await this.listedPermissions()),
      always: fixedGrants(user.role),
    };
  }

  /** The two stored columns under which a user of this role may use exactly the ticked permissions. */
  private async permissionColumns(role: string, ticked: readonly string[]) {
    const roleRecord = await this.prisma.role.findFirst({ where: { name: role }, select: { permissions: true } });
    const deltas = permissionDeltas(roleRecord?.permissions, ticked, await this.listedPermissions());
    return { permissions: JSON.stringify(deltas.permissions), revokedPermissions: JSON.stringify(deltas.revokedPermissions) };
  }

  private async listedPermissions() {
    return (await this.prisma.permission.findMany({ select: { name: true } })).map((permission) => permission.name);
  }

  // Branch Management Methods
  async createBranch(createBranchDto: CreateBranchDto) {
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
    const { page = 1, limit = 10, search, city, state } = query;
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
  async createPermission(createPermissionDto: CreatePermissionDto) {
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
      },
    });

    return permission;
  }

  /**
   * @cc [owner:nareshshah139] permission-query-schema
   * Permission searches MUST apply resource, action and active filters to their stored fields;
   * omitted pagination MUST default to page one with ten results.
   */
  async findAllPermissions(query: QueryPermissionsDto) {
    const { page = 1, limit = 10, search, resource, action, isActive } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.PermissionWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (resource) where.resource = resource;
    if (action) where.action = action;
    if (isActive !== undefined) where.isActive = isActive;

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

  async findPermissionById(id: string) {
    const permission = await this.prisma.permission.findUnique({
      where: { id },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    return permission;
  }

  async updatePermission(id: string, updatePermissionDto: UpdatePermissionDto) {
    const existingPermission = await this.prisma.permission.findUnique({
      where: { id },
    });

    if (!existingPermission) {
      throw new NotFoundException('Permission not found');
    }

    const permission = await this.prisma.permission.update({
      where: { id },
      data: updatePermissionDto,
    });

    return permission;
  }

  async deletePermission(id: string) {
    const permission = await this.prisma.permission.findUnique({
      where: { id },
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
  /**
   * @cc [owner:nareshshah139] role-permissions-storage
   * Role permission arrays MUST be persisted as JSON text consumable by the permission guard.
   */
  async createRole(createRoleDto: CreateRoleDto) {
    const existingRole = await this.prisma.role.findFirst({
      where: { name: createRoleDto.name },
    });

    if (existingRole) {
      throw new ConflictException('Role with this name already exists');
    }

    const role = await this.prisma.role.create({
      data: { ...createRoleDto, permissions: createRoleDto.permissions === undefined ? null : JSON.stringify(createRoleDto.permissions) },
    });

    return role;
  }

  async findAllRoles(query: QueryRolesDto) {
    const { page = 1, limit = 10, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

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
      roles,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findRoleById(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  /**
   * @cc [owner:nareshshah139] role-permission-update
   * Permission updates MUST serialize arrays, preserve omitted permissions and allow an empty
   * array to clear permissions without granting fallback access.
   */
  async updateRole(id: string, updateRoleDto: UpdateRoleDto) {
    const existingRole = await this.prisma.role.findUnique({
      where: { id },
    });

    if (!existingRole) {
      throw new NotFoundException('Role not found');
    }

    // Check if role name already exists (excluding current)
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

    const role = await this.prisma.role.update({
      where: { id },
      data: { ...updateRoleDto, permissions: updateRoleDto.permissions === undefined ? undefined : JSON.stringify(updateRoleDto.permissions) },
    });

    return role;
  }

  async deleteRole(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    await this.prisma.role.delete({
      where: { id },
    });

    return { message: 'Role deleted successfully' };
  }

  // Statistics and Analytics Methods
  /**
   * @cc [owner:nareshshah139] user-statistics-scope
   * Statistics MUST use the authenticated branch and requested date bounds; a query branchId
   * MUST NOT override the authenticated branch.
   */
  async getUserStatistics(query: UserStatisticsDto, branchId: string) {
    const where: Prisma.UserWhereInput = { branchId, ...((query.startDate || query.endDate) ? {
      createdAt: { ...(query.startDate ? { gte: new Date(query.startDate) } : {}), ...(query.endDate ? { lte: new Date(query.endDate) } : {}) },
    } : {}) };
    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      roleBreakdown,
      departmentBreakdown,
      recentUsers,
    ] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.count({ where: { ...where, status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { ...where, status: UserStatus.INACTIVE } }),
      this.prisma.user.groupBy({
        by: ['role'],
        where,
        _count: { role: true },
      }),
      this.prisma.user.groupBy({
        by: ['department'],
        where: { ...where, department: { not: null } },
        _count: { department: true },
      }),
      this.prisma.user.findMany({
        where,
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

  /**
   * @cc [owner:nareshshah139] user-dashboard-scope
   * Dashboard aggregates MUST use the authenticated branch and requested date bounds;
   * caller-supplied branch IDs cannot broaden that scope.
   */
  async getUserDashboard(query: UserDashboardDto, branchId: string) {
    const where: Prisma.UserWhereInput = { branchId, ...((query.startDate || query.endDate) ? {
      createdAt: { ...(query.startDate ? { gte: new Date(query.startDate) } : {}), ...(query.endDate ? { lte: new Date(query.endDate) } : {}) },
    } : {}) };
    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      recentUsers,
      roleBreakdown,
      topDepartments,
    ] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.count({ where: { ...where, status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { ...where, status: UserStatus.INACTIVE } }),
      this.prisma.user.findMany({
        where,
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
        where,
        _count: { role: true },
      }),
      this.prisma.user.groupBy({
        by: ['department'],
        where: { ...where, department: { not: null } },
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

  /**
   * @cc [owner:nareshshah139,label:product] user-metadata-merge
   * Saving a user MUST merge the given metadata keys into the stored settings, so one screen's
   * save never erases another's (print layout, signature preferences, WhatsApp, working hours).
   * A key sent as null is removed. Concurrent saves of different keys MUST all be kept.
   */
  private async saveUser(id: string, data: Record<string, any>) {
    const { metadata, ...rest } = data;
    if (metadata && typeof metadata === 'object') {
      // Compare-and-swap on the stored text: a concurrent save makes the write miss and we merge again.
      for (let attempt = 0; ; attempt++) {
        const stored = await this.prisma.user.findUnique({ where: { id }, select: { metadata: true } });
        const { count } = await this.prisma.user.updateMany({
          where: { id, metadata: stored?.metadata ?? null },
          data: { metadata: JSON.stringify(mergeMetadata(stored?.metadata ?? null, metadata)) },
        });
        if (count === 1) break;
        if (attempt >= 20) throw new ConflictException('Settings changed while saving; please try again.');
      }
    }
    return this.prisma.user.update({ where: { id }, data: rest, include: { branch: true } });
  }

  /**
   * @cc [owner:nareshshah139,label:security] user-self-service
   * A user's profile and password MUST be changeable only by that user or by an OWNER, ADMIN
   * or DOCTOR (the roles RolesGuard treats as managers); every other role is forbidden.
   */
  private requireSelfOrManager(actor: { id: string; role: string }, userId: string) {
    if (actor.id !== userId && !['OWNER', 'ADMIN', 'DOCTOR'].includes(actor.role)) {
      throw new ForbiddenException('You can only change your own profile and password.');
    }
  }

  /**
   * @cc [owner:nareshshah139,label:security] user-secrets-never-returned
   * User API responses MUST NOT include password hashes, reset tokens or Google refresh tokens.
   */
  /**
   * @cc [owner:nareshshah139,label:security] whatsapp-token-never-returned
   * Formatted user responses MUST omit whatsappAccessToken from metadata while retaining
   * other settings; malformed stored metadata MUST NOT expose its raw value.
   */
  private formatUser({ password: _password, resetToken: _resetToken, resetTokenExpiry: _resetTokenExpiry, googleRefreshToken: _googleRefreshToken, ...user }: any) {
    let permissionsParsed: string[] | null = null;
    let revokedPermissionsParsed: string[] | null = null;
    let metadataParsed: any = null;
    try {
      permissionsParsed = user.permissions ? JSON.parse(user.permissions) : null;
    } catch {}
    try {
      revokedPermissionsParsed = user.revokedPermissions ? JSON.parse(user.revokedPermissions) : null;
    } catch {}
    try {
      metadataParsed = user.metadata ? JSON.parse(user.metadata) : null;
    } catch {}
    if (metadataParsed && typeof metadataParsed === 'object' && !Array.isArray(metadataParsed)) {
      delete metadataParsed.whatsappAccessToken;
    } else {
      metadataParsed = null;
    }

    return {
      ...user,
      permissions: permissionsParsed,
      revokedPermissions: revokedPermissionsParsed,
      metadata: metadataParsed,
    };
  }
}

/** Shallow-merges a metadata patch into stored JSON; null values remove keys and unreadable JSON starts empty. */
export function mergeMetadata(stored: string | null, patch: Record<string, unknown>): Record<string, unknown> {
  let current: Record<string, unknown> = {};
  try {
    const parsed = stored ? JSON.parse(stored) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) current = parsed;
  } catch {}
  const merged = { ...current, ...patch };
  for (const [key, value] of Object.entries(patch)) if (value === null) delete merged[key];
  return merged;
}
