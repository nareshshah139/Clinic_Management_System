import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PortalSignInPage from '@/app/p/page';

const replace = jest.fn();
const router = { replace };
jest.mock('next/navigation', () => ({ useRouter: () => router }));

const json = (status: number, body: unknown = {}) => Promise.resolve({ ok: status < 300, status, json: async () => body });
const TWO = { profiles: [{ ref: 'r1', firstName: 'Asha', branch: 'Banjara Hills' }, { ref: 'r2', firstName: 'Ravi', branch: 'Kukatpally' }], chosen: null };

describe('portal sign-in page (PP-55, PP-56, PP-58, PP-61)', () => {
  let fetchMock: jest.Mock;
  const setItem = jest.spyOn(Storage.prototype, 'setItem');
  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    replace.mockClear();
    setItem.mockClear();
  });
  const calls = () => fetchMock.mock.calls.map(([url, init]) => [url, init.method, init.body && JSON.parse(init.body)]);

  async function toCode(phone = '98000 00001') {
    render(<PortalSignInPage />);
    fireEvent.change(await screen.findByLabelText('Your WhatsApp number'), { target: { value: phone } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send me a code' })));
    await screen.findByTestId('code-on-way');
  }

  it('asks for a code, shows the same answer whatever happened, signs in, and lets a shared phone pick a person by first name and branch', async () => {
    fetchMock
      .mockReturnValueOnce(json(401))
      .mockReturnValueOnce(json(200, { message: 'If this number can sign in, a code is on its way on WhatsApp. It works for 5 minutes.' }))
      .mockReturnValueOnce(json(200, TWO))
      .mockReturnValueOnce(json(200, { ...TWO, chosen: 'r2' }));
    await toCode();
    expect(screen.getByTestId('code-on-way')).toHaveTextContent('If this number can sign in, a code is on its way on WhatsApp. It works for 5 minutes.');
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '12a3456' } });
    expect(screen.getByLabelText('6-digit code')).toHaveValue('123456');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign in' })));
    const picker = await screen.findByTestId('profile-picker');
    expect(picker).toHaveTextContent('Who are you signing in for?');
    expect(picker).toHaveTextContent('AshaBanjara Hills');
    expect(picker).toHaveTextContent('RaviKukatpally');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Ravi/ })));
    expect(replace).toHaveBeenCalledWith('/p/records');
    expect(calls()).toEqual([
      ['/api/portal/session', 'GET', undefined],
      ['/api/portal/auth/code', 'POST', { phone: '98000 00001' }],
      ['/api/portal/auth/verify', 'POST', { phone: '98000 00001', code: '123456' }],
      ['/api/portal/session/profile', 'POST', { ref: 'r2' }],
    ]);
    for (const [, init] of fetchMock.mock.calls) expect(init).toMatchObject({ credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'same-origin' });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('shows the code step for a refused number too, so the page never says whether a number is known (PP-55)', async () => {
    fetchMock.mockReturnValueOnce(json(401)).mockReturnValueOnce(json(400));
    await toCode('12');
    expect(screen.queryByTestId('sign-in-error')).toBeNull();
  });

  it('says a wrong or expired code did not work, keeps the number, and offers a new code (PP-56)', async () => {
    fetchMock.mockReturnValueOnce(json(401)).mockReturnValueOnce(json(200, {})).mockReturnValueOnce(json(401, { message: 'x' }));
    await toCode();
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '000000' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign in' })));
    expect(await screen.findByTestId('sign-in-error')).toHaveTextContent('That code did not work');
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use a different number or get a new code' }));
    expect(screen.getByLabelText('Your WhatsApp number')).toHaveValue('98000 00001');
  });

  it('says to wait when the limits answer 429 (PP-57)', async () => {
    fetchMock.mockReturnValueOnce(json(401)).mockReturnValueOnce(json(429));
    render(<PortalSignInPage />);
    fireEvent.change(await screen.findByLabelText('Your WhatsApp number'), { target: { value: '9800000001' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send me a code' })));
    expect(await screen.findByTestId('sign-in-error')).toHaveTextContent('Too many tries');
  });

  it('chooses the only person on a number without asking, and goes straight to records when a session already chose one', async () => {
    fetchMock.mockReturnValueOnce(json(401)).mockReturnValueOnce(json(200, {}))
      .mockReturnValueOnce(json(200, { profiles: [TWO.profiles[0]], chosen: null }))
      .mockReturnValueOnce(json(200, { profiles: [TWO.profiles[0]], chosen: 'r1' }));
    await toCode();
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123456' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign in' })));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/p/records'));
    expect(screen.queryByTestId('profile-picker')).toBeNull();
    expect(calls()[3]).toEqual(['/api/portal/session/profile', 'POST', { ref: 'r1' }]);

    replace.mockClear();
    fetchMock.mockReset().mockReturnValueOnce(json(200, { profiles: [TWO.profiles[0]], chosen: 'r1' }));
    render(<PortalSignInPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/p/records'));
  });

  it('speaks Telugu and Hindi', async () => {
    fetchMock.mockReturnValueOnce(json(401));
    render(<PortalSignInPage />);
    await screen.findByLabelText('Your WhatsApp number');
    fireEvent.click(screen.getByRole('button', { name: 'తెలుగు' }));
    expect(screen.getByRole('button', { name: 'నాకు కోడ్ పంపండి' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'हिन्दी' }));
    expect(screen.getByRole('button', { name: 'मुझे कोड भेजें' })).toBeInTheDocument();
  });
});
