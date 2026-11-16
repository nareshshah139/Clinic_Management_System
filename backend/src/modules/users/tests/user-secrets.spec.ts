import { UsersService } from '../users.service';

describe('user response credentials', () => {
  const storedUser = {
    id: 'doctor-1',
    branchId: 'branch-1',
    password: 'password-hash',
    resetToken: 'reset-token',
    resetTokenExpiry: new Date('2030-01-01'),
    googleRefreshToken: 'google-token',
    permissions: null,
    metadata: JSON.stringify({ whatsappAccessToken: 'whatsapp-token', textSize: 'LARGE' }),
  };

  it('does not disclose credentials in the user list', async () => {
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([storedUser]), count: jest.fn().mockResolvedValue(1) } };
    const service = new UsersService(prisma as any, {} as any);

    const result = await service.findAllUsers({}, 'branch-1');

    expect(result.users[0]).not.toHaveProperty('password');
    expect(result.users[0]).not.toHaveProperty('resetToken');
    expect(result.users[0]).not.toHaveProperty('resetTokenExpiry');
    expect(result.users[0]).not.toHaveProperty('googleRefreshToken');
    expect(result.users[0].metadata).toEqual({ textSize: 'LARGE' });
  });

  it('preserves an existing WhatsApp token when profile metadata is updated without a token', async () => {
    let current = { ...storedUser };
    const prisma = { user: {
      findFirst: jest.fn().mockImplementation(() => current),
      updateMany: jest.fn().mockImplementation(({ data }) => {
        current = { ...current, ...data };
        return { count: 1 };
      }),
    } };
    const service = new UsersService(prisma as any, {} as any);

    const result = await service.updateProfile('doctor-1', { metadata: { textSize: 'NORMAL' } }, 'branch-1');

    expect(JSON.parse(prisma.user.updateMany.mock.calls[0][0].data.metadata)).toEqual({
      whatsappAccessToken: 'whatsapp-token', textSize: 'NORMAL',
    });
    expect(result.metadata).toEqual({ textSize: 'NORMAL' });
  });

  it('retries when the stored token changes concurrently', async () => {
    const changedUser = { ...storedUser, metadata: JSON.stringify({ whatsappAccessToken: 'new-token' }) };
    const prisma = { user: {
      findFirst: jest.fn().mockResolvedValueOnce(storedUser).mockResolvedValueOnce(storedUser)
        .mockResolvedValueOnce(changedUser).mockResolvedValueOnce(changedUser),
      updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 }),
    } };
    const service = new UsersService(prisma as any, {} as any);

    await service.updateProfile('doctor-1', { metadata: { textSize: 'NORMAL' } }, 'branch-1');

    expect(JSON.parse(prisma.user.updateMany.mock.calls[1][0].data.metadata)).toEqual({
      whatsappAccessToken: 'new-token', textSize: 'NORMAL',
    });
  });

  it('fails without writing if stored metadata is malformed', async () => {
    const prisma = { user: {
      findFirst: jest.fn().mockResolvedValue({ ...storedUser, metadata: '{' }),
      updateMany: jest.fn(),
    } };
    const service = new UsersService(prisma as any, {} as any);

    await expect(service.updateProfile('doctor-1', { metadata: { textSize: 'NORMAL' } }, 'branch-1'))
      .rejects.toThrow('User metadata is invalid');
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('accepts an explicitly replaced token without returning it', async () => {
    let current = { ...storedUser };
    const prisma = { user: {
      findFirst: jest.fn().mockImplementation(() => current),
      updateMany: jest.fn().mockImplementation(({ data }) => {
        current = { ...current, ...data };
        return { count: 1 };
      }),
    } };
    const service = new UsersService(prisma as any, {} as any);

    const result = await service.updateUser('doctor-1', { metadata: { whatsappAccessToken: 'replacement' } }, 'branch-1');

    expect(JSON.parse(current.metadata).whatsappAccessToken).toBe('replacement');
    expect(result.metadata).toEqual({});
  });
});
