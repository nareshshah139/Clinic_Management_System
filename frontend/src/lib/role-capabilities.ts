export const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'DOCTOR', 'NURSE', 'RECEPTION', 'PHARMACIST', 'ACCOUNTANT'] as const;
export type Role = (typeof ROLES)[number];

export type Capability =
  | 'dashboard' | 'patients' | 'appointments' | 'visits' | 'procedures' | 'rooms'
  | 'pharmacy-desk' | 'pharmacy-counter' | 'pharmacy-sales' | 'pharmacy-reports' | 'inventory'
  | 'billing' | 'reports' | 'users' | 'fees' | 'backup';

/**
 * What each role may open, read by the sidebar and the home dashboard.
 * backend/src/shared/access/role-capabilities.spec.ts fails when a role holds a capability
 * whose first server read the guards refuse that role.
 */
export const ROLE_CAPABILITIES: Readonly<Record<Role, readonly Capability[]>> = {
  OWNER: [
    'dashboard', 'patients', 'appointments', 'visits', 'procedures', 'rooms', 'pharmacy-desk', 'pharmacy-counter',
    'pharmacy-sales', 'inventory', 'pharmacy-reports', 'billing', 'reports', 'users', 'fees', 'backup',
  ],
  ADMIN: [
    'dashboard', 'patients', 'appointments', 'visits', 'procedures', 'rooms', 'pharmacy-desk', 'pharmacy-counter',
    'pharmacy-sales', 'inventory', 'pharmacy-reports', 'billing', 'reports', 'users', 'fees', 'backup',
  ],
  MANAGER: [
    'dashboard', 'patients', 'appointments', 'visits', 'procedures', 'pharmacy-desk', 'pharmacy-counter',
    'inventory', 'pharmacy-reports', 'reports', 'users',
  ],
  DOCTOR: [
    'dashboard', 'patients', 'appointments', 'visits', 'procedures', 'rooms', 'pharmacy-desk', 'pharmacy-counter',
    'pharmacy-sales', 'inventory', 'pharmacy-reports', 'billing', 'reports',
  ],
  NURSE: ['dashboard', 'patients', 'appointments', 'visits', 'rooms'],
  RECEPTION: [
    'dashboard', 'patients', 'appointments', 'rooms', 'pharmacy-desk', 'pharmacy-counter', 'inventory', 'billing',
  ],
  PHARMACIST: ['dashboard', 'pharmacy-desk', 'pharmacy-counter', 'pharmacy-sales', 'inventory', 'pharmacy-reports'],
  ACCOUNTANT: ['dashboard', 'pharmacy-reports'],
};

export const can = (role: string | null | undefined, capability: Capability): boolean =>
  (ROLES as readonly string[]).includes(role ?? '') && ROLE_CAPABILITIES[role as Role].includes(capability);

export const rolesWith = (capability: Capability): Role[] => ROLES.filter((role) => can(role, capability));
