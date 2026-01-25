import { NotificationsService } from './notifications.service';

describe('NotificationsService (WhatsApp)', () => {
  const realEnv = { ...process.env };
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    (global as any).fetch = fetchMock;
    process.env = { ...realEnv, WHATSAPP_TOKEN: 'test-token', WHATSAPP_PHONE_NUMBER_ID: 'phone-123' };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    });
  });

  afterEach(() => {
    process.env = realEnv;
  });

  it('sends plain text WhatsApp with normalized phone', async () => {
    const svc = new NotificationsService();
    await svc.sendWhatsApp({ toPhoneE164: '9199998888', text: 'hello' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/phone-123/messages');
    const body = JSON.parse((options as any).body);
    expect(body.type).toBe('text');
    expect(body.to).toBe('9199998888'); // stripped plus
    expect(body.text.body).toBe('hello');
  });

  it('sends template WhatsApp with overrides and components', async () => {
    const svc = new NotificationsService();
    await svc.sendWhatsApp({
      toPhoneE164: '+18005551234',
      template: {
        name: 'appt_template',
        language: 'en',
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Alice' }] }],
      },
      overrideToken: 'override-token',
      overridePhoneId: 'phone-override',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/phone-override/messages');
    expect((options as any).headers.Authorization).toBe('Bearer override-token');
    const body = JSON.parse((options as any).body);
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('appt_template');
    expect(body.template.components?.[0]?.parameters?.[0]?.text).toBe('Alice');
  });
});

