import { ApiClient } from '@/lib/api';
import { getSessionState, sendSessionEvent, subscribeToSessionRecovery } from '@/lib/authRedirect';

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const originalLocation = window.location;
const pageUrl = 'http://localhost/dashboard/visits/new?patientId=p1';

function stubLocation() {
  delete (window as any).location;
  (window as any).location = { pathname: '/dashboard/visits/new', search: '?patientId=p1', hash: '', href: pageUrl };
}

describe('ApiClient session expiry', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    stubLocation();
  });

  afterEach(() => {
    sendSessionEvent('submitted');
    sendSessionEvent('signedIn');
    (window as any).location = originalLocation;
    jest.restoreAllMocks();
  });

  it('keeps the page and marks the session expired when a background poll gets a 401 under the dashboard', async () => {
    const unsubscribe = subscribeToSessionRecovery(() => {});
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ message: 'Unauthorized', statusCode: 401 }, 401));

    await expect(new ApiClient().getSystemAlerts()).rejects.toMatchObject({
      status: 401,
      message: expect.stringMatching(/^Your session expired\. Sign in again, then retry\. \(Reference: /),
    });

    expect(window.location.href).toBe(pageUrl);
    expect(getSessionState()).toBe('expired');
    unsubscribe();
  });

  it('navigates to sign-in with the reason and return path when no dashboard is mounted', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, 401));

    await expect(new ApiClient().getSystemAlerts()).rejects.toMatchObject({ status: 401 });

    expect(window.location.href).toBe('/login?next=%2Fdashboard%2Fvisits%2Fnew%3FpatientId%3Dp1&reason=expired');
    expect(window.localStorage.getItem('cms_next_after_login')).toBe('/dashboard/visits/new?patientId=p1');
  });

  it('treats a wrong password at sign-in as a failed sign-in, not an expired session', async () => {
    const unsubscribe = subscribeToSessionRecovery(() => {});
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ message: 'Invalid credentials' }, 401));

    await expect(new ApiClient().login('doctor@example.com', 'wrong')).rejects.toThrow(/^Invalid credentials/);

    expect(getSessionState()).toBe('active');
    expect(window.location.href).toBe(pageUrl);
    unsubscribe();
  });
});
