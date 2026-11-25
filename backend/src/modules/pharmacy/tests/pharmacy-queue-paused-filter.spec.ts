import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { QueryPrescriptionQueueDto } from '../dto/pharmacy-prescription-queue.dto';
import { queueStatusPage } from '../pharmacy-prescription-queue-query';

describe('prescription queue paused filter', () => {
  const parse = (query: Record<string, string>) => plainToInstance(QueryPrescriptionQueueDto, query);

  it('reads paused=true and paused=false from the query string', () => {
    expect(parse({ status: 'expired', paused: 'true' }).paused).toBe(true);
    expect(parse({ status: 'expired', paused: 'false' }).paused).toBe(false);
    expect(validateSync(parse({ status: 'expired', paused: 'true' }))).toHaveLength(0);
  });

  it('rejects a paused value that is not a boolean', () => {
    expect(validateSync(parse({ paused: 'maybe' }))).not.toHaveLength(0);
  });

  it('binds the paused flag into the page query and filters on the task workflow status', () => {
    const now = new Date();
    const paused = queueStatusPage('branch-1', 'expired' as never, 1, 25, now, true);
    const rest = queueStatusPage('branch-1', 'expired' as never, 1, 25, now, false);
    const all = queueStatusPage('branch-1', 'expired' as never, 1, 25, now);
    expect(paused.values).toContain(true);
    expect(rest.values).toContain(false);
    expect(all.values).not.toContain(true);
    expect(paused.sql).toContain("workflow_status = 'PAUSED'");
  });
});
