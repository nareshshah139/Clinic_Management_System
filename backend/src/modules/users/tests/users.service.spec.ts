import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('UsersService', () => {
  let service: UsersService;
  let mockPrisma: any;
  let mockJwtService: any;

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        groupBy: jest.fn(),
      },
      branch: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      permission: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      role: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      appointment: {
        count: jest.fn(),
      },
      visit: {
        count: jest.fn(),
      },
    };

    mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUser', () => {
    const createUserDto = {
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
      password: 'hashedPassword',
      status: UserStatus.ACTIVE,
      permissions: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      branch: { id: 'branch-123', name: 'Main Branch' },
    };

    it('should create a user successfully', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const result = await service.createUser(createUserDto, 'branch-123');

      expect(result).toEqual({
        ...mockUser,
        permissions: [],
        metadata: null,
      });
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: createUserDto.email },
      });
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'existing-user' });

      await expect(service.createUser(createUserDto, 'branch-123')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if employee ID already exists', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(null) // Email check passes
        .mockResolvedValueOnce({ id: 'existing-employee' }); // Employee ID check fails

      await expect(service.createUser(createUserDto, 'branch-123')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAllUsers', () => {
    const query = {
      page: 1,
      limit: 10,
      search: 'John',
      role: UserRole.DOCTOR,
      status: UserStatus.ACTIVE,
    };

    const mockUsers = [
      {
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        role: UserRole.DOCTOR,
        status: UserStatus.ACTIVE,
        permissions: null,
        metadata: null,
        branch: { id: 'branch-123', name: 'Main Branch' },
      },
    ];

    it('should return paginated users', async () => {
      mockPrisma.user.findMany.mockResolvedValue(mockUsers);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.findAllUsers(query, 'branch-123');

      expect(result).toEqual({
        users: mockUsers.map(user => ({
          ...user,
          permissions: [],
          metadata: null,
        })),
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      });
    });
  });

  describe('findUserById', () => {
    const mockUser = {
      id: 'user-123',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: UserRole.DOCTOR,
      status: UserStatus.ACTIVE,
      permissions: '["read", "write"]',
      metadata: '{"key": "value"}',
      branch: { id: 'branch-123', name: 'Main Branch' },
    };

    it('should return user by id', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.findUserById('user-123', 'branch-123');

      expect(result).toEqual({
        ...mockUser,
        permissions: ['read', 'write'],
        metadata: { key: 'value' },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.findUserById('user-123', 'branch-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateUser', () => {
    const updateUserDto = {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@example.com',
    };

    const existingUser = {
      id: 'user-123',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      employeeId: 'EMP001',
    };

    const updatedUser = {
      id: 'user-123',
      ...updateUserDto,
      permissions: null,
      metadata: null,
      branch: { id: 'branch-123', name: 'Main Branch' },
    };

    it('should update user successfully', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(existingUser) // First call for user existence
        .mockResolvedValueOnce(null) // Second call for email check
        .mockResolvedValueOnce(null); // Third call for employee ID check
      mockPrisma.user.findFirst.mockResolvedValue(existingUser);
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateUser('user-123', updateUserDto, 'branch-123');

      expect(result).toEqual({
        ...updatedUser,
        permissions: [],
        metadata: null,
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.updateUser('user-123', updateUserDto, 'branch-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteUser', () => {
    const mockUser = {
      id: 'user-123',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should delete user successfully', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.appointment.count.mockResolvedValue(0);
      mockPrisma.visit.count.mockResolvedValue(0);
      mockPrisma.user.delete.mockResolvedValue(mockUser);

      const result = await service.deleteUser('user-123', 'branch-123');

      expect(result).toEqual({ message: 'User deleted successfully' });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.deleteUser('user-123', 'branch-123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if user has appointments', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.appointment.count.mockResolvedValue(1);

      await expect(service.deleteUser('user-123', 'branch-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('changePassword', () => {
    const changePasswordDto = {
      currentPassword: 'oldPassword',
      newPassword: 'newPassword',
      confirmPassword: 'newPassword',
    };

    const mockUser = {
      id: 'user-123',
      password: 'hashedOldPassword',
    };

    it('should change password successfully', async () => {
      const bcrypt = require('bcrypt');
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      bcrypt.hash.mockResolvedValue('hashedNewPassword');
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.changePassword('user-123', changePasswordDto, 'branch-123');

      expect(result).toEqual({ message: 'Password changed successfully' });
    });

    it('should throw UnauthorizedException if current password is incorrect', async () => {
      const bcrypt = require('bcrypt');
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(false);

      await expect(service.changePassword('user-123', changePasswordDto, 'branch-123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw BadRequestException if passwords do not match', async () => {
      const bcrypt = require('bcrypt');
      bcrypt.compare.mockResolvedValueOnce(true);
      const invalidDto = {
        ...changePasswordDto,
        confirmPassword: 'differentPassword',
      };

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      await expect(service.changePassword('user-123', invalidDto, 'branch-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('resetPassword', () => {
    const resetPasswordDto = {
      email: 'john@example.com',
    };

    const mockUser = {
      id: 'user-123',
      email: 'john@example.com',
    };

    it('should generate reset token successfully', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('reset-token');
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.resetPassword(resetPasswordDto);

      expect(result).toEqual({
        message: 'Password reset token generated',
        resetToken: 'reset-token',
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.resetPassword(resetPasswordDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setPassword', () => {
    const setPasswordDto = {
      password: 'newPassword',
      confirmPassword: 'newPassword',
      resetToken: 'valid-token',
    };

    const mockUser = {
      id: 'user-123',
      resetToken: 'valid-token',
      resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
    };

    it('should set password successfully', async () => {
      const bcrypt = require('bcrypt');
      mockJwtService.verify.mockReturnValue({ userId: 'user-123' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      bcrypt.hash.mockResolvedValue('hashedPassword');
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.setPassword(setPasswordDto);

      expect(result).toEqual({ message: 'Password set successfully' });
    });

    it('should throw UnauthorizedException if token is invalid', async () => {
      mockJwtService.verify.mockReturnValue({ userId: 'user-123' });
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.setPassword(setPasswordDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('createBranch', () => {
    const createBranchDto = {
      name: 'New Branch',
      address: '123 Main St',
      city: 'Hyderabad',
      state: 'Telangana',
    };

    const mockBranch = {
      id: 'branch-123',
      ...createBranchDto,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create branch successfully', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(null);
      mockPrisma.branch.create.mockResolvedValue(mockBranch);

      const result = await service.createBranch(createBranchDto);

      expect(result).toEqual(mockBranch);
    });

    it('should throw ConflictException if branch name already exists', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue({ id: 'existing-branch' });

      await expect(service.createBranch(createBranchDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('createPermission', () => {
    const createPermissionDto = {
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

    it('should create permission successfully', async () => {
      mockPrisma.permission.findFirst.mockResolvedValue(null);
      mockPrisma.permission.create.mockResolvedValue(mockPermission);

      const result = await service.createPermission(createPermissionDto);

      expect(result).toEqual(mockPermission);
    });

    it('should throw ConflictException if permission already exists', async () => {
      mockPrisma.permission.findFirst.mockResolvedValue({ id: 'existing-permission' });

      await expect(service.createPermission(createPermissionDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('createRole', () => {
    const createRoleDto = {
      name: 'Manager',
      description: 'Manager role',
      permissions: ['read', 'write'],
    };

    const mockRole = {
      id: 'role-123',
      ...createRoleDto,
      permissions: '["read", "write"]',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create role successfully', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.role.create.mockResolvedValue(mockRole);

      const result = await service.createRole(createRoleDto);

      expect(result).toEqual({
        ...mockRole,
        permissions: ['read', 'write'],
      });
    });

    it('should throw ConflictException if role already exists', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'existing-role' });

      await expect(service.createRole(createRoleDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getUserStatistics', () => {
    const query = {
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

    it('should return user statistics', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(10) // totalUsers
        .mockResolvedValueOnce(8)  // activeUsers
        .mockResolvedValueOnce(2); // inactiveUsers
      
      mockPrisma.user.groupBy
        .mockResolvedValueOnce(mockStats.roleBreakdown)
        .mockResolvedValueOnce(mockStats.departmentBreakdown);
      
      mockPrisma.user.findMany.mockResolvedValue(mockStats.recentUsers);

      const result = await service.getUserStatistics(query, 'branch-123');

      expect(result).toEqual(mockStats);
    });
  });
});
