import { ExecutionContext } from '@nestjs/common';
import { defer, firstValueFrom } from 'rxjs';
import { RequestContextService, currentRequestContext } from '../context/request-context.service';
import { RequestContextInterceptor, actorKindOf } from './request-context.interceptor';

it('keeps each request context inside deferred handlers and their asynchronous work', async () => {
  const storage = new RequestContextService();
  const interceptor = new RequestContextInterceptor(storage);
  const run = (userId: string) => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: userId, branchId: 'branch' },
          headers: {},
          ip: '127.0.0.1',
        }),
      }),
    } as ExecutionContext;
    return firstValueFrom(
      interceptor.intercept(context, {
        handle: () =>
          defer(async () => {
            await new Promise((resolve) => setTimeout(resolve, 1));
            return storage.get()?.userId;
          }),
      }),
    );
  };
  expect(await Promise.all([run('first'), run('second')])).toEqual([
    'first',
    'second',
  ]);
  expect(storage.get()).toBeUndefined();
});

it('PP-88: names the actor kind from the route a request reached', async () => {
  expect(actorKindOf('/internal/portal/task/responses', null)).toBe('task link');
  expect(actorKindOf('/internal/portal/task?x=1', null)).toBe('task link');
  expect(actorKindOf('/internal/portal/records/messages', null)).toBe('portal');
  expect(actorKindOf('/internal/portal/taskx', null)).toBe('portal');
  expect(actorKindOf('/api/webhooks/whatsapp', null)).toBe('webhook');
  expect(actorKindOf('/webhooks/whatsapp?hub.mode=subscribe', null)).toBe('webhook');
  expect(actorKindOf('/portal/task/responses', null)).toBe('system');
  expect(actorKindOf('/patients/p1/portal', 'staff-1')).toBe('staff');
  expect(actorKindOf('/api/webhooks/whatsappx', null)).toBe('system');
  expect(actorKindOf('/api/health', null)).toBe('system');

  const storage = new RequestContextService();
  const interceptor = new RequestContextInterceptor(storage);
  const context = { switchToHttp: () => ({ getRequest: () => ({ originalUrl: '/api/webhooks/whatsapp', headers: {} }) }) } as ExecutionContext;
  const seen = await firstValueFrom(interceptor.intercept(context, { handle: () => defer(async () => currentRequestContext()?.actorKind) }));
  expect(seen).toBe('webhook');
});
