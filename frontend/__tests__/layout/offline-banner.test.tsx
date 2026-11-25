import { act, render, screen } from '@testing-library/react';
import { OfflineBanner } from '@/components/layout/offline-banner';

function goOffline() {
  jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
  act(() => { window.dispatchEvent(new Event('offline')); });
}

function goOnline() {
  jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
  act(() => { window.dispatchEvent(new Event('online')); });
}

describe('OfflineBanner', () => {
  beforeEach(() => jest.useFakeTimers());

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows nothing while the connection is fine', () => {
    render(<OfflineBanner />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('tells staff they are offline, then that they are back, then gets out of the way', () => {
    render(<OfflineBanner />);

    goOffline();
    expect(screen.getByRole('status')).toHaveTextContent("You're offline. Changes won't save until the connection is back.");

    goOnline();
    expect(screen.getByRole('status')).toHaveTextContent("You're back online.");

    act(() => { jest.advanceTimersByTime(5_000); });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('warns at once when the page opens without a connection', () => {
    jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);

    render(<OfflineBanner />);

    expect(screen.getByRole('status')).toHaveTextContent("You're offline.");
  });

  it('keeps the offline warning when the connection drops again right after returning', () => {
    render(<OfflineBanner />);

    goOffline();
    goOnline();
    goOffline();
    act(() => { jest.advanceTimersByTime(5_000); });

    expect(screen.getByRole('status')).toHaveTextContent("You're offline.");
  });
});
