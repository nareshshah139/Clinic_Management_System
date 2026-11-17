import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import html2canvas from 'html2canvas';
import { apiClient } from '@/lib/api';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import { ReportIssueProvider } from '@/components/issue-report/ReportIssueProvider';
import { ReportIssueButton } from '@/components/issue-report/ReportIssueButton';
import type { User } from '@/lib/types';

jest.mock('@/lib/api', () => ({ apiClient: { getIssueReportStatus: jest.fn(), submitIssueReport: jest.fn() } }));
jest.mock('html2canvas', () => ({ __esModule: true, default: jest.fn() }));

const api = apiClient as jest.Mocked<typeof apiClient>;
const capture = html2canvas as unknown as jest.Mock;
const shot = new Blob(['png-bytes'], { type: 'image/png' });

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:preview');
  URL.revokeObjectURL = jest.fn();
});

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  window.history.pushState({}, '', '/dashboard/patients/3f2b1c9e-4d5a-4b6c-8d7e-9f0a1b2c3d4e?tab=visits');
  api.getIssueReportStatus.mockResolvedValue({ enabled: true });
  capture.mockResolvedValue({ width: 10, height: 10, toBlob: (done: (blob: Blob) => void) => done(shot) });
});

function renderApp() {
  const user = { id: 'u1', role: 'DOCTOR' } as unknown as User;
  return render(
    <DashboardUserProvider value={{ user, loading: false, refresh: async () => {}, logout: async () => {} }}>
      <ReportIssueProvider>
        <ReportIssueButton />
      </ReportIssueProvider>
    </DashboardUserProvider>,
  );
}

async function openDialog() {
  await userEvent.click(await screen.findByRole('button', { name: 'Report a problem' }));
  const dialog = await screen.findByRole('dialog', { name: 'Report a problem' });
  await within(dialog).findByRole('button', { name: 'Open screenshot 1 to redact' });
  return dialog;
}

it('sends the title, the captured screen and the context, then shows the issue', async () => {
  api.submitIssueReport.mockResolvedValue({ number: 42, url: 'https://github.com/acme/clinic/issues/42' });
  renderApp();
  const dialog = await openDialog();

  expect(within(dialog).getByLabelText('Summarize it in a line')).toHaveFocus();
  await userEvent.click(within(dialog).getByRole('radio', { name: 'Question' }));
  await userEvent.type(within(dialog).getByLabelText('Summarize it in a line'), 'How do I refund a bill?');
  await userEvent.type(within(dialog).getByLabelText(/Details/), 'Pharmacy sale from today');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));

  expect(await screen.findByRole('heading', { name: "Thanks, we've got it" })).toBeInTheDocument();
  expect(screen.getByText("Your report is issue #42 on the team's tracker. Updates will appear there.")).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View on GitHub' })).toHaveAttribute('href', 'https://github.com/acme/clinic/issues/42');

  const form = api.submitIssueReport.mock.calls[0][0];
  expect(form.get('kind')).toBe('question');
  expect(form.get('title')).toBe('How do I refund a bill?');
  expect(form.get('description')).toBe('Pharmacy sale from today');
  const file = form.get('screenshots') as File;
  expect([file.name, file.type, file.size]).toEqual(['screenshot-1.png', 'image/png', 9]);
  const context = JSON.parse(form.get('context') as string);
  expect([context.page, context.viewport, context.recentRequests]).toEqual(['/dashboard/patients/:id', '1024x768 @1x', []]);

  await userEvent.click(screen.getByRole('button', { name: 'Done' }));
  await userEvent.click(screen.getByRole('button', { name: 'Report a problem' }));
  expect(await screen.findByLabelText('Summarize it in a line')).toHaveValue('');
});

it('leaves out technical details when switched off', async () => {
  api.submitIssueReport.mockResolvedValue({ number: 7, url: 'https://github.com/acme/clinic/issues/7' });
  renderApp();
  const dialog = await openDialog();
  await userEvent.type(within(dialog).getByLabelText('Summarize it in a line'), 'Slow search');
  await userEvent.click(within(dialog).getByRole('switch', { name: 'Include technical details' }));
  await userEvent.keyboard('{Control>}{Enter}{/Control}');
  await screen.findByRole('heading', { name: "Thanks, we've got it" });
  expect(api.submitIssueReport.mock.calls[0][0].has('context')).toBe(false);
});

it('explains why it cannot send yet instead of sending', async () => {
  renderApp();
  const dialog = await openDialog();
  await userEvent.type(within(dialog).getByLabelText('Summarize it in a line'), 'ab');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
  expect(within(dialog).getByLabelText('Summarize it in a line')).toHaveAccessibleDescription(
    "Add a few words so the team knows what it's about.",
  );
  expect(api.submitIssueReport).not.toHaveBeenCalled();
});

it('keeps the draft when closed by accident and does not capture again', async () => {
  renderApp();
  const dialog = await openDialog();
  await userEvent.type(within(dialog).getByLabelText('Summarize it in a line'), 'Printer stuck');
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  const reopened = await openDialog();
  expect(within(reopened).getByLabelText('Summarize it in a line')).toHaveValue('Printer stuck');
  expect(within(reopened).getByText('Picked up where you left off.')).toBeInTheDocument();
  expect(within(reopened).queryByRole('button', { name: 'Open screenshot 2 to redact' })).not.toBeInTheDocument();
});

it('shows the server message and keeps everything when sending fails', async () => {
  const message = "GitHub didn't accept the report. Try again in a minute.";
  api.submitIssueReport.mockRejectedValue(
    Object.assign(new Error(`${message} (Reference: 11111111-1111-4111-8111-111111111111)`), {
      status: 502,
      body: { message },
      requestId: '11111111-1111-4111-8111-111111111111',
    }),
  );
  renderApp();
  const dialog = await openDialog();
  await userEvent.type(within(dialog).getByLabelText('Summarize it in a line'), 'Printer stuck');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    "The report wasn't sent. Everything you wrote is still here." + message + 'Reference: 11111111-1111-4111-8111-111111111111',
  );
  expect(within(dialog).getByLabelText('Summarize it in a line')).toHaveValue('Printer stuck');
  expect(within(dialog).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});

it('says why a file was not attached', async () => {
  renderApp();
  const dialog = await openDialog();
  await userEvent.upload(within(dialog).getByLabelText('Add screenshots'), new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' }), {
    applyAccept: false,
  });
  expect(within(dialog).getByRole('alert')).toHaveTextContent('"notes.pdf" isn\'t a PNG, JPG or WebP image.');
  await userEvent.upload(within(dialog).getByLabelText('Add screenshots'), new File(['x'], 'photo.webp', { type: 'image/webp' }));
  expect(within(dialog).getByRole('button', { name: 'Open screenshot 2 to redact' })).toBeInTheDocument();
});

it('hides the entry point when reporting is not set up', async () => {
  api.getIssueReportStatus.mockResolvedValue({ enabled: false });
  renderApp();
  await waitFor(() => expect(api.getIssueReportStatus).toHaveBeenCalled());
  await act(async () => {});
  expect(screen.queryByRole('button', { name: 'Report a problem' })).not.toBeInTheDocument();
});
