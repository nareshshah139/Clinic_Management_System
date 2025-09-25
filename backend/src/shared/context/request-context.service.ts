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