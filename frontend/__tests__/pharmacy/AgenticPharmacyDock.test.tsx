import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AgenticPharmacyDock } from '@/components/pharmacy/AgenticPharmacyDock';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  apiClient: {
    getPharmacyAgentStatus: jest.fn(),
    listPharmacyAgentSessions: jest.fn(),
    createPharmacyAgentSession: jest.fn(),
    getPharmacyAgentSession: jest.fn(),
    uploadPharmacyAgentAttachment: jest.fn(),
    sendPharmacyAgentMessage: jest.fn(),
    archivePharmacyAgentSession: jest.fn(),
    restorePharmacyAgentSession: jest.fn(),
    applyPharmacyAgentProposal: jest.fn(),
    rejectPharmacyAgentProposal: jest.fn(),
  },
}));

jest.mock('@/hooks/use-toast', () => ({
  toast: jest.fn(),
}));

const api = apiClient as jest.Mocked<typeof apiClient>;

const sessionListItem = {
  id: 'agent-session-1',
  title: 'Agentic Pharmacy',
  status: 'ACTIVE',
  updatedAt: '2026-06-14T10:00:00.000Z',
  lastMessage: 'Previous message',
  pendingProposalCount: 0,
  hasContent: true,
};

const sessionDetail = {
  ...sessionListItem,
  messages: [],
  attachments: [],
  proposals: [],
};

describe('AgenticPharmacyDock chat input shortcuts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getPharmacyAgentStatus.mockResolvedValue({ configured: true });
    api.listPharmacyAgentSessions.mockResolvedValue({ data: [sessionListItem] });
    api.getPharmacyAgentSession.mockResolvedValue(sessionDetail);
    api.createPharmacyAgentSession.mockResolvedValue(sessionDetail);
    api.sendPharmacyAgentMessage.mockResolvedValue({
      message: {
        id: 'assistant-message-1',
        role: 'assistant',
        content: 'Done',
      },
      proposals: [],
    });
  });

  async function renderReadyDock(extra?: { onKeyDown?: jest.Mock }) {
    render(
      <div onKeyDown={extra?.onKeyDown}>
        <AgenticPharmacyDock />
      </div>,
    );

    const textbox = await screen.findByPlaceholderText(
      /Enter sends, Shift\+Enter adds a line/i,
    );
    await waitFor(() =>
      expect(api.getPharmacyAgentSession).toHaveBeenCalledWith(
        'agent-session-1',
      ),
    );
    return textbox as HTMLTextAreaElement;
  }

  it('sends the current message on Enter', async () => {
    const textbox = await renderReadyDock();

    fireEvent.change(textbox, { target: { value: 'Check low stock' } });
    fireEvent.keyDown(textbox, { key: 'Enter', code: 'Enter' });

    await waitFor(() =>
      expect(api.sendPharmacyAgentMessage).toHaveBeenCalledWith(
        'agent-session-1',
        {
          message: 'Check low stock',
          attachmentIds: [],
        },
      ),
    );
  });

  it('keeps Shift+Enter available for multiline input', async () => {
    const textbox = await renderReadyDock();

    fireEvent.change(textbox, { target: { value: 'Line one' } });
    fireEvent.keyDown(textbox, {
      key: 'Enter',
      code: 'Enter',
      shiftKey: true,
    });

    expect(api.sendPharmacyAgentMessage).not.toHaveBeenCalled();
  });

  it('handles paste into the controlled chat textarea', async () => {
    const textbox = await renderReadyDock();

    fireEvent.change(textbox, { target: { value: 'Need ' } });
    textbox.setSelectionRange(5, 5);
    fireEvent.paste(textbox, {
      clipboardData: {
        getData: (type: string) => (type === 'text' ? 'inventory report' : ''),
      },
    });

    await waitFor(() =>
      expect(textbox).toHaveValue('Need inventory report'),
    );
  });

  it('keeps clipboard shortcuts inside the chat textarea', async () => {
    const parentKeyDown = jest.fn();
    const textbox = await renderReadyDock({ onKeyDown: parentKeyDown });

    fireEvent.keyDown(textbox, { key: 'v', code: 'KeyV', ctrlKey: true });
    fireEvent.keyDown(textbox, { key: 'c', code: 'KeyC', metaKey: true });

    expect(parentKeyDown).not.toHaveBeenCalled();
  });
});

describe('AgenticPharmacyDock proposal review', () => {
  const proposal = {
    id: 'proposal-1',
    title: 'Add Telma 40',
    summary: 'One new stock line',
    riskLevel: 'LOW',
    status: 'PENDING_REVIEW',
    actions: [{ id: 'action-1', actionType: 'create_inventory_item', targetType: 'inventory_item', permissionRequired: null }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    api.getPharmacyAgentStatus.mockResolvedValue({ configured: true });
    api.listPharmacyAgentSessions.mockResolvedValue({ data: [sessionListItem] });
    api.getPharmacyAgentSession.mockResolvedValue({ ...sessionDetail, proposals: [proposal] });
  });

  it('sends one review while an Apply is in flight, however often the buttons are clicked', async () => {
    let finishApply!: (value: unknown) => void;
    api.applyPharmacyAgentProposal.mockReturnValue(new Promise((resolve) => (finishApply = resolve)) as any);
    render(<AgenticPharmacyDock />);
    const [apply] = await screen.findAllByRole('button', { name: /Apply/ });
    const [reject] = screen.getAllByRole('button', { name: /Reject/ });

    fireEvent.click(apply);
    fireEvent.click(apply);
    fireEvent.click(reject);

    expect(api.applyPharmacyAgentProposal).toHaveBeenCalledTimes(1);
    expect(api.rejectPharmacyAgentProposal).not.toHaveBeenCalled();
    expect(apply).toBeDisabled();
    expect(reject).toBeDisabled();

    finishApply({ proposal: { ...proposal, status: 'APPLIED' } });
    await waitFor(() => expect(screen.queryAllByRole('button', { name: /Apply/ })).toHaveLength(0));
  });

  it('lets the pharmacist try again after a refused Apply', async () => {
    api.applyPharmacyAgentProposal.mockRejectedValue(new Error('Proposal is FAILED'));
    render(<AgenticPharmacyDock />);
    const [apply] = await screen.findAllByRole('button', { name: /Apply/ });

    fireEvent.click(apply);
    await waitFor(() => expect(apply).not.toBeDisabled());
    fireEvent.click(apply);

    await waitFor(() => expect(api.applyPharmacyAgentProposal).toHaveBeenCalledTimes(2));
  });

  describe('higher-risk proposals', () => {
    const highRisk = {
      ...proposal,
      id: 'proposal-high',
      title: 'Correct stock for Telma 40',
      riskLevel: 'HIGH',
      actions: [
        {
          id: 'action-high',
          actionType: 'adjust_stock',
          targetType: 'inventory_item',
          targetId: 'stock-77',
          permissionRequired: null,
          preview: { newQuantity: 0, reasonNote: 'Expired batch' },
        },
      ],
    };

    beforeEach(() => {
      api.getPharmacyAgentSession.mockResolvedValue({ ...sessionDetail, proposals: [highRisk] });
      api.applyPharmacyAgentProposal.mockResolvedValue({ proposal: { ...highRisk, status: 'APPLIED' } });
    });

    it('shows what will change and does not apply until confirmed', async () => {
      render(<AgenticPharmacyDock />);
      const [apply] = await screen.findAllByRole('button', { name: /Apply/ });

      expect(screen.getAllByText('stock-77').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Expired batch').length).toBeGreaterThan(0);

      fireEvent.click(apply);
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog).toHaveTextContent('Correct stock for Telma 40');
      expect(dialog).toHaveTextContent('stock-77');
      expect(dialog).toHaveTextContent('Expired batch');
      expect(api.applyPharmacyAgentProposal).not.toHaveBeenCalled();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Apply changes' }));
      await waitFor(() => expect(api.applyPharmacyAgentProposal).toHaveBeenCalledWith('proposal-high'));
    });

    it('never applies when the pharmacist cancels', async () => {
      render(<AgenticPharmacyDock />);
      const [apply] = await screen.findAllByRole('button', { name: /Apply/ });

      fireEvent.click(apply);
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(api.applyPharmacyAgentProposal).not.toHaveBeenCalled();
    });
  });

  it('labels the in-progress state neutrally', async () => {
    let finishSend!: (value: unknown) => void;
    api.sendPharmacyAgentMessage.mockReturnValue(new Promise((resolve) => (finishSend = resolve)) as any);
    render(<AgenticPharmacyDock />);
    const box = await screen.findByPlaceholderText(/Enter sends, Shift\+Enter adds a line/i);
    fireEvent.change(box, { target: { value: 'hello' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(await screen.findByText('Assistant is working')).toBeInTheDocument();
    expect(screen.queryByText(/Codex/)).toBeNull();
    finishSend({ message: { id: 'm', role: 'assistant', content: 'ok' }, proposals: [] });
  });
});
