import { AuditLogsService } from '../audit-logs.service';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-06T12:00:00.000Z');

function setup(ages: Record<string, number>) {
  const logs = Object.entries(ages).map(([id, days]) => ({
    id,
    timestamp: new Date(NOW.getTime() - days * DAY),
  }));
  const auditLog = {
    deleteMany: jest.fn(async ({ where }) => {
      const doomed = logs.filter((log) => log.timestamp < where.timestamp.lt);
      for (const log of doomed) logs.splice(logs.indexOf(log), 1);
      return { count: doomed.length };
    }),
  };
  const service = new AuditLogsService({ auditLog } as any);
  return { service, logs, auditLog };
}

describe('audit log retention', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('keeps 90 days by default and deletes only older entries', async () => {
    const { service, logs } = setup({ today: 0, d89: 89, d91: 91, d400: 400 });
    const result = await service.deleteOldLogs();
    expect(result.count).toBe(2);
    expect(logs.map((l) => l.id)).toEqual(['today', 'd89']);
  });

  it('honours a shorter requested window', async () => {
    const { service, logs } = setup({ d10: 10, d29: 29, d31: 31 });
    await service.deleteOldLogs(30);
    expect(logs.map((l) => l.id)).toEqual(['d10', 'd29']);
  });

  it('keeps an entry that is exactly at the cutoff', async () => {
    const { service, logs } = setup({ edge: 30 });
    await service.deleteOldLogs(30);
    expect(logs.map((l) => l.id)).toEqual(['edge']);
  });

  it('deletes nothing when every entry is inside the window', async () => {
    const { service, logs } = setup({ a: 1, b: 2 });
    expect((await service.deleteOldLogs(365)).count).toBe(0);
    expect(logs).toHaveLength(2);
  });

  it.each([-1, -90, NaN, Infinity])(
    'rejects a retention of %s days and deletes nothing',
    async (days) => {
      const { service, logs, auditLog } = setup({ today: 0, d1: 1 });
      await expect(service.deleteOldLogs(days)).rejects.toThrow(RangeError);
      expect(auditLog.deleteMany).not.toHaveBeenCalled();
      expect(logs).toHaveLength(2);
    },
  );
});

describe('audit log service is add-only', () => {
  const recorded: string[] = [];
  const delegate = new Proxy({} as Record<string, jest.Mock>, {
    get: (target, op: string) =>
      (target[op] ??= jest.fn(async () => {
        recorded.push(op);
        return op === 'count'
          ? 0
          : op === 'deleteMany'
            ? { count: 0 }
            : op === 'findUnique'
              ? null
              : [];
      })),
  });
  const service = new AuditLogsService({ auditLog: delegate } as any);

  beforeEach(() => {
    recorded.length = 0;
  });

  it('only reads when serving every query method', async () => {
    await service.findAll({} as any);
    await service.findOne('log-1');
    await service.findByEntity('Patient', 'pat-1');
    await service.findByUser('user-1', {} as any);
    await service.getStatistics();
    await service.exportLogs({} as any, 'json');
    expect(recorded.length).toBeGreaterThan(0);
    expect(new Set(recorded)).toEqual(
      new Set(['findMany', 'count', 'findUnique', 'groupBy']),
    );
  });

  it('exposes deleteOldLogs as the only mutating method', () => {
    const methods = Object.getOwnPropertyNames(
      AuditLogsService.prototype,
    ).filter((name) => name !== 'constructor');
    expect(
      methods.filter((name) =>
        /^(create|add|update|edit|set|delete|remove|purge|clear)/i.test(name),
      ),
    ).toEqual(['deleteOldLogs']);
  });

  it('deletes through deleteMany only', async () => {
    await service.deleteOldLogs(30);
    expect(recorded).toEqual(['deleteMany']);
  });
});
