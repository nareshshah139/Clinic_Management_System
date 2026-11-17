import { UserRole } from '@cms/shared-types';
import { StrictMode, type ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import { VoiceBar } from '@/components/voice/VoiceBar';
import { VoiceBarProvider, useVoiceBarForm } from '@/components/voice/VoiceBarProvider';
import { startDictationSession, type DictationOutcome } from '@/lib/dictation-session';
import type { User } from '@/lib/types';
import { resetVoiceFillStatusForTests, voiceDraftLines, type VoiceBarApplyResult, type VoiceFillFields, type VoiceFillRegistry } from '@/lib/voice-fill';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/api', () => ({ apiClient: { get: async () => ({ available: true }) } }));
jest.mock('@/lib/dictation-session', () => ({
  ...jest.requireActual('@/lib/dictation-session'),
  startDictationSession: jest.fn(),
}));

const user = { id: 'u1', role: UserRole.DOCTOR } as User;
const registry: VoiceFillRegistry = {
  diagnosis: { label: 'Diagnosis', apply: () => null },
  advice: { label: 'Advice', apply: () => null },
};

type Apply = (fields: VoiceFillFields) => VoiceBarApplyResult;

function VisitPage({ scope, apply }: { scope: string; apply: Apply }) {
  const { busy } = useVoiceBarForm({
    form: 'visit-consultation',
    label: 'Visit notes',
    hint: 'Say or type the visit notes',
    scope,
    preview: (fields) => voiceDraftLines(registry, fields),
    apply,
  });
  return <p>{busy ? 'Voice is working on this visit' : 'Voice is idle'}</p>;
}

function Shell({ children }: { children?: ReactNode }) {
  return (
    <StrictMode>
      <DashboardUserProvider value={{ user, loading: false, refresh: async () => {}, logout: async () => {} }}>
        <VoiceBarProvider>
          {children}
          <VoiceBar />
        </VoiceBarProvider>
      </DashboardUserProvider>
    </StrictMode>
  );
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });
let fetchMock: jest.Mock;

beforeEach(() => {
  resetVoiceFillStatusForTests();
  fetchMock = jest.fn().mockResolvedValue(ok({ transcript: 'Eczema, moisturise twice a day', fields: { diagnosis: 'Eczema', advice: 'Moisturise twice a day' } }));
  global.fetch = fetchMock as unknown as typeof fetch;
});

async function openDraft() {
  await userEvent.type(await screen.findByRole('textbox', { name: 'Say or type a request' }), 'eczema{Enter}');
  return screen.findByRole('button', { name: 'Add to form' });
}

describe('VoiceBarProvider under Strict Mode', () => {
  it('holds exactly one registration while the page is mounted and none after it unmounts', async () => {
    const view = render(<Shell><VisitPage scope="visit-1" apply={jest.fn()} /></Shell>);

    const target = await screen.findByRole('combobox', { name: 'Send to' });
    expect(within(target).getAllByRole('option').map((option) => option.textContent)).toEqual(['Visit notes', 'Command']);

    view.rerender(<Shell />);
    expect(screen.queryByRole('combobox', { name: 'Send to' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Say or type a request' })).toHaveAttribute(
      'placeholder', 'Say or type a command, e.g. Book Ramesh Kumar with Dr Shravya tomorrow at 10',
    );
  });

  it('reports busy to the registering page only while its request is in flight', async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<Shell><VisitPage scope="visit-1" apply={jest.fn()} /></Shell>);

    await userEvent.type(await screen.findByRole('textbox', { name: 'Say or type a request' }), 'eczema{Enter}');
    expect(screen.getByText('Voice is working on this visit')).toBeInTheDocument();

    finish(ok({ transcript: 'eczema', fields: { diagnosis: 'Eczema' } }));
    expect(await screen.findByRole('button', { name: 'Add to form' })).toBeEnabled();
    expect(screen.getByText('Voice is idle')).toBeInTheDocument();
  });

  it('keeps the draft when the page re-renders with a new apply, and applies through the newest one', async () => {
    const firstApply = jest.fn<VoiceBarApplyResult, [VoiceFillFields]>();
    const latestApply = jest.fn<VoiceBarApplyResult, [VoiceFillFields]>(() => ({ filled: [{ label: 'Diagnosis' }, { label: 'Advice' }], undo: () => {} }));
    const view = render(<Shell><VisitPage scope="visit-1" apply={firstApply} /></Shell>);
    await openDraft();

    view.rerender(<Shell><VisitPage scope="visit-1" apply={latestApply} /></Shell>);
    await userEvent.click(screen.getByRole('button', { name: 'Add to form' }));

    expect(latestApply.mock.calls).toEqual([[{ diagnosis: 'Eczema', advice: 'Moisturise twice a day' }]]);
    expect(firstApply.mock.calls).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent('Added to Visit notes: Diagnosis, Advice. Nothing is saved until you save the form.');
  });

  it('discards the draft with a notice when the scope changes', async () => {
    const apply = jest.fn();
    const view = render(<Shell><VisitPage scope="visit-1" apply={apply} /></Shell>);
    await openDraft();

    view.rerender(<Shell><VisitPage scope="visit-2" apply={apply} /></Shell>);

    expect(screen.queryByRole('button', { name: 'Add to form' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('The page changed, so this draft was discarded.');
  });

  it('drops a pending Undo when the scope changes', async () => {
    const undo = jest.fn();
    const apply = jest.fn(() => ({ filled: [{ label: 'Diagnosis' }], undo }));
    const view = render(<Shell><VisitPage scope="visit-1" apply={apply} /></Shell>);
    await userEvent.click(await openDraft());
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();

    view.rerender(<Shell><VisitPage scope="visit-2" apply={apply} /></Shell>);

    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('The page changed, so this draft was discarded.');
    expect(undo.mock.calls).toEqual([]);
  });

  it('opens one dictation for one press and releases it when the bar unmounts', async () => {
    const log: string[] = [];
    jest.mocked(startDictationSession).mockImplementation(async () => {
      log.push('start');
      return { outcome: new Promise<DictationOutcome>(() => {}), stop: () => log.push('stop'), dispose: () => log.push('dispose') };
    });
    const view = render(<Shell><VisitPage scope="visit-1" apply={jest.fn()} /></Shell>);

    await userEvent.click(await screen.findByRole('button', { name: 'Speak' }));
    expect(screen.getByText('Voice is working on this visit')).toBeInTheDocument();
    view.unmount();

    expect(log).toEqual(['start', 'dispose']);
  });
});
