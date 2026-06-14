import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
