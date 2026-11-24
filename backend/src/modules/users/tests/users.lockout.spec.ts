import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { UsersService } from '../users.service';

describe('UsersService admin lockout protection', () => {
  let service: UsersService;
  let prisma: any;

  const target = (over: Record<string, unknown> = {}) => ({
    id: 'target',
    branchId: 'b1',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    email: 't@example.com',
    employeeId: null,
    ...over,
  });

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue({ id: 'target' }),
        delete: jest.fn(),
      },
      role: { findFirst: jest.fn().mockResolvedValue({ name: 'DOCTOR' }) },
      appointment: { count: jest.fn().mockResolvedValue(0) },
      visit: { count: jest.fn().mockResolvedValue(0) },
    };
    service = new UsersService(prisma, {} as any);
  });

  describe('self actions', () => {
    beforeEach(() => prisma.user.findFirst.mockResolvedValue(target({ id: 'me' })));

    it('refuses deleting your own account', async () => {
      await expect(service.deleteUser('me', 'b1', 'me')).rejects.toThrow(new ForbiddenException('You cannot delete your own account.'));
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it.each([UserStatus.INACTIVE, UserStatus.SUSPENDED])('refuses setting your own status to %s', async status => {
      await expect(service.updateUserStatus('me', { status }, 'b1', 'me')).rejects.toThrow('You cannot deactivate or suspend your own account.');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses changing your own role through assignRole', async () => {
      await expect(service.assignRole('me', { role: UserRole.DOCTOR }, 'b1', 'me')).rejects.toThrow('You cannot change your own role.');
    });

    it('refuses changing your own role through updateUser', async () => {
      await expect(service.updateUser('me', { role: UserRole.OWNER }, 'b1', 'me')).rejects.toThrow('You cannot change your own role.');
    });

    it('allows saving your own profile when role and status are unchanged', async () => {
      await expect(service.updateUser('me', { firstName: 'A', role: UserRole.ADMIN, status: UserStatus.ACTIVE }, 'b1', 'me')).resolves.toBeDefined();
    });
  });

  describe('last active Owner or Admin', () => {
    beforeEach(() => {
      prisma.user.findFirst.mockResolvedValue(target());
      prisma.user.count.mockResolvedValue(0);
    });

    it('refuses deleting the last admin', async () => {
      await expect(service.deleteUser('target', 'b1', 'actor')).rejects.toThrow(BadRequestException);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('refuses suspending the last admin', async () => {
      await expect(service.updateUserStatus('target', { status: UserStatus.SUSPENDED }, 'b1', 'actor')).rejects.toThrow(/last active Owner or Admin/);
    });

    it('refuses demoting the last admin', async () => {
      await expect(service.assignRole('target', { role: UserRole.DOCTOR }, 'b1', 'actor')).rejects.toThrow(/last active Owner or Admin/);
      await expect(service.updateUser('target', { role: UserRole.NURSE }, 'b1', 'actor')).rejects.toThrow(/last active Owner or Admin/);
    });

    it('counts only other active owners and admins of the same branch', async () => {
      await service.updateUserStatus('target', { status: UserStatus.INACTIVE }, 'b1', 'actor').catch(() => undefined);
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { branchId: 'b1', id: { not: 'target' }, role: { in: [UserRole.OWNER, UserRole.ADMIN] }, status: UserStatus.ACTIVE },
      });
    });

    it('allows the change when another active admin remains', async () => {
      prisma.user.count.mockResolvedValue(1);
      await expect(service.updateUserStatus('target', { status: UserStatus.SUSPENDED }, 'b1', 'actor')).resolves.toBeDefined();
      await expect(service.deleteUser('target', 'b1', 'actor')).resolves.toEqual({ message: 'User deleted successfully' });
    });

    it('allows promoting an admin to owner', async () => {
      await expect(service.assignRole('target', { role: UserRole.OWNER }, 'b1', 'actor')).resolves.toBeDefined();
    });

    it('does not guard non-admin targets', async () => {
      prisma.user.findFirst.mockResolvedValue(target({ role: UserRole.NURSE }));
      await expect(service.updateUserStatus('target', { status: UserStatus.INACTIVE }, 'b1', 'actor')).resolves.toBeDefined();
      expect(prisma.user.count).not.toHaveBeenCalled();
    });
  });
});
