import { HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth.service';

const PASSWORD = 'correct-horse';

describe('AuthService sign-in', () => {
  let users: Record<string, any>[];
  let service: AuthService;
  const jwt = new JwtService({ secret: 'synthetic-secret' });
  const prisma: any = {
    user: {
      findFirst: jest.fn(
        async ({ where }) =>
          users.find((user) =>
            where.email
              ? user.email.toLowerCase() === where.email.equals
              : user.phone === where.phone,
          ) ?? null,
      ),
    },
  };
  const failure = async (identifier: string, password = PASSWORD) => {
    try {
      await service.validateUser(identifier, password);
    } catch (error) {
      if (error instanceof HttpException)
        return { status: error.getStatus(), message: error.message };
      throw error;
    }
    throw new Error(`${identifier} signed in`);
  };

  beforeAll(async () => {
    const password = await bcrypt.hash(PASSWORD, 4);
    const row = (id: string, extra: object = {}) => ({
      id,
      email: `${id}@example.test`,
      phone: null,
      role: 'DOCTOR',
      branchId: 'branch',
      status: 'ACTIVE',
      isActive: true,
      password,
      ...extra,
    });
    users = [
      row('active', { email: 'Active@Example.test', phone: '919876543210' }),
      row('suspended', { status: 'SUSPENDED' }),
      row('inactive', { status: 'INACTIVE' }),
      row('pending', { status: 'PENDING' }),
      row('switched-off', { isActive: false }),
    ];
    service = new AuthService(prisma, jwt);
  });

  it('signs in an active user by email in any case and returns the user without the password hash', async () => {
    const user = await service.validateUser('  ACTIVE@example.TEST ', PASSWORD);
    expect(user).toMatchObject({
      id: 'active',
      role: 'DOCTOR',
      branchId: 'branch',
    });
    expect(user).not.toHaveProperty('password');
    expect(JSON.stringify(user)).not.toContain('$2');
  });

  it('signs in by phone with a leading plus, spaces and dashes', async () => {
    expect(
      await service.validateUser('+91 98765-43210', PASSWORD),
    ).toMatchObject({ id: 'active' });
  });

  it.each([
    ['suspended@example.test', 'Account suspended'],
    ['inactive@example.test', 'Account disabled'],
    ['pending@example.test', 'Account disabled'],
    ['switched-off@example.test', 'Account disabled'],
  ])(
    'refuses %s with 403 even with the right password',
    async (email, message) => {
      expect(await failure(email)).toEqual({ status: 403, message });
    },
  );

  it.each([
    ['an unknown email', 'nobody@example.test', PASSWORD],
    ['an unknown phone', '+919999999999', PASSWORD],
    ['an active account', 'active@example.test', 'wrong-password'],
    ['a suspended account', 'suspended@example.test', 'wrong-password'],
    ['a switched-off account', 'switched-off@example.test', 'wrong-password'],
  ])('answers %s without the right password with the same 401', async (_case, identifier, password) => {
    expect(await failure(identifier, password)).toEqual({
      status: 401,
      message: 'Incorrect email, phone number or password',
    });
  });

  it.each([['not-an-email@'], ['12345'], ['0123456789'], ['   ']])(
    'answers 400 for the malformed identifier %j without a lookup',
    async (identifier) => {
      prisma.user.findFirst.mockClear();
      expect((await failure(identifier)).status).toBe(400);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    },
  );

  it('issues a token that carries only the user id, email, role and branch', async () => {
    const user = await service.validateUser('active@example.test', PASSWORD);
    const { access_token, user: returned } = await service.login(user);
    const { iat: _iat, ...claims } = jwt.verify(access_token);
    expect(claims).toEqual({
      sub: 'active',
      email: 'Active@Example.test',
      role: 'DOCTOR',
      branchId: 'branch',
    });
    expect(returned).not.toHaveProperty('password');
  });
});
