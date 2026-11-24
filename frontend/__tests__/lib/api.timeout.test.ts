import { ApiClient } from '@/lib/api';

describe('ApiClient default timeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })) as jest.Mock;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects a hung background poll with a timeout error instead of waiting forever', async () => {
    const settled = expect(new ApiClient().getSystemAlerts()).rejects.toMatchObject({
      status: 408,
      message: expect.stringMatching(/^Request timed out \(Reference: /),
    });
    await jest.advanceTimersByTimeAsync(3 * 30_000 + 1_500);
    await settled;
  });

  it('gives a hung save a timeout that tells staff to check before retrying', async () => {
    const settled = expect(new ApiClient().createInvoice({ patientId: 'p1' })).rejects.toMatchObject({
      status: 408,
      message: expect.stringMatching(/^The save timed out\. Check whether it completed before trying again\./),
    });
    await jest.advanceTimersByTimeAsync(30_000);
    await settled;
  });
});
