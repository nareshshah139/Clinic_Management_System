import { startFakeMeta } from './fake-meta';
import { WhatsAppNotConfiguredError, WhatsAppRejectedError, WhatsAppSender, WhatsAppUnavailableError } from '../whatsapp-sender';

describe('WhatsAppSender against a fake Meta endpoint (PP-12)', () => {
  let meta: Awaited<ReturnType<typeof startFakeMeta>>;
  const env = { ...process.env };
  const sender = new WhatsAppSender();

  beforeAll(async () => { meta = await startFakeMeta(); });
  afterAll(async () => { await meta.close(); process.env = env; });
  beforeEach(() => {
    meta.reset();
    process.env.WHATSAPP_TOKEN = 'test-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1234';
    process.env.WHATSAPP_GRAPH_BASE_URL = meta.baseUrl;
  });

  it('posts to the clinic number endpoint and returns the provider message id', async () => {
    const out = await sender.send('+919876543210', { kind: 'template', name: 'number_confirmation', language: 'te', components: [] });
    expect(out).toEqual({ providerMessageId: 'wamid.fake.1' });
    expect(meta.calls[0]).toMatchObject({ path: '/v18.0/1234/messages', auth: 'Bearer test-token' });
    expect(meta.calls[0].body).toMatchObject({ to: '919876543210', type: 'template', template: { name: 'number_confirmation', language: { code: 'te' } } });
  });

  it('throws WhatsAppNotConfiguredError without credentials and calls nothing', async () => {
    delete process.env.WHATSAPP_TOKEN;
    await expect(sender.send('+919876543210', { kind: 'text', text: 'x' })).rejects.toBeInstanceOf(WhatsAppNotConfiguredError);
    expect(meta.calls).toHaveLength(0);
  });

  it('throws WhatsAppRejectedError with the provider code on 4xx', async () => {
    meta.answerNext(400, { error: { code: 131026, message: 'undeliverable' } });
    await expect(sender.send('+919876543210', { kind: 'text', text: 'x' })).rejects.toMatchObject({ name: 'WhatsAppRejectedError', status: 400, code: '131026' });
  });

  it('throws WhatsAppUnavailableError on 5xx and 429 so the pass retries', async () => {
    meta.answerNext(503, {});
    await expect(sender.send('+919876543210', { kind: 'text', text: 'x' })).rejects.toBeInstanceOf(WhatsAppUnavailableError);
    meta.answerNext(429, {});
    await expect(sender.send('+919876543210', { kind: 'text', text: 'x' })).rejects.toBeInstanceOf(WhatsAppUnavailableError);
  });

  it('treats a 200 without a message id as rejected, never as sent', async () => {
    meta.answerNext(200, { messages: [] });
    await expect(sender.send('+919876543210', { kind: 'text', text: 'x' })).rejects.toBeInstanceOf(WhatsAppRejectedError);
  });
});
