import type { AnyRole } from '@cms/shared-types';

export type PropSpec = readonly string[] | 'flag';

/**
 * @cc [owner:nareshshah139,label:security] analytics-event-catalog
 * Every analytics event and property is declared here. Property values are closed literal lists
 * or booleans. Patient data, staff contact data, identifiers, URLs and free text MUST NOT be
 * declared as properties.
 */
export const EVENTS = {
  patient_registered: { source: ['patients_page', 'quick_create'] },
  appointment_booked: { source: ['scheduler', 'calendar', 'walk_in'] },
  visit_completed: { follow_up_set: 'flag' },
  prescription_created: { mode: ['visit', 'quick'] },
  invoice_created: {},
} as const satisfies Record<string, Record<string, PropSpec>>;

export type EventName = keyof typeof EVENTS;
export type EventProps<N extends EventName> = {
  -readonly [P in keyof (typeof EVENTS)[N]]: (typeof EVENTS)[N][P] extends readonly (infer V)[]
    ? V
    : boolean;
};

export const SCREEN_VIEW = 'screen_view';

/** One template per page.tsx under src/app. A test derives this list from the file system and fails on any difference. */
export const ROUTES = [
  '/',
  '/login',
  '/reset-password',
  '/test-transcribe',
  '/dashboard',
  '/dashboard/appointments',
  '/dashboard/appointments/google-callback',
  '/dashboard/billing',
  '/dashboard/inventory',
  '/dashboard/inventory-updates',
  '/dashboard/patients',
  '/dashboard/patients/[id]',
  '/dashboard/pharmacy',
  '/dashboard/pharmacy/drugs',
  '/dashboard/pharmacy/invoices',
  '/dashboard/pharmacy/reports',
  '/dashboard/pharmacy/sales',
  '/dashboard/pharmacy/sales/bill',
  '/dashboard/prescriptions',
  '/dashboard/procedures',
  '/dashboard/reports',
  '/dashboard/rooms',
  '/dashboard/stock-predictions',
  '/dashboard/users',
  '/dashboard/visits',
] as const;
export type RouteTemplate = (typeof ROUTES)[number] | '/other';

export type StaffRole = AnyRole | 'UNKNOWN';
