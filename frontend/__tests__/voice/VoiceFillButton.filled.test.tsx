import { act, fireEvent, render, screen } from '@testing-library/react';
import { VoiceFillButton } from '@/components/voice/VoiceFillButton';
import { resetVoiceFillStatusForTests } from '@/lib/voice-fill';

const toast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@/lib/api', () => ({ apiClient: { get: async () => ({ available: true }) } }));

class FakeMediaRecorder {
  static isTypeSupported = (type: string) => type === 'audio/webm';
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

const undo = jest.fn();
const apply = jest.fn(() => ({
  filled: [{ label: 'First name' }, { label: 'Last name' }, { label: 'Age' }, { label: 'Gender' }, { label: 'Phone' }, { label: 'Address' }],
  undo,
}));

beforeEach(() => {
  jest.clearAllMocks();
  resetVoiceFillStatusForTests();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => ({ transcript: 'Ramesh Kumar', fields: { firstName: 'Ramesh' } }), text: async () => '',
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'MediaRecorder', { value: FakeMediaRecorder, configurable: true, writable: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] }) },
    configurable: true,
  });
});

afterEach(() => {
  jest.useRealTimers();
});

async function fillByVoice() {
  render(
    <form>
      <input aria-label="First name" />
      <VoiceFillButton form="patient-intake" apply={apply} hint="Say name, age…" />
    </form>,
  );
  const mic = await screen.findByRole('button', { name: 'Fill form by voice' });
  await act(async () => { fireEvent.click(mic); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stop recording and fill form' })); });
  return mic;
}

describe('VoiceFillButton after a fill', () => {
  it('confirms on the pill with the count, announces the fields, offers Undo and shows no toast', async () => {
    const mic = await fillByVoice();

    expect(mic).toHaveTextContent('6 filled');
    expect(mic).toHaveAccessibleName('6 filled. Fill by voice again');
    expect(screen.getByRole('status')).toHaveTextContent('Filled 6 fields: First name, Last name, Age, Gender, Phone, Address');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(toast.mock.calls).toEqual([]);
  });

  it('undoes the fill from the pill, returns to the mic and keeps focus on it', async () => {
    const mic = await fillByVoice();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(undo.mock.calls.length).toBe(1);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(mic).toHaveAccessibleName('Fill form by voice');
    expect(document.activeElement).toBe(mic);
  });

  it('collapses back to the mic after 12 seconds, held open while Undo has focus', async () => {
    jest.useFakeTimers();
    const mic = await fillByVoice();

    act(() => { screen.getByRole('button', { name: 'Undo' }).focus(); });
    act(() => { jest.advanceTimersByTime(30_000); });
    expect(mic).toHaveTextContent('6 filled');

    act(() => { mic.focus(); });
    act(() => { jest.advanceTimersByTime(11_999); });
    expect(mic).toHaveTextContent('6 filled');
    act(() => { jest.advanceTimersByTime(1); });
    expect(mic).toHaveAccessibleName('Fill form by voice');
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(undo.mock.calls).toEqual([]);
  });

  it('steps back to the mic as soon as the user edits the form', async () => {
    const mic = await fillByVoice();

    fireEvent.input(screen.getByRole('textbox', { name: 'First name' }), { target: { value: 'Rames' } });

    expect(mic).toHaveAccessibleName('Fill form by voice');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});
