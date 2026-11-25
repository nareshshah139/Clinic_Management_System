import { ApiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';

const BAD_GATEWAY_PAGE = '<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx</center></body></html>';

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => ({ 'content-type': 'application/json', ...headers })[name.toLowerCase()] ?? null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const htmlResponse = (html: string, status: number) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? 'text/html' : null },
  json: async () => { throw new SyntaxError("Unexpected token '<'"); },
  text: async () => html,
});

async function messageShown(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return getErrorMessage(error);
  }
  throw new Error('expected the request to fail');
}

describe('ApiClient error messages staff see', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('explains a dropped connection instead of showing "Failed to fetch"', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));

    const shown = messageShown(new ApiClient().getSystemAlerts());
    await jest.advanceTimersByTimeAsync(10_000);

    expect(await shown).toMatch(/^Can't reach the server\. Check your internet connection, then try again\. \(Reference: /);
  });

  it('tells staff to check a save that hit a dropped connection before retrying', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));

    const shown = await messageShown(new ApiClient().createInvoice({ patientId: 'p1' }));

    expect(shown).toMatch(/^Can't reach the server\. Check your internet connection, then check whether the save went through before trying again\./);
  });

  it('replaces a proxy 502 HTML page with a plain sentence', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(htmlResponse(BAD_GATEWAY_PAGE, 502));

    const shown = messageShown(new ApiClient().getSystemAlerts());
    await jest.advanceTimersByTimeAsync(10_000);
    const message = await shown;

    expect(message).toMatch(/^The server is having trouble right now\. Try again in a moment\./);
    expect(message).not.toMatch(/<|Bad Gateway|nginx/);
  });

  it('replaces the framework 500 text with a plain sentence', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ statusCode: 500, message: 'Internal server error' }, 500));

    const shown = await messageShown(new ApiClient().createInvoice({ patientId: 'p1' }));

    expect(shown).toMatch(/^The server is having trouble right now\. Check whether the save went through before trying again\./);
  });

  it('replaces an HTML page served where data was expected', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(htmlResponse('<!DOCTYPE html><html><body>Sign in to Wi-Fi</body></html>', 200));

    const message = await messageShown(new ApiClient().getSystemAlerts());

    expect(message).toMatch(/^The server sent a reply the app couldn't read\. Try again in a moment\./);
    expect(message).not.toMatch(/<|Wi-Fi/);
  });

  it('keeps the server\'s own explanation when it gives one', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ message: 'Phone number is already registered' }, 409));

    const shown = await messageShown(new ApiClient().createInvoice({ patientId: 'p1' }));

    expect(shown).toMatch(/^Phone number is already registered \(Reference: /);
  });

  it('gives up at once instead of waiting an hour when the server asks for a long Retry-After', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ message: 'ThrottlerException: Too Many Requests' }, 429, { 'retry-after': '3600' }));

    let settled = false;
    const shown = messageShown(new ApiClient().getSystemAlerts()).finally(() => { settled = true; });
    await jest.advanceTimersByTimeAsync(10_000);

    expect(settled).toBe(true);
    expect(await shown).toMatch(/^Too many attempts\. Wait a minute, then try again\./);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('still honours a short Retry-After and succeeds on the retry', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ message: 'busy' }, 503, { 'retry-after': '2' }))
      .mockResolvedValueOnce(jsonResponse([]));

    const result = new ApiClient().getSystemAlerts();
    await jest.advanceTimersByTimeAsync(2_000);

    await expect(result).resolves.toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
