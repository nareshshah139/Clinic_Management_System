import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { diagnosticValidationPipe } from '../../../shared/logging/http-observability';
import { CreateUserDto } from './user.dto';
import { UserActivityDto, UserDashboardDto, UserStatisticsDto, QueryUsersDto } from './query-user.dto';

const CUID = 'cmwufgqp800007dkz6x72bfjq';
const run = (type: ArgumentMetadata['type'], value: unknown, metatype: ArgumentMetadata['metatype']) =>
  diagnosticValidationPipe().transform(value, { type, metatype });

const newUser = { firstName: 'Neo', lastName: 'Nurse', email: 'neo@example.com', password: 'Synthetic-2026', role: 'NURSE' };

describe('user DTO id validation', () => {
  it.each([
    ['CreateUserDto.branchId', 'body', CreateUserDto, (branchId: unknown) => ({ ...newUser, branchId })],
    ['QueryUsersDto.branchId', 'query', QueryUsersDto, (branchId: unknown) => ({ branchId })],
    ['UserStatisticsDto.branchId', 'query', UserStatisticsDto, (branchId: unknown) => ({ branchId })],
    ['UserDashboardDto.branchId', 'query', UserDashboardDto, (branchId: unknown) => ({ branchId })],
  ] as const)('%s accepts a database id and refuses malformed values', async (_name, type, dto, make) => {
    await expect(run(type, make(CUID), dto)).resolves.toMatchObject({ branchId: CUID });
    await expect(run(type, make(undefined), dto)).resolves.toBeDefined();
    for (const bad of ['', 42, {}, ['x']]) {
      await expect(run(type, make(bad), dto)).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('UserActivityDto.userId accepts a database id and refuses malformed values', async () => {
    const check = (userId: unknown) => validate(plainToInstance(UserActivityDto, { userId }));
    expect(await check(CUID)).toEqual([]);
    expect(await check(undefined)).toEqual([]);
    for (const bad of ['', 42, {}, ['x']]) expect((await check(bad)).length).toBeGreaterThan(0);
  });
});
