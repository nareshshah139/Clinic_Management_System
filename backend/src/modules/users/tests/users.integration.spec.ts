import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { UsersModule } from '../users.module';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { UserRole, UserStatus } from '@prisma/client';

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashedPassword'),
  compare: jest.fn().mockResolvedValue(true),
}));

describe('UsersController (Integration)', () => {
  let app: INestApplication;
  let mockPrisma: any;
  let mockJwtService: any;
  let authToken: string;

  const mockUser = {
    id: 'user-123',
    branchId: 'branch-123',
    role: 'ADMIN',
  };

  const mockAuthGuard = {
    canActivate: jest.fn(() => true),
  };

  beforeAll(async () => {
    mockPrisma = {
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
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
      passwordResetToken: {
        create: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
      onModuleInit: jest.fn(),
      $connect: jest.fn(),
      enableShutdownHooks: jest.fn(),
    };

    mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn().mockReturnValue({
        userId: 'user-123',
        branchId: 'branch-123',
        role: 'ADMIN',
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [UsersModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(JwtService)
      .useValue(mockJwtService)
      .overrideGuard(JwtAuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());

    // Mock request user
    app.use((req, res, next) => {
      req.user = mockUser;
      next();
    });

    await app.init();

    authToken = 'Bearer mock-jwt-token';
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('/users (POST)', () => {
    const createUserDto = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '+1234567890',
      role: UserRole.DOCTOR,
      branchId: 'branch-123',
      employeeId: 'EMP001',
      designation: 'Senior Doctor',
      department: 'Cardiology',
      emergencyContact: '+1234567891',
      emergencyContactName: 'Jane Doe',
      address: '123 Main St',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500001',
      dateOfBirth: '1990-01-01',
      dateOfJoining: '2020-01-01',
      password: 'password123',
    };

    const mockUserResponse = {
      id: 'user-123',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '+1234567890',
      role: UserRole.DOCTOR,
      branchId: 'branch-123',
      employeeId: 'EMP001',
      designation: 'Senior Doctor',
      department: 'Cardiology',
      emergencyContact: '+1234567891',
      emergencyContactName: 'Jane Doe',
      address: '123 Main St',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500001',
      dateOfBirth: new Date('1990-01-01'),
      dateOfJoining: new Date('2020-01-01'),
      status: UserStatus.ACTIVE,
      permissions: [],
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create a user successfully', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUserResponse);

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', authToken)
        .send(createUserDto)
        .expect(201);

      expect(response.body).toEqual({
        ...mockUserResponse,
        dateOfBirth: mockUserResponse.dateOfBirth.toISOString(),
        dateOfJoining: mockUserResponse.dateOfJoining.toISOString(),
        createdAt: mockUserResponse.createdAt.toISOString(),
        updatedAt: mockUserResponse.updatedAt.toISOString(),
      });
    });

    it('should return 400 for invalid data', async () => {
      const invalidDto = { ...createUserDto, email: 'invalid-email' };

      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', authToken)
        .send(invalidDto)
        .expect(400);
    });

    it('should return 409 if email already exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUserResponse);

      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', authToken)
        .send(createUserDto)
        .expect(409);
    });
  });

  describe('/users (GET)', () => {
    const mockUsers = [
      {
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        role: UserRole.DOCTOR,
        status: UserStatus.ACTIVE,
        permissions: [],
        metadata: null,
      },
      {
        id: 'user-2',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        role: UserRole.NURSE,
        status: UserStatus.ACTIVE,
        permissions: [],
        metadata: null,
      },
    ];

    it('should return paginated users', async () => {
      mockPrisma.user.findMany.mockResolvedValue(mockUsers);
      mockPrisma.user.count.mockResolvedValue(2);

      const response = await request(app.getHttpServer())
        .get('/users?page=1&limit=10')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toEqual({
        users: mockUsers,
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
        },
      });
    });

    it('should filter users by role', async () => {
      const doctorUsers = mockUsers.filter(user => user.role === UserRole.DOCTOR);
      mockPrisma.user.findMany.mockResolvedValue(doctorUsers);
      mockPrisma.user.count.mockResolvedValue(1);

      await request(app.getHttpServer())
        .get('/users?role=DOCTOR')
        .set('Authorization', authToken)
        .expect(200);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: UserRole.DOCTOR,
          }),
        }),
      );
    });
  });

  describe('/users/:id (GET)', () => {
    const mockUserResponse = {
      id: 'user-123',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '+1234567890',
      role: UserRole.DOCTOR,
      branchId: 'branch-123',
      employeeId: 'EMP001',
      designation: 'Senior Doctor',
      department: 'Cardiology',
      emergencyContact: '+1234567891',
      emergencyContactName: 'Jane Doe',
      address: '123 Main St',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500001',
      dateOfBirth: new Date('1990-01-01'),
      dateOfJoining: new Date('2020-01-01'),
      status: UserStatus.ACTIVE,
      permissions: [],
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return user by id', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUserResponse);

      const response = await request(app.getHttpServer())
        .get('/users/user-123')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toEqual({
        ...mockUserResponse,
        dateOfBirth: mockUserResponse.dateOfBirth.toISOString(),
        dateOfJoining: mockUserResponse.dateOfJoining.toISOString(),
        createdAt: mockUserResponse.createdAt.toISOString(),
        updatedAt: mockUserResponse.updatedAt.toISOString(),
      });
    });

    it('should return 404 if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/users/non-existent')
        .set('Authorization', authToken)
        .expect(404);
    });
  });

  describe('/users/:id (PATCH)', () => {
    const updateUserDto = {
      firstName: 'John Updated',
      lastName: 'Doe Updated',
    };

    const updatedUser = {
      id: 'user-123',
      firstName: 'John Updated',
      lastName: 'Doe Updated',
      email: 'john@example.com',
      role: UserRole.DOCTOR,
      status: UserStatus.ACTIVE,
      permissions: [],
      metadata: null,
    };

    it('should update user successfully', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(updatedUser);
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const response = await request(app.getHttpServer())
        .patch('/users/user-123')
        .set('Authorization', authToken)
        .send(updateUserDto)
        .expect(200);

      expect(response.body).toEqual(updatedUser);
    });

    it('should return 404 if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/users/non-existent')
        .set('Authorization', authToken)
        .send(updateUserDto)
        .expect(404);
    });
  });

  describe('/users/:id (DELETE)', () => {
    it('should delete user successfully', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-123' });
      mockPrisma.appointment.count.mockResolvedValue(0);
      mockPrisma.visit.count.mockResolvedValue(0);
      mockPrisma.user.delete.mockResolvedValue({ id: 'user-123' });

      const response = await request(app.getHttpServer())
        .delete('/users/user-123')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toEqual({ message: 'User deleted successfully' });
    });

    it('should return 404 if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete('/users/non-existent')
        .set('Authorization', authToken)
        .expect(404);
    });

    it('should return 400 if user has appointments', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-123' });
      mockPrisma.appointment.count.mockResolvedValue(1);

      await request(app.getHttpServer())
        .delete('/users/user-123')
        .set('Authorization', authToken)
        .expect(400);
    });
  });

  describe('/users/:id/change-password (POST)', () => {
    const changePasswordDto = {
      currentPassword: 'oldPassword',
      newPassword: 'newPassword',
      confirmPassword: 'newPassword',
    };

    it('should change password successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });

      const response = await request(app.getHttpServer())
        .post('/users/user-123/change-password')
        .set('Authorization', authToken)
        .send(changePasswordDto)
        .expect(200);

      expect(response.body).toEqual({ message: 'Password changed successfully' });
    });

    it('should return 401 if current password is incorrect', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });

      await request(app.getHttpServer())
        .post('/users/user-123/change-password')
        .set('Authorization', authToken)
        .send(changePasswordDto)
        .expect(401);
    });
  });

  describe('/users/reset-password (POST)', () => {
    const resetPasswordDto = {
      email: 'john@example.com',
    };

    it('should generate reset token successfully', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-123', email: 'john@example.com' });
      mockPrisma.passwordResetToken.create.mockResolvedValue({ token: 'reset-token' });

      const response = await request(app.getHttpServer())
        .post('/users/reset-password')
        .send(resetPasswordDto)
        .expect(200);

      expect(response.body).toEqual({
        message: 'Password reset token generated',
        token: 'reset-token',
      });
    });

    it('should return 404 if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/users/reset-password')
        .send(resetPasswordDto)
        .expect(404);
    });
  });

  describe('/users/set-password (POST)', () => {
    const setPasswordDto = {
      token: 'valid-token',
      password: 'newPassword',
      confirmPassword: 'newPassword',
    };

    it('should set password successfully', async () => {
      mockPrisma.passwordResetToken.findFirst.mockResolvedValue({
        userId: 'user-123',
        expiresAt: new Date(Date.now() + 3600000),
      });
      mockPrisma.user.update.mockResolvedValue({ id: 'user-123' });
      mockPrisma.passwordResetToken.delete.mockResolvedValue({});

      const response = await request(app.getHttpServer())
        .post('/users/set-password')
        .send(setPasswordDto)
        .expect(200);

      expect(response.body).toEqual({ message: 'Password set successfully' });
    });

    it('should return 401 if token is invalid', async () => {
      mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/users/set-password')
        .send(setPasswordDto)
        .expect(401);
    });
  });

  describe('/users/branches (POST)', () => {
    const createBranchDto = {
      name: 'Main Branch',
      address: '123 Main St',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500001',
      phone: '+1234567890',
      email: 'main@clinic.com',
      gstin: 'GST123456789',
      registrationNo: 'REG123456',
    };

    const mockBranch = {
      id: 'branch-123',
      name: 'Main Branch',
      address: '123 Main St',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500001',
      phone: '+1234567890',
      email: 'main@clinic.com',
      gstin: 'GST123456789',
      registrationNo: 'REG123456',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create branch successfully', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(null);
      mockPrisma.branch.create.mockResolvedValue(mockBranch);

      const response = await request(app.getHttpServer())
        .post('/users/branches')
        .set('Authorization', authToken)
        .send(createBranchDto)
        .expect(201);

      expect(response.body).toEqual({
        ...mockBranch,
        createdAt: mockBranch.createdAt.toISOString(),
        updatedAt: mockBranch.updatedAt.toISOString(),
      });
    });

    it('should return 409 if branch name already exists', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(mockBranch);

      await request(app.getHttpServer())
        .post('/users/branches')
        .set('Authorization', authToken)
        .send(createBranchDto)
        .expect(409);
    });
  });

  describe('/users/branches (GET)', () => {
    const mockBranches = [
      {
        id: 'branch-1',
        name: 'Main Branch',
        address: '123 Main St',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001',
        phone: '+1234567890',
        email: 'main@clinic.com',
        gstin: 'GST123456789',
        registrationNo: 'REG123456',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should return paginated branches', async () => {
      mockPrisma.branch.findMany.mockResolvedValue(mockBranches);
      mockPrisma.branch.count.mockResolvedValue(1);

      const response = await request(app.getHttpServer())
        .get('/users/branches?page=1&limit=10')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toEqual({
        branches: mockBranches.map(branch => ({
          ...branch,
          createdAt: branch.createdAt.toISOString(),
          updatedAt: branch.updatedAt.toISOString(),
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

  describe('/users/permissions (POST)', () => {
    const createPermissionDto = {
      name: 'READ_USERS',
      description: 'Read user information',
    };

    const mockPermission = {
      id: 'permission-123',
      name: 'READ_USERS',
      description: 'Read user information',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create permission successfully', async () => {
      mockPrisma.permission.findFirst.mockResolvedValue(null);
      mockPrisma.permission.create.mockResolvedValue(mockPermission);

      const response = await request(app.getHttpServer())
        .post('/users/permissions')
        .set('Authorization', authToken)
        .send(createPermissionDto)
        .expect(201);

      expect(response.body).toEqual({
        ...mockPermission,
        createdAt: mockPermission.createdAt.toISOString(),
        updatedAt: mockPermission.updatedAt.toISOString(),
      });
    });

    it('should return 409 if permission already exists', async () => {
      mockPrisma.permission.findFirst.mockResolvedValue(mockPermission);

      await request(app.getHttpServer())
        .post('/users/permissions')
        .set('Authorization', authToken)
        .send(createPermissionDto)
        .expect(409);
    });
  });

  describe('/users/roles (POST)', () => {
    const createRoleDto = {
      name: 'Senior Doctor',
      description: 'Senior Doctor Role',
      permissions: ['READ_USERS', 'WRITE_USERS'],
    };

    const mockRole = {
      id: 'role-123',
      name: 'Senior Doctor',
      description: 'Senior Doctor Role',
      permissions: JSON.stringify(['READ_USERS', 'WRITE_USERS']),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create role successfully', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.role.create.mockResolvedValue(mockRole);

      const response = await request(app.getHttpServer())
        .post('/users/roles')
        .set('Authorization', authToken)
        .send(createRoleDto)
        .expect(201);

      expect(response.body).toEqual({
        ...mockRole,
        permissions: ['READ_USERS', 'WRITE_USERS'],
        createdAt: mockRole.createdAt.toISOString(),
        updatedAt: mockRole.updatedAt.toISOString(),
      });
    });

    it('should return 409 if role already exists', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);

      await request(app.getHttpServer())
        .post('/users/roles')
        .set('Authorization', authToken)
        .send(createRoleDto)
        .expect(409);
    });
  });

  describe('/users/statistics (GET)', () => {
    const mockStats = {
      totalUsers: 10,
      activeUsers: 10,
      inactiveUsers: 10,
      roleBreakdown: [
        { role: 'DOCTOR', _count: { role: 5 } },
        { role: 'NURSE', _count: { role: 3 } },
        { role: 'RECEPTION', _count: { role: 2 } },
      ],
      departmentBreakdown: [],
      recentUsers: [
        {
          id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          role: 'DOCTOR',
          status: 'ACTIVE',
        },
      ],
    };

    it('should return user statistics', async () => {
      mockPrisma.user.count.mockResolvedValue(10);
      mockPrisma.user.groupBy.mockResolvedValue(mockStats.roleBreakdown);
      mockPrisma.user.findMany.mockResolvedValue(mockStats.recentUsers);

      const response = await request(app.getHttpServer())
        .get('/users/statistics')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toEqual(mockStats);
    });
  });

  describe('/users/dashboard (GET)', () => {
    const mockDashboard = {
      summary: {
        totalUsers: 10,
        activeUsers: 10,
        inactiveUsers: 0,
      },
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
      roleBreakdown: [
        { role: 'DOCTOR', _count: { role: 5 } },
        { role: 'NURSE', _count: { role: 3 } },
        { role: 'RECEPTION', _count: { role: 2 } },
      ],
      topDepartments: [],
    };

    it('should return user dashboard', async () => {
      mockPrisma.user.count.mockResolvedValue(10);
      mockPrisma.user.findMany.mockResolvedValue(mockDashboard.recentUsers);
      mockPrisma.user.groupBy.mockResolvedValue(mockDashboard.roleBreakdown);

      const response = await request(app.getHttpServer())
        .get('/users/dashboard')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toEqual({
        ...mockDashboard,
        recentUsers: mockDashboard.recentUsers.map(user => ({
          ...user,
          createdAt: user.createdAt.toISOString(),
        })),
      });
    });
  });
});
