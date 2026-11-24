import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export type AuditActorKind = 'staff' | 'webhook' | 'system';

export interface RequestContextData {
  userId: string | null;
  actorKind?: AuditActorKind;
  ipAddress: string | null;
  userAgent: string | null;
  branchId?: string | null;
}

const storage = new AsyncLocalStorage<RequestContextData>();

/** The context of the request in flight, for code that writes outside the Prisma extension. */
export function currentRequestContext(): RequestContextData | undefined {
  return storage.getStore();
}

@Injectable()
export class RequestContextService {
  /**
   * @cc [owner:nareshshah139,label:observability] asynchronous-context-isolation
   * get() MUST return this context inside the callback and async work it starts,
   * while concurrent runs and callers outside the callback retain their own context.
   */
  run<T>(data: RequestContextData, callback: () => T): T {
    // Run the callback within the ALS context so all async work can read the context
    let result!: T;
    storage.run(data, () => {
      result = callback();
    });
    return result;
  }

  get(): RequestContextData | undefined {
    return storage.getStore();
  }
}
