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

  it('uses the stored age when the patient has no date of birth', async () => {
    stored.dob = null as any;
    try {
      await service.update('p1', { age: 38 } as any, 'branch');
      expect(update.mock.calls[0][0].data).toEqual({});
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
