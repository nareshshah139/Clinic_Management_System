import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceFillButton, formatElapsed } from '@/components/voice/VoiceFillButton';
import type { VoiceFillPhase } from '@/hooks/useVoiceFill';

let status = true;
let phase: VoiceFillPhase = { kind: 'idle' };
const toggle = jest.fn();
const cancel = jest.fn();

jest.mock('@/lib/api', () => ({ apiClient: {} }));
jest.mock('@/lib/voice-fill', () => ({ fetchVoiceFillStatus: () => Promise.resolve(status) }));
jest.mock('@/hooks/useVoiceFill', () => ({ useVoiceFill: () => ({ phase, toggle, cancel }) }));

const props = { form: 'patient-intake' as const, apply: jest.fn(), hint: 'Say name, age…' };

describe('VoiceFillButton', () => {
  beforeEach(() => {
    status = true;
    phase = { kind: 'idle' };
    jest.clearAllMocks();
  });

  it('renders nothing when voice fill is unavailable', async () => {
    status = false;
    const { container } = render(<VoiceFillButton {...props} />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the mic button when available and toggles on click', async () => {
    render(<VoiceFillButton {...props} />);
    const button = await screen.findByRole('button', { name: 'Fill form by voice' });
    await userEvent.click(button);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('shows elapsed time while listening and cancels on Escape', async () => {
    phase = { kind: 'listening', startedAt: Date.now() - 65_000 };
    render(<VoiceFillButton {...props} />);
    expect(await screen.findByText('1:05')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('announces filling without offering a stop action', async () => {
    phase = { kind: 'filling' };
    render(<VoiceFillButton {...props} />);
    expect(await screen.findByRole('button', { name: 'Filling…' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('formats elapsed seconds as m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(9.9)).toBe('0:09');
    expect(formatElapsed(600)).toBe('10:00');
  });
});
