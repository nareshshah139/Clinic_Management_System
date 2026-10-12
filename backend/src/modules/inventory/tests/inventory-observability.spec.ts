import { BadRequestException } from '@nestjs/common';
import { logInventoryAutomation } from '../inventory-observability';

const runId = '11111111-1111-4111-8111-111111111111';
const entry = { runId, scheduled: true, operation: 'stock_count' as const, outcome: 'failed' as const, durationMs: 12.4 };

describe('inventory automation diagnostics', () => {
  it('logs safe HTTP and Prisma categories without business data or raw errors', () => {
    const lines: string[] = [];
    const error = Object.assign(new BadRequestException('PRIVATE patient supplier invoice'), { code: 'P2002' });
    logInventoryAutomation({ ...entry, error, payload: 'PRIVATE payload' } as any, line => lines.push(line));
    const event = JSON.parse(lines[0]);
    expect(event).toMatchObject({ event: 'inventory.automation', runId, level: 'error', operation: 'stock_count', outcome: 'failed', errorCode: 'invalid_request', status: 400, databaseCode: 'P2002', durationMs: 12 });
    expect(lines.join('')).not.toMatch(/PRIVATE|payload|stack|message/);
  });

  it('discards arbitrary metadata and malformed database codes', () => {
    const sink = jest.fn();
    logInventoryAutomation({ ...entry, error: { code: 'PRIVATE-code' }, reason: 'PRIVATE-reason' } as any, sink);
    expect(sink.mock.calls[0][0]).not.toContain('PRIVATE');
    expect(JSON.parse(sink.mock.calls[0][0]).errorCode).toBe('operation_failed');
    sink.mockClear();
    logInventoryAutomation({ ...entry, runId: { toString: () => runId, secret: 'PRIVATE' } } as any, sink);
    logInventoryAutomation({ ...entry, operation: 'PRIVATE' } as any, sink);
    expect(sink).not.toHaveBeenCalled();
  });

  it('does not throw when diagnostic output fails', () => {
    expect(() => logInventoryAutomation(entry, () => { throw new Error('sink down'); })).not.toThrow();
  });
});
