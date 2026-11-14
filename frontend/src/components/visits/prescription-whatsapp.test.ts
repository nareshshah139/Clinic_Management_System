import { canSendWhatsAppDirectly, sendPrescriptionPdfDirectly } from './prescription-whatsapp';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { getWhatsAppConnection: jest.fn(), sharePrescriptionPreview: jest.fn() } }));
const api = apiClient as unknown as Record<string, jest.Mock>;

describe('PDF via WhatsApp from the prescription builder', () => {
  beforeEach(() => jest.resetAllMocks());

  it('sends directly when the clinic is linked or a server number exists, and falls back otherwise', async () => {
    const answers = [{ linked: true }, { linked: false, fallback: 'SERVER_ENV' }, { linked: false, fallback: null }];
    for (const answer of answers) api.getWhatsAppConnection.mockResolvedValueOnce(answer);
    api.getWhatsAppConnection.mockRejectedValueOnce(new Error('offline'));
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await canSendWhatsAppDirectly());
    expect(results).toEqual([true, true, false, false]);
  });

  it('reports the message id WhatsApp accepted, or the reason it refused', async () => {
    const file = new File(['%PDF-1.7'], 'prescription-rx.pdf', { type: 'application/pdf' });
    api.sharePrescriptionPreview
      .mockResolvedValueOnce({ status: 'ACCEPTED', wamid: 'wamid.RX', channel: 'WHATSAPP', to: '9704802443' })
      .mockRejectedValueOnce({ body: { message: 'This number is not on WhatsApp or cannot receive messages.' } });
    expect(await sendPrescriptionPdfDirectly('rx', file, '9704802443')).toEqual({
      ok: true, title: 'Sent on WhatsApp', description: 'WhatsApp accepted the prescription for 9704802443. Message ID wamid.RX.',
    });
    expect(await sendPrescriptionPdfDirectly('rx', file, '9704802443')).toEqual({
      ok: false, title: 'WhatsApp not sent', description: 'This number is not on WhatsApp or cannot receive messages.',
    });
    expect(api.sharePrescriptionPreview.mock.calls[0]).toEqual(['rx', file, { channel: 'WHATSAPP', to: '9704802443', message: 'Your prescription is attached.' }]);
  });
});
