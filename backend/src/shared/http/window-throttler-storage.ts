import type { OnApplicationShutdown } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;
type Client = { hits: number[]; ttl: number; blockExpiresAt: number };

/**
 * Rolling window per client key and throttler: a hit counts for exactly ttl ms. The stock
 * in-memory storage cancels every client's hit expiry whenever one client's block lifts, so
 * other clients' hits stop expiring and they get 429 inside their limit.
 */
export class WindowThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly clients = new Map<string, Client>();
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
    const c = this.clients.get(id) ?? { hits: [], ttl, blockExpiresAt: 0 };
    this.clients.set(id, c);
    while (c.hits.length && c.hits[0] <= now - ttl) c.hits.shift();
    if (c.blockExpiresAt <= now) {
      c.hits.push(now);
      if (c.hits.length > limit) c.blockExpiresAt = now + blockDuration;
    }
    const seconds = (at: number) => Math.max(0, Math.ceil((at - now) / 1000));
    return {
      totalHits: c.hits.length,
      timeToExpire: seconds((c.hits[0] ?? now) + ttl),
      isBlocked: c.blockExpiresAt > now,
      timeToBlockExpire: seconds(c.blockExpiresAt),
    };
  }

  private prune(now: number) {
    for (const [id, c] of this.clients) {
      if (c.blockExpiresAt <= now && (c.hits.at(-1) ?? 0) <= now - c.ttl) this.clients.delete(id);
    }
  }

  onApplicationShutdown() {
    clearInterval(this.sweep);
  }
}
