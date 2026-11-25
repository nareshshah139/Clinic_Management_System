import { actionLabel, fieldChanges, summary, type AuditEntry } from '@/components/audit-logs/audit-log-model';

const entry = (overrides: Partial<AuditEntry>): AuditEntry => ({
  id: 'log-1',
  userId: 'user-1',
  action: 'UPDATE',
  entity: 'Patient',
  entityId: 'pat-1',
  oldValues: null,
  newValues: null,
  ipAddress: null,
  timestamp: '2026-11-05T09:00:00.000Z',
  ...overrides,
});

describe('audit entries in plain words', () => {
  it.each([
    [entry({ action: 'CREATE', entity: 'InventoryItem' }), 'Added stock item'],
    [entry({ action: 'DELETEMANY', entity: 'PrescriptionInventoryLink' }), 'Deleted prescription inventory link (several)'],
    [entry({ action: 'BRANCH_UPDATED', entity: 'Branch' }), 'Changed clinic details'],
    [entry({ action: 'INVENTORY_BULK_LOCATION', entity: 'InventoryItem' }), 'Inventory bulk location'],
  ])('names %o as %s', (value, words) => {
    expect(summary(value)).toBe(words);
  });

  it('calls a bill voided only when the change cancels it', () => {
    const cancelled = JSON.stringify({ status: 'CANCELLED', notes: 'a' });
    expect(summary(entry({ entity: 'NewInvoice', newValues: cancelled }))).toBe('Voided bill');
    expect(summary(entry({ entity: 'NewInvoice', oldValues: JSON.stringify({ status: 'CANCELLED', notes: '' }), newValues: cancelled }))).toBe('Changed bill');
  });

  it('labels a bulk filter choice without the raw code', () => {
    expect(actionLabel('UPDATEMANY')).toBe('Changed, several at once');
    expect(actionLabel('PASSWORD_RESET_CODE_ISSUED')).toBe('Issued a password reset code');
  });
});

describe('the fields an entry changed', () => {
  it('lists only fields whose value differs, in words, leaving out ids and timestamps', () => {
    const changes = fieldChanges(
      entry({
        oldValues: JSON.stringify({ id: 'p', currentStock: 4, isActive: true, updatedAt: '2026-01-01T00:00:00.000Z', name: 'Same' }),
        newValues: JSON.stringify({ id: 'p', currentStock: 1200, isActive: false, updatedAt: '2026-02-01T00:00:00.000Z', name: 'Same' }),
      }),
    );
    expect(changes).toEqual([
      { field: 'currentStock', label: 'Current stock', before: '4', after: '1,200' },
      { field: 'isActive', label: 'Is active', before: 'Yes', after: 'No' },
    ]);
  });

  it('shows what a new record was set to, skipping empty fields', () => {
    expect(fieldChanges(entry({ action: 'CREATE', newValues: JSON.stringify({ name: 'Meera', email: null, gender: 'FEMALE' }) }))).toEqual([
      { field: 'name', label: 'Name', before: null, after: 'Meera' },
      { field: 'gender', label: 'Gender', before: null, after: 'Female' },
    ]);
  });

  it('reads settings stored as text inside a field', () => {
    const changes = fieldChanges(
      entry({
        oldValues: JSON.stringify({ metadata: JSON.stringify({ procedureAccess: { recordRoles: ['DOCTOR'] } }) }),
        newValues: JSON.stringify({ metadata: JSON.stringify({ procedureAccess: { recordRoles: ['DOCTOR', 'NURSE'] } }) }),
      }),
    );
    expect(changes).toEqual([
      { field: 'metadata.procedureAccess.recordRoles', label: 'Metadata › Procedure access › Record roles', before: 'Doctor', after: 'Doctor, Nurse' },
    ]);
  });

  it('copes with a value that is not JSON', () => {
    expect(fieldChanges(entry({ newValues: 'plain note' }))).toEqual([{ field: 'value', label: 'Value', before: null, after: 'plain note' }]);
  });
});

describe('the fields an entry changed, for deletions and loaded relations', () => {
  it('shows what a deleted record held, even when the same row was stored as both snapshots', () => {
    const room = JSON.stringify({ name: 'Treatment 2', capacity: 3 });
    expect(fieldChanges(entry({ action: 'DELETE', entity: 'Room', oldValues: room, newValues: room }))).toEqual([
      { field: 'name', label: 'Name', before: 'Treatment 2', after: null },
      { field: 'capacity', label: 'Capacity', before: '3', after: null },
    ]);
  });

  it('lists only the staff fields an edit changed, not the clinic loaded with the saved user', () => {
    const changes = fieldChanges(
      entry({
        entity: 'User',
        oldValues: JSON.stringify({ phone: '9000000001', branchId: 'b1' }),
        newValues: JSON.stringify({ phone: '9000000002', branchId: 'b1', branch: { name: 'Main clinic', address: '12 MG Road' } }),
      }),
    );
    expect(changes.map((change) => change.label)).toEqual(['Phone']);
  });
});
