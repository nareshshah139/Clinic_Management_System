import { FEE_EDITOR_ROLES } from '@/components/appointments/appointment-billing-view';
import { APPOINTMENT_READ_ROLES, ROOM_READ_ROLES } from '@/lib/appointment-access';
import { PHARMACY_SALES_ROLES } from '@/lib/pharmacy-access';
import { ROLES, can, rolesWith } from '@/lib/role-capabilities';

describe('the role capability table', () => {
  it.each([
    ['appointments', APPOINTMENT_READ_ROLES],
    ['rooms', ROOM_READ_ROLES],
    ['pharmacy-sales', PHARMACY_SALES_ROLES],
    ['fees', FEE_EDITOR_ROLES],
  ] as const)('opens %s to the same roles the page itself admits', (capability, pageRoles) => {
    expect([...rolesWith(capability)].sort()).toEqual([...pageRoles].sort());
  });

  it('holds backup for the owner and admin only', () => {
    expect(rolesWith('backup')).toEqual(['OWNER', 'ADMIN']);
  });

  it('holds the audit log for the owner and admin only', () => {
    expect(rolesWith('audit-logs')).toEqual(['OWNER', 'ADMIN']);
  });

  it('gives every role a home dashboard', () => {
    expect(rolesWith('dashboard')).toEqual([...ROLES]);
  });

  it('opens nothing to a role it does not list', () => {
    expect(['LAB_TECH', 'PATIENT', 'constructor', '__proto__', '', null, undefined].map((role) => can(role, 'dashboard'))).toEqual(Array(7).fill(false));
  });
});
