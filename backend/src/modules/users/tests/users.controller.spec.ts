import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from '../users.controller';
import { UsersService } from '../users.service';
import { CreateUserDto, UpdateUserDto, ChangePasswordDto, ResetPasswordDto, SetPasswordDto, UpdateProfileDto, AssignRoleDto, UpdatePermissionsDto, UserStatusDto, CreateBranchDto, UpdateBranchDto, CreatePermissionDto, UpdatePermissionDto, CreateRoleDto, UpdateRoleDto } from '../dto/user.dto';
import { QueryUsersDto, QueryBranchesDto, QueryPermissionsDto, QueryRolesDto, UserStatisticsDto, UserActivityDto, UserDashboardDto } from '../dto/query-user.dto';
import { UserRole, UserStatus } from '@prisma/client';

describe('UsersController', () => {
  let controller: UsersController;
  let mockUsersService: any;

  beforeEach(async () => {
    mockUsersService = {
      createUser: jest.fn(),
      findAllUsers: jest.fn(),
      findUserById: jest.fn(),
      updateUser: jest.fn(),
      deleteUser: jest.fn(),
      changePassword: jest.fn(),
      resetPassword: jest.fn(),
      setPassword: jest.fn(),
      updateProfile: jest.fn(),
      assignRole: jest.fn(),
      updatePermissions: jest.fn(),
      updateUserStatus: jest.fn(),
      createBranch: jest.fn(),
      findAllBranches: jest.fn(),
      findBranchById: jest.fn(),
      updateBranch: jest.fn(),
      deleteBranch: jest.fn(),
      createPermission: jest.fn(),
      findAllPermissions: jest.fn(),
      findPermissionById: jest.fn(),
      updatePermission: jest.fn(),
      deletePermission: jest.fn(),
      createRole: jest.fn(),
      findAllRoles: jest.fn(),
      findRoleById: jest.fn(),
      updateRole: jest.fn(),
      deleteRole: jest.fn(),
      getUserStatistics: jest.fn(),
      getUserDashboard: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('User Management', () => {
    const mockRequest = {
      user: {
        id: 'user-123',
        branchId: 'branch-123',
        role: 'ADMIN',
      },
    };

    const createUserDto: CreateUserDto = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      password: 'password123',
      phone: '1234567890',
      role: UserRole.DOCTOR,
      branchId: 'branch-123',
      employeeId: 'EMP001',
      designation: 'Senior Doctor',
      department: 'Dermatology',
    };

    const mockUser = {
      id: 'user-123',
      ...createUserDto,
      permissions: [],
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create a user', async () => {
      mockUsersService.createUser.mockResolvedValue(mockUser);

      const result = await controller.createUser(createUserDto, mockRequest as any);

      expect(result).toEqual(mockUser);
      expect(mockUsersService.createUser).toHaveBeenCalledWith(createUserDto, 'branch-123');
    });

    it('should find all users', async () => {
      const query: QueryUsersDto = {
        page: 1,
        limit: 10,
        search: 'John',
        role: UserRole.DOCTOR,
        status: UserStatus.ACTIVE,
      };

      const mockResponse = {
        users: [mockUser],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      };

      mockUsersService.findAllUsers.mockResolvedValue(mockResponse);

      const result = await controller.findAllUsers(query, mockRequest as any);

      expect(result).toEqual(mockResponse);
      expect(mockUsersService.findAllUsers).toHaveBeenCalledWith(query, 'branch-123');
    });

    it('should find user by id', async () => {
      mockUsersService.findUserById.mockResolvedValue(mockUser);

      const result = await controller.findUserById('user-123', mockRequest as any);

      expect(result).toEqual(mockUser);
      expect(mockUsersService.findUserById).toHaveBeenCalledWith('user-123', 'branch-123');
    });

    it('should update user', async () => {
      const updateUserDto: UpdateUserDto = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
      };

      const updatedUser = { ...mockUser, ...updateUserDto };

      mockUsersService.updateUser.mockResolvedValue(updatedUser);

      const result = await controller.updateUser('user-123', updateUserDto, mockRequest as any);

      expect(result).toEqual(updatedUser);
      expect(mockUsersService.updateUser).toHaveBeenCalledWith('user-123', updateUserDto, 'branch-123');
    });

    it('should delete user', async () => {
      mockUsersService.deleteUser.mockResolvedValue({ message: 'User deleted successfully' });

      const result = await controller.deleteUser('user-123', mockRequest as any);

      expect(result).toEqual({ message: 'User deleted successfully' });
      expect(mockUsersService.deleteUser).toHaveBeenCalledWith('user-123', 'branch-123');
    });

    it('should change password', async () => {
      const changePasswordDto: ChangePasswordDto = {
        currentPassword: 'oldPassword',
        newPassword: 'newPassword',
        confirmPassword: 'newPassword',
      };

      mockUsersService.changePassword.mockResolvedValue({ message: 'Password changed successfully' });

      const result = await controller.changePassword('user-123', changePasswordDto, mockRequest as any);

      expect(result).toEqual({ message: 'Password changed successfully' });
      expect(mockUsersService.changePassword).toHaveBeenCalledWith('user-123', changePasswordDto, 'branch-123');
    });

    it('should reset password', async () => {
      const resetPasswordDto: ResetPasswordDto = {
        email: 'john@example.com',
      };

      mockUsersService.resetPassword.mockResolvedValue({
        message: 'Password reset token generated',
        resetToken: 'reset-token',
      });

      const result = await controller.resetPassword(resetPasswordDto);

      expect(result).toEqual({
        message: 'Password reset token generated',
        resetToken: 'reset-token',
      });
      expect(mockUsersService.resetPassword).toHaveBeenCalledWith(resetPasswordDto);
    });

    it('should set password', async () => {
      const setPasswordDto: SetPasswordDto = {
        password: 'newPassword',
        confirmPassword: 'newPassword',
        resetToken: 'reset-token',
      };

      mockUsersService.setPassword.mockResolvedValue({ message: 'Password set successfully' });

      const result = await controller.setPassword(setPasswordDto);

      expect(result).toEqual({ message: 'Password set successfully' });
      expect(mockUsersService.setPassword).toHaveBeenCalledWith(setPasswordDto);
    });

    it('should update profile', async () => {
      const updateProfileDto: UpdateProfileDto = {
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '9876543210',
      };

      const updatedUser = { ...mockUser, ...updateProfileDto };

      mockUsersService.updateProfile.mockResolvedValue(updatedUser);

      const result = await controller.updateProfile('user-123', updateProfileDto, mockRequest as any);

      expect(result).toEqual(updatedUser);
      expect(mockUsersService.updateProfile).toHaveBeenCalledWith('user-123', updateProfileDto, 'branch-123');
    });

    it('should assign role', async () => {
      const assignRoleDto: AssignRoleDto = {
        role: UserRole.MANAGER,
        permissions: ['read', 'write'],
      };

      const updatedUser = { ...mockUser, role: UserRole.MANAGER };

      mockUsersService.assignRole.mockResolvedValue(updatedUser);

      const result = await controller.assignRole('user-123', assignRoleDto, mockRequest as any);

      expect(result).toEqual(updatedUser);
      expect(mockUsersService.assignRole).toHaveBeenCalledWith('user-123', assignRoleDto, 'branch-123');
    });

    it('should update permissions', async () => {
      const updatePermissionsDto: UpdatePermissionsDto = {
        permissions: ['read', 'write', 'delete'],
      };

      const updatedUser = { ...mockUser, permissions: ['read', 'write', 'delete'] };

      mockUsersService.updatePermissions.mockResolvedValue(updatedUser);

      const result = await controller.updatePermissions('user-123', updatePermissionsDto, mockRequest as any);

      expect(result).toEqual(updatedUser);
      expect(mockUsersService.updatePermissions).toHaveBeenCalledWith('user-123', updatePermissionsDto, 'branch-123');
    });

    it('should update user status', async () => {
      const userStatusDto: UserStatusDto = {
        status: UserStatus.INACTIVE,
        reason: 'Resigned',
      };

      const updatedUser = { ...mockUser, status: UserStatus.INACTIVE };

      mockUsersService.updateUserStatus.mockResolvedValue(updatedUser);

      const result = await controller.updateUserStatus('user-123', userStatusDto, mockRequest as any);

      expect(result).toEqual(updatedUser);
      expect(mockUsersService.updateUserStatus).toHaveBeenCalledWith('user-123', userStatusDto, 'branch-123');
    });
  });

  describe('Branch Management', () => {
    const createBranchDto: CreateBranchDto = {
      name: 'New Branch',
      address: '123 Main St',
      city: 'Hyderabad',
      state: 'Telangana',
    };

    const mockBranch = {
      id: 'branch-123',
      ...createBranchDto,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create branch', async () => {
      mockUsersService.createBranch.mockResolvedValue(mockBranch);

      const result = await controller.createBranch(createBranchDto);

      expect(result).toEqual(mockBranch);
      expect(mockUsersService.createBranch).toHaveBeenCalledWith(createBranchDto);
    });

    it('should find all branches', async () => {
      const query: QueryBranchesDto = {
        page: 1,
        limit: 10,
        search: 'Main',
        city: 'Hyderabad',
        isActive: true,
      };

      const mockResponse = {
        branches: [mockBranch],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      };

      mockUsersService.findAllBranches.mockResolvedValue(mockResponse);

      const result = await controller.findAllBranches(query);

      expect(result).toEqual(mockResponse);
      expect(mockUsersService.findAllBranches).toHaveBeenCalledWith(query);
    });

    it('should find branch by id', async () => {
      mockUsersService.findBranchById.mockResolvedValue(mockBranch);

      const result = await controller.findBranchById('branch-123');

      expect(result).toEqual(mockBranch);
      expect(mockUsersService.findBranchById).toHaveBeenCalledWith('branch-123');
    });

    it('should update branch', async () => {
      const updateBranchDto: UpdateBranchDto = {
        name: 'Updated Branch',
        city: 'Mumbai',
      };

      const updatedBranch = { ...mockBranch, ...updateBranchDto };

      mockUsersService.updateBranch.mockResolvedValue(updatedBranch);

      const result = await controller.updateBranch('branch-123', updateBranchDto);

      expect(result).toEqual(updatedBranch);
      expect(mockUsersService.updateBranch).toHaveBeenCalledWith('branch-123', updateBranchDto);
    });

    it('should delete branch', async () => {
      mockUsersService.deleteBranch.mockResolvedValue({ message: 'Branch deleted successfully' });

      const result = await controller.deleteBranch('branch-123');

      expect(result).toEqual({ message: 'Branch deleted successfully' });
      expect(mockUsersService.deleteBranch).toHaveBeenCalledWith('branch-123');
    });
  });

  describe('Permission Management', () => {
    const createPermissionDto: CreatePermissionDto = {
      name: 'Read Users',
      description: 'Permission to read user data',
      resource: 'users',
      action: 'read',
    };

    const mockPermission = {
      id: 'permission-123',
      ...createPermissionDto,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create permission', async () => {
      mockUsersService.createPermission.mockResolvedValue(mockPermission);

      const result = await controller.createPermission(createPermissionDto);

      expect(result).toEqual(mockPermission);
      expect(mockUsersService.createPermission).toHaveBeenCalledWith(createPermissionDto);
    });

    it('should find all permissions', async () => {
      const query: QueryPermissionsDto = {
        page: 1,
        limit: 10,
        search: 'read',
        resource: 'users',
        action: 'read',
        isActive: true,
      };

      const mockResponse = {
        permissions: [mockPermission],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      };

      mockUsersService.findAllPermissions.mockResolvedValue(mockResponse);

      const result = await controller.findAllPermissions(query);

      expect(result).toEqual(mockResponse);
      expect(mockUsersService.findAllPermissions).toHaveBeenCalledWith(query);
    });

    it('should find permission by id', async () => {
      mockUsersService.findPermissionById.mockResolvedValue(mockPermission);

      const result = await controller.findPermissionById('permission-123');

      expect(result).toEqual(mockPermission);
      expect(mockUsersService.findPermissionById).toHaveBeenCalledWith('permission-123');
    });

    it('should update permission', async () => {
      const updatePermissionDto: UpdatePermissionDto = {
        name: 'Updated Permission',
        description: 'Updated description',
      };

      const updatedPermission = { ...mockPermission, ...updatePermissionDto };

      mockUsersService.updatePermission.mockResolvedValue(updatedPermission);

      const result = await controller.updatePermission('permission-123', updatePermissionDto);

      expect(result).toEqual(updatedPermission);
      expect(mockUsersService.updatePermission).toHaveBeenCalledWith('permission-123', updatePermissionDto);
    });

    it('should delete permission', async () => {
      mockUsersService.deletePermission.mockResolvedValue({ message: 'Permission deleted successfully' });

      const result = await controller.deletePermission('permission-123');

      expect(result).toEqual({ message: 'Permission deleted successfully' });
      expect(mockUsersService.deletePermission).toHaveBeenCalledWith('permission-123');
    });
  });

  describe('Role Management', () => {
    const createRoleDto: CreateRoleDto = {
      name: 'Manager',
      description: 'Manager role',
      permissions: ['read', 'write'],
    };

    const mockRole = {
      id: 'role-123',
      ...createRoleDto,
      permissions: ['read', 'write'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create role', async () => {
      mockUsersService.createRole.mockResolvedValue(mockRole);

      const result = await controller.createRole(createRoleDto);

      expect(result).toEqual(mockRole);
      expect(mockUsersService.createRole).toHaveBeenCalledWith(createRoleDto);
    });

    it('should find all roles', async () => {
      const query: QueryRolesDto = {
        page: 1,
        limit: 10,
        search: 'Manager',
        isActive: true,
      };

      const mockResponse = {
        roles: [mockRole],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      };

      mockUsersService.findAllRoles.mockResolvedValue(mockResponse);

      const result = await controller.findAllRoles(query);

      expect(result).toEqual(mockResponse);
      expect(mockUsersService.findAllRoles).toHaveBeenCalledWith(query);
    });

    it('should find role by id', async () => {
      mockUsersService.findRoleById.mockResolvedValue(mockRole);

      const result = await controller.findRoleById('role-123');

      expect(result).toEqual(mockRole);
      expect(mockUsersService.findRoleById).toHaveBeenCalledWith('role-123');
    });

    it('should update role', async () => {
      const updateRoleDto: UpdateRoleDto = {
        name: 'Updated Manager',
        description: 'Updated description',
        permissions: ['read', 'write', 'delete'],
      };

      const updatedRole = { ...mockRole, ...updateRoleDto };

      mockUsersService.updateRole.mockResolvedValue(updatedRole);

      const result = await controller.updateRole('role-123', updateRoleDto);

      expect(result).toEqual(updatedRole);
      expect(mockUsersService.updateRole).toHaveBeenCalledWith('role-123', updateRoleDto);
    });

    it('should delete role', async () => {
      mockUsersService.deleteRole.mockResolvedValue({ message: 'Role deleted successfully' });

      const result = await controller.deleteRole('role-123');

      expect(result).toEqual({ message: 'Role deleted successfully' });
      expect(mockUsersService.deleteRole).toHaveBeenCalledWith('role-123');
    });
  });

  describe('Statistics and Dashboard', () => {
    const mockRequest = {
      user: {
        id: 'user-123',
        branchId: 'branch-123',
        role: 'ADMIN',
      },
    };

    it('should get user statistics', async () => {
      const query: UserStatisticsDto = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      };

      const mockStats = {
        totalUsers: 10,
        activeUsers: 8,
        inactiveUsers: 2,
        roleBreakdown: [
          { role: 'DOCTOR', _count: { id: 5 } },
          { role: 'NURSE', _count: { id: 3 } },
        ],
        departmentBreakdown: [
          { department: 'Dermatology', _count: { id: 4 } },
          { department: 'General', _count: { id: 4 } },
        ],
        recentUsers: [
          {
            id: 'user-1',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            role: 'DOCTOR',
            createdAt: new Date(),
          },
        ],
      };

      mockUsersService.getUserStatistics.mockResolvedValue(mockStats);

      const result = await controller.getUserStatistics(query, mockRequest as any);

      expect(result).toEqual(mockStats);
      expect(mockUsersService.getUserStatistics).toHaveBeenCalledWith(query, 'branch-123');
    });

    it('should get user dashboard', async () => {
      const query: UserDashboardDto = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      };

      const mockDashboard = {
        summary: {
          totalUsers: 10,
          activeUsers: 8,
          inactiveUsers: 2,
        },
        roleBreakdown: [
          { role: 'DOCTOR', _count: { id: 5 } },
          { role: 'NURSE', _count: { id: 3 } },
        ],
        recentUsers: [
          {
            id: 'user-1',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            role: 'DOCTOR',
            department: 'Dermatology',
            createdAt: new Date(),
          },
        ],
        topDepartments: [
          { department: 'Dermatology', _count: { id: 4 } },
          { department: 'General', _count: { id: 4 } },
        ],
      };

      mockUsersService.getUserDashboard.mockResolvedValue(mockDashboard);

      const result = await controller.getUserDashboard(query, mockRequest as any);

      expect(result).toEqual(mockDashboard);
      expect(mockUsersService.getUserDashboard).toHaveBeenCalledWith(query, 'branch-123');
    });
  });
});
