import { UsersService } from '../users.service';

describe('CR-13 text-size preferences', () => {
  const actor = { id: 'user', branchId: 'clinic' };
  it('merges size without replacing unrelated preferences after a concurrent edit', async () => {
    let metadata = JSON.stringify({ signature: 'retained' });
    let first = true;
    const db: any = { user: {
      findFirst: async () => ({ metadata }),
      updateMany: async ({ where, data }: any) => {
        if (first) { first = false; metadata = JSON.stringify({ signature: 'newer', locale: 'bn' }); return { count: 0 }; }
        if (where.metadata !== metadata) return { count: 0 };
        metadata = data.metadata; return { count: 1 };
      },
    } };
    expect(await new UsersService(db, {} as any).updateTextSize('user', 'LARGE', actor)).toEqual({ textSize: 'LARGE' });
    expect(JSON.parse(metadata)).toEqual({ signature: 'newer', locale: 'bn', textSize: 'LARGE' });
  });
  it('rejects another user, unsupported values and malformed metadata before writes', async () => {
    const updateMany = jest.fn();
    const service = new UsersService({ user: { findFirst: async () => ({ metadata: 'broken' }), updateMany } } as any, {} as any);
    await expect(service.updateTextSize('other', 'NORMAL', actor)).rejects.toThrow('own text size');
    await expect(service.updateTextSize('user', 'HUGE', actor)).rejects.toThrow('Choose');
    await expect(service.updateTextSize('user', 'NORMAL', actor)).rejects.toThrow('preferences need review');
    expect(updateMany).not.toHaveBeenCalled();
  });
});
