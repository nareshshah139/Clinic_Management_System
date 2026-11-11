import {
  clinicDay,
  clinicDayOf,
  clinicDayRange,
  clinicInstants,
  compareValues,
  mobileDigits,
  money,
  pageOf,
  registerRangeError,
} from '../register-utils';

describe('register utilities', () => {
  it('reads the clinic day in Asia/Kolkata', () => {
    expect([
      clinicDay(new Date('2026-03-31T18:29:59.999Z')),
      clinicDay(new Date('2026-03-31T18:30:00.000Z')),
    ]).toEqual(['2026-03-31', '2026-04-01']);
  });

  it('turns an inclusive day range into Kolkata midnight bounds', () => {
    const range = clinicDayRange('2026-04-01', '2026-04-02');
    expect([range.gte.toISOString(), range.lt.toISOString()]).toEqual([
      '2026-03-31T18:30:00.000Z',
      '2026-04-02T18:30:00.000Z',
    ]);
  });

  it('reads a date-only bound as the whole clinic day and a timestamp bound as that instant', () => {
    const iso = (range: { gte?: Date; lt?: Date }) => [range.gte?.toISOString(), range.lt?.toISOString()];
    expect([
      iso(clinicInstants('2026-11-11', '2026-11-11')),
      iso(clinicInstants('2026-11-11T04:30:00.000Z', '2026-11-11T12:00:00+05:30')),
      iso(clinicInstants('2026-11-11T10:00', undefined)),
      iso(clinicInstants(undefined, '2026-11-12')),
    ]).toEqual([
      ['2026-11-10T18:30:00.000Z', '2026-11-11T18:30:00.000Z'],
      ['2026-11-11T04:30:00.000Z', '2026-11-11T06:30:00.001Z'],
      ['2026-11-11T04:30:00.000Z', undefined],
      [undefined, '2026-11-12T18:30:00.000Z'],
    ]);
  });

  it('reads a business date as a calendar day or the clinic day of a zoned timestamp, and nothing else', () => {
    expect(
      [
        '2026-07-09',
        ' 2026-07-09 ',
        '2026-07-09T20:00:00.000Z',
        '2026-07-09T23:59:00+05:30',
        '2026-02-30',
        '2026-02-30T10:00:00Z',
        '2026-07-09T10:00:00',
        '09/07/2026',
        '',
        42,
      ].map(clinicDayOf),
    ).toEqual([
      '2026-07-09',
      '2026-07-09',
      '2026-07-10',
      '2026-07-09',
      null,
      null,
      '2026-07-09',
      null,
      null,
      null,
    ]);
  });

  it('allows a register range of up to 400 days that does not run backwards', () => {
    expect([
      registerRangeError('2024-04-01', '2025-05-05'),
      registerRangeError('2024-04-01', '2025-05-06'),
      registerRangeError('2026-04-02', '2026-04-01'),
      registerRangeError('2026-04-01', 'not-a-day'),
    ]).toEqual([
      null,
      'Choose a date range of at most 400 days',
      'The start date must be on or before the end date',
      null,
    ]);
  });

  it('reduces Indian mobile numbers to their last ten digits', () => {
    expect(
      [
        '+91 98765 43210',
        '0091-98765-43210',
        '098765 43210',
        '(98765) 43210',
        '91987',
        '0',
        'none',
      ].map(mobileDigits),
    ).toEqual([
      '9876543210',
      '9876543210',
      '9876543210',
      '9876543210',
      '91987',
      '',
      '',
    ]);
  });

  it('compares numbers by value and text naturally, rounds to paise and pages', () => {
    expect([
      compareValues(9, 80) < 0,
      compareValues('PHI-2026-9', 'PHI-2026-10') < 0,
      compareValues('meera', 'Meera'),
      money(0.1 + 0.2),
      money(1.005),
      pageOf(['a', 'b', 'c', 'd', 'e'], 3, 2),
      pageOf(['a'], 2, 50),
    ]).toEqual([true, true, 0, 0.3, 1.01, ['e'], []]);
  });
});
