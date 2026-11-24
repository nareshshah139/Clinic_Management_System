import { RequestContextService } from '../context/request-context.service';
import { auditRawWrite, namesOnlyAuditValues } from './prisma.service';

describe('PP-88 names-only audit actor kind', () => {
  it('takes the actor kind the request context names, else staff for a user and system for none', () => {
    expect(namesOnlyAuditValues('create', { data: { body: 'secret', patientId: 'p' } }, { userId: 'u', actorKind: 'system' }))
      .toEqual({ actorKind: 'system', newValues: JSON.stringify({ fields: ['body', 'patientId'] }) });
    expect(namesOnlyAuditValues('update', { data: {} }, { userId: 'u' }).actorKind).toBe('staff');
    expect(namesOnlyAuditValues('update', { data: {} }, undefined).actorKind).toBe('system');
  });

  it('audits a raw write with field names only and the actor kind of the request in flight', async () => {
    const rows: any[] = [];
    const client = { auditLog: { create: async (args: any) => rows.push(args.data) } };
    await new RequestContextService().run({ userId: 'staff-1', ipAddress: '10.0.0.1', userAgent: 'x' }, () =>
      auditRawWrite(client, { entity: 'AttentionItem', entityId: 'att_1', action: 'CREATE', fields: ['reason', 'kind'] }));
    await auditRawWrite(client, { entity: 'OutboundMessage', entityId: 'msg_2', action: 'UPDATE', fields: ['state', 'leaseUntil'] });
    expect(rows).toEqual([
      { userId: null, action: 'CREATE', entity: 'AttentionItem', entityId: 'att_1', actorKind: 'staff', oldValues: null, newValues: '{"fields":["kind","reason"]}' },
      { userId: null, action: 'UPDATE', entity: 'OutboundMessage', entityId: 'msg_2', actorKind: 'system', oldValues: null, newValues: '{"fields":["leaseUntil","state"]}' },
    ]);
  });
});
