import React from 'react';
import { act, render } from '@testing-library/react';
import { AnalyticsMount, track } from '@/lib/analytics';
import { readConfig, resetAnalyticsForTests } from '@/lib/analytics/client';
import type { User } from '@/lib/types';

let mockPathname = '/';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

const PATIENT_PATH = '/dashboard/patients/cmabc123def456ghi789jkl0';

const staff = {
  id: 'cmuser00000000000000000001',
  firstName: 'Ravi',
  lastName: 'Rao',
  email: 'r@x.in',
  phone: '9876543210',
  role: 'DOCTOR',
  status: 'ACTIVE',
  branchId: 'branch-seed-1',
  isActive: true,
  createdAt: '',
  updatedAt: '',
} as User;

const fetchMock = jest.fn();

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const bodies = (): any[] => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));

const urls = (): string[] => fetchMock.mock.calls.map(([url]) => url);

beforeEach(() => {
  resetAnalyticsForTests();
  mockPathname = '/';
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ status: 200, text: async () => '' });
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID = 'client-id';
  process.env.NEXT_PUBLIC_OPENPANEL_API_URL = 'https://op.test';
});

afterAll(() => {
  delete process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID;
  delete process.env.NEXT_PUBLIC_OPENPANEL_API_URL;
});

describe('readConfig', () => {
  it('trims the client id and defaults the api url', () => {
    expect(readConfig({ clientId: ' abc ' })).toEqual({ clientId: 'abc', apiUrl: 'https://api.openpanel.dev' });
  });

  it('stays off without a client id', () => {
    expect(readConfig({})).toBeNull();
  });

  it('rejects plain http to a remote host and accepts loopback', () => {
    expect(readConfig({ clientId: 'abc', apiUrl: 'http://evil.example' })).toBeNull();
    expect(readConfig({ clientId: 'abc', apiUrl: 'http://localhost:4010/' })).toEqual({
      clientId: 'abc',
      apiUrl: 'http://localhost:4010',
    });
  });

  it('rejects an unparseable api url', () => {
    expect(readConfig({ clientId: 'abc', apiUrl: 'not a url' })).toBeNull();
  });
});

describe('when OpenPanel is not configured', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID;
  });

  it('sends nothing from the mount or from track', async () => {
    render(<AnalyticsMount user={staff} />);
    track('invoice_created');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});

describe('when OpenPanel is configured', () => {
  it('identifies the staff member and sends one screen view once a user is loaded', async () => {
    mockPathname = PATIENT_PATH;
    const { rerender } = render(<AnalyticsMount user={null} />);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(0);

    rerender(<AnalyticsMount user={staff} />);
    await flush();

    expect(urls()).toEqual(['https://op.test/track', 'https://op.test/track']);
    expect(bodies()).toEqual([
      {
        type: 'identify',
        payload: { profileId: staff.id, properties: { role: 'DOCTOR', branch_id: 'branch-seed-1' } },
      },
      {
        type: 'track',
        payload: {
          name: 'screen_view',
          profileId: staff.id,
          properties: {
            __path: 'http://localhost/dashboard/patients/[id]',
            role: 'DOCTOR',
            branch_id: 'branch-seed-1',
          },
        },
      },
    ]);
    const wire = JSON.stringify(bodies());
    for (const secret of ['cmabc123', 'Ravi', 'r@x.in', '9876543210']) {
      expect(wire).not.toContain(secret);
    }
  });

  it('does not resend for the same user and path', async () => {
    mockPathname = PATIENT_PATH;
    const { rerender } = render(<AnalyticsMount user={staff} />);
    for (let i = 0; i < 3; i++) rerender(<AnalyticsMount user={{ ...staff }} />);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends a new screen view when the route template changes', async () => {
    mockPathname = '/dashboard/billing';
    const { rerender } = render(<AnalyticsMount user={staff} />);
    mockPathname = '/dashboard/visits';
    rerender(<AnalyticsMount user={staff} />);
    await flush();
    expect(bodies().map((b) => b.payload.properties.__path)).toEqual([
      undefined,
      'http://localhost/dashboard/billing',
      'http://localhost/dashboard/visits',
    ]);
  });

  it('sends a declared event with the identity attached', async () => {
    render(<AnalyticsMount user={staff} />);
    await flush();
    fetchMock.mockClear();

    track('patient_registered', { source: 'quick_create' });
    await flush();

    expect(bodies()).toEqual([
      {
        type: 'track',
        payload: {
          name: 'patient_registered',
          profileId: staff.id,
          properties: { source: 'quick_create', role: 'DOCTOR', branch_id: 'branch-seed-1' },
        },
      },
    ]);
  });

  it('sends none as the branch when the staff member has no branch', async () => {
    render(<AnalyticsMount user={{ ...staff, branchId: '' }} />);
    await flush();
    fetchMock.mockClear();

    track('invoice_created');
    await flush();

    expect(bodies()[0].payload.properties).toEqual({ role: 'DOCTOR', branch_id: 'none' });
  });

  it('drops an event carrying an undeclared property', async () => {
    render(<AnalyticsMount user={staff} />);
    await flush();
    fetchMock.mockClear();

    track('patient_registered', { source: 'quick_create', patientId: 'cmp1' } as never);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it('sends nothing after the staff member signs out', async () => {
    const { rerender } = render(<AnalyticsMount user={staff} />);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    rerender(<AnalyticsMount user={null} />);
    track('invoice_created');
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps patient data out of the request when the page title and URL contain it', async () => {
    document.title = 'Asha Rao | Linaé';
    window.history.pushState({}, '', `${PATIENT_PATH}?q=Asha`);
    mockPathname = PATIENT_PATH;

    render(<AnalyticsMount user={staff} />);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const wire = JSON.stringify(bodies()) + JSON.stringify(fetchMock.mock.calls.map(([url, init]) => [url, init.headers]));
    expect(wire).not.toContain('Asha');
    expect(wire).not.toContain('cmabc123');
    window.history.pushState({}, '', '/');
    document.title = '';
  });
});

describe('when the collector is unreachable', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('retries inside the SDK and never throws or rejects into the app', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);

    render(<AnalyticsMount user={staff} />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10000);
    });
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('network down'));

    let outcome: unknown = 'unset';
    expect(() => {
      outcome = track('invoice_created');
    }).not.toThrow();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10000);
    });

    expect(outcome).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(errorSpy).toHaveBeenCalledWith('Max retries reached:', expect.any(Error));
    expect(unhandled).toEqual([]);

    process.off('unhandledRejection', onUnhandled);
    errorSpy.mockRestore();
  });
});
