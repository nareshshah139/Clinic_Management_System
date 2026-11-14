import { PatientsService } from '../patients.service';

describe('PatientsService.update date of birth', () => {
  const stored = { id: 'p1', dob: new Date('1988-07-19T00:00:00.000Z'), age: 38 };
  const update = jest.fn(async ({ data }: any) => ({ id: 'p1', ...data }));
  const service = new PatientsService(
    { patient: { findFirst: jest.fn(async () => stored), update } } as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => {
    update.mockClear();
    jest.useFakeTimers().setSystemTime(new Date('2026-11-13T10:00:00.000Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('keeps the date of birth when only the phone changes', async () => {
    await service.update('p1', { phone: '9822099102' } as any, 'branch');
    expect(update.mock.calls[0][0].data).toEqual({ phone: '9822099102' });
  });

  it('keeps the date of birth when the age sent is the age already shown', async () => {
    await service.update('p1', { age: 38, phone: '9822099102' } as any, 'branch');
    expect(update.mock.calls[0][0].data).toEqual({ phone: '9822099102' });
  });

  it('rebuilds the date of birth from an age that really changed', async () => {
    await service.update('p1', { age: 40 } as any, 'branch');
    expect(update.mock.calls[0][0].data).toEqual({ age: 40, dob: new Date(2026 - 40, 0, 1) });
  });

  it('brings a stale stored age in line and keeps the date of birth when the age sent matches the date of birth', async () => {
    stored.age = 37;
    try {
      await service.update('p1', { age: 38 } as any, 'branch');
      expect(update.mock.calls[0][0].data).toEqual({ age: 38 });
    } finally {
      stored.age = 38;
    }
  });

  it('keeps both when the age sent matches the date of birth and the stored age', async () => {
    await service.update('p1', { age: 38 } as any, 'branch');
    expect(update.mock.calls[0][0].data).toEqual({});
  });

  it('rebuilds the date of birth when the age sent differs from the date of birth, even if it equals a stale stored age', async () => {
    stored.age = 37;
    try {
      await service.update('p1', { age: 37 } as any, 'branch');
      expect(update.mock.calls[0][0].data).toEqual({ age: 37, dob: new Date(2026 - 37, 0, 1) });
    } finally {
      stored.age = 38;
    }
  });

  it('changes neither when no age is sent', async () => {
    await service.update('p1', { email: 'a@b.in' } as any, 'branch');
    expect(update.mock.calls[0][0].data).toEqual({ email: 'a@b.in' });
  });

  it('builds the date of birth from the age when the patient has no date of birth', async () => {
    stored.dob = null as any;
    try {
      await service.update('p1', { age: 38 } as any, 'branch');
      expect(update.mock.calls[0][0].data).toEqual({ age: 38, dob: new Date(2026 - 38, 0, 1) });
      await service.update('p1', { age: 41 } as any, 'branch');
      expect(update.mock.calls[1][0].data).toEqual({ age: 41, dob: new Date(2026 - 41, 0, 1) });
    } finally {
      stored.dob = new Date('1988-07-19T00:00:00.000Z');
    }
  });

  it('still stores a date of birth that is sent', async () => {
    await service.update('p1', { dob: '1990-01-05' } as any, 'branch');
    expect(update.mock.calls[0][0].data).toEqual({ dob: new Date('1990-01-05'), age: 36 });
  });
});
