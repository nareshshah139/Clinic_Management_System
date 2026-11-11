import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { PermissionsGuard } from '../../shared/guards/permissions.guard';
import { ROLE_PERMISSIONS } from '../../shared/access/role-permissions';
import { AppointmentsController } from './appointments.controller';
import { DoctorAvailabilityController } from '../doctor-availability/doctor-availability.controller';

const reflector = new Reflector();
type Role = 'MANAGER' | 'PHARMACIST' | 'ACCOUNTANT';

async function admits(controller: any, handler: string, role: Role) {
  const context = {
    getHandler: () => controller.prototype[handler],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', role, branchId: 'b' } }) }),
  } as unknown as ExecutionContext;
  const prisma = {
    user: { findUnique: async () => ({ role, permissions: JSON.stringify(ROLE_PERMISSIONS[role]) }) },
    role: { findFirst: async () => null },
  };
  return new RolesGuard(reflector).canActivate(context) && (await new PermissionsGuard(reflector, prisma as any).canActivate(context));
}

const CALENDAR_READS: Array<[any, string]> = [
  [AppointmentsController, 'findAll'],
  [AppointmentsController, 'getDoctorSchedule'],
  [DoctorAvailabilityController, 'getDay'],
];

describe('what the appointments calendar and the dashboard read for a manager', () => {
  it("lets a manager, who holds appointments:*, read today's appointments, a doctor's day and its hours", async () => {
    const seen = [];
    for (const [controller, handler] of CALENDAR_READS) seen.push([handler, await admits(controller, handler, 'MANAGER')]);
    expect(seen).toEqual([['findAll', true], ['getDoctorSchedule', true], ['getDay', true]]);
  });

  it('keeps rooms and every appointment change away from a manager', async () => {
    const seen = [];
    for (const handler of ['getRooms', 'getAllRooms', 'create', 'update', 'reschedule', 'remove'])
      seen.push([handler, await admits(AppointmentsController, handler, 'MANAGER')]);
    expect(seen).toEqual([['getRooms', false], ['getAllRooms', false], ['create', false], ['update', false], ['reschedule', false], ['remove', false]]);
  });

  it('still refuses appointments to a pharmacist and an accountant, who hold no appointment grant', async () => {
    expect([await admits(AppointmentsController, 'findAll', 'PHARMACIST'), await admits(AppointmentsController, 'findAll', 'ACCOUNTANT')]).toEqual([false, false]);
  });
});
