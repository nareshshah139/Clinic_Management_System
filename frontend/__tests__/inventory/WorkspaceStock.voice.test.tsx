import { UserRole } from '@cms/shared-types';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import { WorkspaceStock } from '@/components/inventory/WorkspaceStock';
import { VoiceBar } from '@/components/voice/VoiceBar';
import { VoiceBarProvider } from '@/components/voice/VoiceBarProvider';
import { apiClient } from '@/lib/api';
import type { User } from '@/lib/types';
import { resetVoiceFillStatusForTests } from '@/lib/voice-fill';
import roleCapabilities from '../fixtures/workspace-capabilities.json';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/api', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), createInventoryItem: jest.fn() },
}));

const api = jest.mocked(apiClient);
const heard = {
  transcript: 'Paracetamol tablet 500 mg, batch B12, MRP 30',
  fields: { name: 'Paracetamol', form: 'TABLET', strength: '500 mg', mrp: 30, batchNumber: 'B12' },
};
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });

function renderStock(role: keyof typeof roleCapabilities, capabilities: object = roleCapabilities[role]) {
  const user = { id: 'u1', role: UserRole[role] } as User;
  return render(
    <DashboardUserProvider value={{ user, loading: false, refresh: async () => {}, logout: async () => {} }}>
      <VoiceBarProvider>
        <WorkspaceStock query={{}} navigate={jest.fn()} capabilities={capabilities} onTask={jest.fn()} onDocument={jest.fn()} onInvoice={jest.fn()} />
        <VoiceBar />
      </VoiceBarProvider>
    </DashboardUserProvider>,
  );
}

async function speak() {
  await userEvent.type(await screen.findByRole('textbox', { name: 'Say or type a request' }), 'paracetamol 500{Enter}');
}

beforeEach(() => {
  Object.values(api).forEach((fn) => (fn as jest.Mock).mockReset());
  api.get.mockImplementation(async (url: string) =>
    url === '/voice-fill/status' ? { available: true } : { rows: [], total: 0, page: 1, totalPages: 1, facets: {}, quality: {} });
  resetVoiceFillStatusForTests();
  global.fetch = jest.fn().mockResolvedValue(ok(heard)) as unknown as typeof fetch;
});

describe('WorkspaceStock voice bar', () => {
  it('opens the add-item dialog with the kept fields filled, a note, and saves nothing', async () => {
    renderStock('PHARMACIST');
    await speak();

    const bar = screen.getByRole('region', { name: 'Voice bar' });
    expect(await within(bar).findAllByRole('checkbox')).toHaveLength(5);
    await userEvent.click(screen.getByRole('checkbox', { name: 'MRP: 30' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add to form' }));

    const dialog = await screen.findByRole('dialog', { name: 'Add Inventory Item' });
    expect(within(dialog).getByRole('note')).toHaveTextContent('Filled by voice. Check every field before you save.');
    expect(within(dialog).getByLabelText(/Medicine name/i)).toHaveValue('Paracetamol');
    expect(within(dialog).getByLabelText(/^Form/i)).toHaveValue('TABLET');
    expect(within(dialog).getByLabelText(/^Strength/i)).toHaveValue('500 mg');
    expect(within(dialog).getByLabelText(/Batch Number/i)).toHaveValue('B12');
    expect(within(dialog).getByLabelText(/MRP/i)).toHaveValue(null);
    expect(api.createInventoryItem).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();

    expect(screen.getByText(/Nothing is saved until you press its save button/, { selector: '[role="status"]' })).toHaveTextContent(
      'Added to New stock item: Name, Form, Strength, Batch number. New stock item is open. Nothing is saved until you press its save button.',
    );
    expect(screen.queryByRole('button', { name: 'Undo', hidden: true })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Add Item' })).not.toHaveFocus();
  });

  it('opens by hand with no note and empty fields, and is empty again after a voice-filled dialog is cancelled', async () => {
    renderStock('PHARMACIST');

    await userEvent.click(await screen.findByRole('button', { name: 'Add batch' }));
    let dialog = await screen.findByRole('dialog', { name: 'Add Inventory Item' });
    expect(within(dialog).queryByRole('note')).toBeNull();
    expect(within(dialog).getByLabelText(/Medicine name/i)).toHaveValue('');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await speak();
    await userEvent.click(await screen.findByRole('button', { name: 'Add to form' }));
    dialog = await screen.findByRole('dialog', { name: 'Add Inventory Item' });
    expect(within(dialog).getByLabelText(/Medicine name/i)).toHaveValue('Paracetamol');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(/Nothing is saved until you press its save button/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Add batch' }));
    dialog = await screen.findByRole('dialog', { name: 'Add Inventory Item' });
    expect(within(dialog).queryByRole('note')).toBeNull();
    expect(within(dialog).getByLabelText(/Medicine name/i)).toHaveValue('');
    expect(within(dialog).getByLabelText(/^Strength/i)).toHaveValue('');
    expect(within(dialog).getByLabelText(/Batch Number/i)).toHaveValue('');
  });

  it('registers nothing when the user cannot create items', async () => {
    renderStock('PHARMACIST', { ...roleCapabilities.PHARMACIST, itemCreate: false });

    await screen.findByRole('textbox', { name: 'Say or type a request' });
    expect(screen.queryByRole('button', { name: 'Add batch' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Send to' })).toBeNull();
    expect(screen.queryByText('New stock item')).toBeNull();
  });
});
