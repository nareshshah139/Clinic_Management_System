/**
 * Pause one Prisma call so a test can run a second request in the gap, then let the first finish.
 * A formal model's interleaving (A reads, B writes, A writes) becomes a deterministic test.
 *
 * const g = gate(prisma, 'pharmacyAgentProposal.update', { when: 'before' });
 * const first = service(g.client).apply(id);   // runs until the gated call
 * await g.arrived;                              // A is now paused at that call
 * await service(prisma).reject(id);             // B runs to completion
 * g.release();
 * await first;
 *
 * Calls made inside an interactive $transaction are gated too. A paused transaction holds its
 * locks, so B blocks on them exactly as in production.
 */
export type Gate<T> = { client: T; arrived: Promise<void>; release: () => void; calls: () => number };

export function gate<T extends object>(
  client: T,
  target: string,
  { nth = 1, when = 'before' }: { nth?: number; when?: 'before' | 'after' } = {},
): Gate<T> {
  const [model, method] = target.split('.');
  let count = 0;
  let arrive!: () => void;
  let release!: () => void;
  const arrived = new Promise<void>((resolve) => (arrive = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));

  const wrapDelegate = (delegate: any) =>
    new Proxy(delegate, {
      get(d, key) {
        const value = d[key];
        if (key !== method || typeof value !== 'function') return value;
        return async (...args: unknown[]) => {
          count += 1;
          if (count !== nth) return value.apply(d, args);
          if (when === 'before') {
            arrive();
            await released;
            return value.apply(d, args);
          }
          const result = await value.apply(d, args);
          arrive();
          await released;
          return result;
        };
      },
    });

  const wrap = (c: any): any =>
    new Proxy(c, {
      get(target, key) {
        const value = target[key];
        if (key === model) return wrapDelegate(value);
        if (key === '$transaction' && typeof value === 'function') {
          return (arg: unknown, ...rest: unknown[]) =>
            typeof arg === 'function'
              ? value.call(target, (tx: any) => (arg as (tx: any) => unknown)(wrap(tx)), ...rest)
              : value.call(target, arg, ...rest);
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

  return { client: wrap(client), arrived, release, calls: () => count };
}
