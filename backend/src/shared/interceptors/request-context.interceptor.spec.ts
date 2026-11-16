import { ExecutionContext } from '@nestjs/common';
import { defer, firstValueFrom } from 'rxjs';
import { RequestContextService } from '../context/request-context.service';
import { RequestContextInterceptor } from './request-context.interceptor';

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
