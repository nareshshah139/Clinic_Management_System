import type { OnApplicationShutdown } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;
type Window = { hits: number; expiresAt: number; blockExpiresAt: number };

/**
 * Fixed window per client key and throttler. The stock in-memory storage cancels every client's
 * hit expiry whenever one client's block lifts, so other clients' hits stop expiring and they
 * get 429 inside their limit.
 */
export class WindowThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly windows = new Map<string, Window>();
  private readonly sweep = setInterval(() => this.prune(Date.now()), 60_000).unref();

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const now = Date.now();
    const id = `${throttlerName}:${key}`;
    let w = this.windows.get(id);
    if (!w || (w.expiresAt <= now && w.blockExpiresAt <= now)) {
      w = { hits: 0, expiresAt: now + ttl, blockExpiresAt: 0 };
      this.windows.set(id, w);
    }
    if (w.blockExpiresAt <= now && ++w.hits > limit) w.blockExpiresAt = now + blockDuration;
    const seconds = (at: number) => Math.max(0, Math.ceil((at - now) / 1000));
    return {
      totalHits: w.hits,
      timeToExpire: seconds(w.expiresAt),
      isBlocked: w.blockExpiresAt > now,
      timeToBlockExpire: seconds(w.blockExpiresAt),
    };
  }

  private prune(now: number) {
    for (const [id, w] of this.windows) {
      if (w.expiresAt <= now && w.blockExpiresAt <= now) this.windows.delete(id);
    }
  }

  onApplicationShutdown() {
    clearInterval(this.sweep);
  }
}
