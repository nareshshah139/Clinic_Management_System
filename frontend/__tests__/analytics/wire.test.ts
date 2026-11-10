import { checkWire, identityOf, routeTemplate } from '@/lib/analytics/wire';

const ORIGIN = 'https://clinic.example';

const screenView = (path: string) => ({
  type: 'track',
  payload: {
    name: 'screen_view',
    profileId: 'cmuser00000000000000000001',
    properties: { __path: path, role: 'DOCTOR', branch_id: 'branch-seed-1' },
  },
});

const event = (name: string, extra: Record<string, unknown>, payloadExtra: Record<string, unknown> = {}) => ({
  type: 'track',
  payload: {
    name,
    profileId: 'cmuser00000000000000000001',
    properties: { role: 'DOCTOR', branch_id: 'branch-seed-1', ...extra },
    ...payloadExtra,
  },
});

describe('routeTemplate', () => {
  it.each([
    ['/dashboard/patients/cmabc123def456ghi789jkl0', '/dashboard/patients/[id]'],
    ['/dashboard/patients/', '/dashboard/patients'],
    ['/dashboard/pharmacy/sales?field=patient&q=Asha%20Rao', '/dashboard/pharmacy/sales'],
    ['/dashboard/patients/cmabc/notes', '/other'],
    ['/Dashboard', '/other'],
    ['/dashboard/patients/Asha', '/dashboard/patients/[id]'],
    ['/dashboard/appointments#slot-9', '/dashboard/appointments'],
    ['/', '/'],
    ['//dashboard', '/other'],
  ])('maps %s to %s', (input, expected) => {
    expect(routeTemplate(input)).toBe(expected);
  });
});

describe('identityOf', () => {
  it('keeps only id, role and branch id', () => {
    const user = {
      id: 'cmuser00000000000000000001',
      role: 'DOCTOR',
      branchId: 'branch-seed-1',
      firstName: 'Ravi',
      email: 'r@x.in',
      phone: '9876543210',
    };
    expect(identityOf(user as never)).toEqual({
      staffId: 'cmuser00000000000000000001',
      role: 'DOCTOR',
      branchId: 'branch-seed-1',
    });
  });

  it('degrades unknown roles, empty branches and malformed ids', () => {
    expect(identityOf({ id: 'cmuser1', role: 'SUPERUSER', branchId: 'b1' })?.role).toBe('UNKNOWN');
    expect(identityOf({ id: 'cmuser1', role: 'OWNER', branchId: 'b1' })?.role).toBe('OWNER');
    expect(identityOf({ id: 'cmuser1', role: 'OWNER', branchId: '' })?.branchId).toBeNull();
    expect(identityOf({ id: 'r@x.in', role: 'OWNER', branchId: 'b1' })).toBeNull();
  });
});

describe('checkWire', () => {
  it('accepts a screen_view with a template path and returns a rebuilt copy', () => {
    const input = screenView(`${ORIGIN}/dashboard/patients/[id]`);
    const result = checkWire(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(result?.payload.properties).not.toBe(input.payload.properties);
  });

  it.each([
    `${ORIGIN}/dashboard/patients/cmabc123def456ghi789jkl0`,
    `${ORIGIN}/dashboard/patients?search=asha`,
    `${ORIGIN}/dashboard#x`,
    'javascript:alert(1)',
    'https://user:pw@clinic.example/dashboard',
    `${ORIGIN}/dashboard?`,
  ])('drops a screen_view with path %s', (path) => {
    expect(checkWire(screenView(path))).toBeNull();
  });

  it('accepts a declared event and rebuilds its properties', () => {
    expect(checkWire(event('patient_registered', { source: 'quick_create' }))).toEqual(
      event('patient_registered', { source: 'quick_create' }),
    );
    expect(checkWire(event('visit_completed', { follow_up_set: false }))).toEqual(
      event('visit_completed', { follow_up_set: false }),
    );
    expect(checkWire(event('invoice_created', {}))).toEqual(event('invoice_created', {}));
  });

  it.each([
    ['an extra property', event('patient_registered', { source: 'quick_create', patientId: 'cmp1' })],
    ['free text in a closed property', event('patient_registered', { source: 'Asha Rao' })],
    ['a missing property', event('patient_registered', {})],
    ['a non-boolean flag', event('visit_completed', { follow_up_set: 'yes' })],
    ['an undeclared event', event('patient_viewed', {})],
    ['an inherited object key as a name', event('toString', {})],
    ['an extra payload key', event('invoice_created', {}, { distinctId: 'x' })],
  ])('drops %s', (_label, input) => {
    expect(checkWire(input)).toBeNull();
  });

  it.each(['replay', 'increment', 'alias', 'group', 'ai'])('drops type %s', (type) => {
    expect(checkWire({ type, payload: { profileId: 'cmuser1', properties: {} } })).toBeNull();
  });

  it('accepts identify with role and branch only', () => {
    const input = { type: 'identify', payload: { profileId: 'cmuser1', properties: { role: 'DOCTOR', branch_id: 'none' } } };
    expect(checkWire(input)).toEqual(input);
  });

  it.each([
    ['payload-level firstName', { profileId: 'cmuser1', firstName: 'Ravi', properties: { role: 'DOCTOR', branch_id: 'none' } }],
    ['payload-level email', { profileId: 'cmuser1', email: 'r@x.in', properties: { role: 'DOCTOR', branch_id: 'none' } }],
    ['properties-level phone', { profileId: 'cmuser1', properties: { role: 'DOCTOR', branch_id: 'none', phone: '9876543210' } }],
    ['an email as profileId', { profileId: 'r@x.in', properties: { role: 'DOCTOR', branch_id: 'none' } }],
    ['an unknown role', { profileId: 'cmuser1', properties: { role: 'SUPERUSER', branch_id: 'none' } }],
  ])('drops identify with %s', (_label, payload) => {
    expect(checkWire({ type: 'identify', payload })).toBeNull();
  });

  it('drops a track with no profileId', () => {
    expect(
      checkWire({
        type: 'track',
        payload: { name: 'invoice_created', properties: { role: 'DOCTOR', branch_id: 'none' } },
      }),
    ).toBeNull();
  });

  it.each([null, undefined, 'track', 42, []])('drops non-object input %p', (input) => {
    expect(checkWire(input)).toBeNull();
  });

  it('drops a track whose role or branch is outside the allowlist', () => {
    expect(checkWire(event('invoice_created', { role: 'Ravi' }))).toBeNull();
    expect(checkWire(event('invoice_created', { branch_id: 'Main Street Clinic' }))).toBeNull();
  });
});
