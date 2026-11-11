import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { PermissionsGuard } from '../../shared/guards/permissions.guard';
import { ROLE_PERMISSIONS } from '../../shared/access/role-permissions';
import { AppointmentsController } from './appointments.controller';

const reflector = new Reflector();

async function admits(handler: keyof AppointmentsController, role: 'NURSE' | 'RECEPTION' | 'ACCOUNTANT') {
  const context = {
    getHandler: () => AppointmentsController.prototype[handler],
    getClass: () => AppointmentsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', role, branchId: 'b' } }) }),
  } as unknown as ExecutionContext;
  const prisma = {
    user: { findUnique: async () => ({ role, permissions: JSON.stringify(ROLE_PERMISSIONS[role]) }) },
    role: { findFirst: async () => null },
  };
  return new RolesGuard(reflector).canActivate(context) && (await new PermissionsGuard(reflector, prisma as any).canActivate(context));
}

describe('who may read rooms for the appointment calendar', () => {
  it('lets a nurse read rooms, all rooms and a room schedule, as reception does', async () => {
    for (const handler of ['getRooms', 'getAllRooms', 'getRoomSchedule'] as const) {
      expect([handler, await admits(handler, 'NURSE'), await admits(handler, 'RECEPTION')]).toEqual([handler, true, true]);
    }
  });

  it('keeps room changes away from a nurse and from reception', async () => {
    for (const handler of ['createRoom', 'updateRoom', 'deleteRoom'] as const) {
      expect([handler, await admits(handler, 'NURSE'), await admits(handler, 'RECEPTION')]).toEqual([handler, false, false]);
    }
  });

  it('still refuses a role without rooms or appointment grants', async () => {
    expect(await admits('getRooms', 'ACCOUNTANT')).toBe(false);
  });
});
