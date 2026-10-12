import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextData {
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  branchId?: string | null;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextData>();

  /**
   * @cc [owner:nareshshah139,label:observability] asynchronous-context-isolation
   * get() MUST return this context inside the callback and async work it starts,
   * while concurrent runs and callers outside the callback retain their own context.
   */
  run<T>(data: RequestContextData, callback: () => T): T {
    // Run the callback within the ALS context so all async work can read the context
    let result!: T;
    this.storage.run(data, () => {
      result = callback();
    });
    return result;
  }

  get(): RequestContextData | undefined {
    return this.storage.getStore();
  }
}
