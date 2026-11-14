import nodemailer from 'nodemailer';
import { NotificationsService } from './notifications.service';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

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


describe('NotificationsService (email)', () => {
  const realEnv = { ...process.env };
  const sendMail = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    process.env = { ...realEnv };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
  });

  afterEach(() => {
    process.env = realEnv;
  });

  const configure = () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'clinic@example.com';
    process.env.SMTP_PASS = 'secret';
  };

  it('rejects sendEmail with the setup message when SMTP is absent', async () => {
    const svc = new NotificationsService();
    await expect(svc.sendEmail({ to: 'a@b.com', subject: 's', text: 't' })).rejects.toThrow(
      'Email is not configured on the server. Ask an admin to set SMTP_HOST, SMTP_USER and SMTP_PASS.',
    );
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('reports unconfigured status without a sender', () => {
    expect(new NotificationsService().emailStatus()).toEqual({ configured: false, from: null });
  });

  it('reports configured status with SMTP_USER as sender by default', () => {
    configure();
    expect(new NotificationsService().emailStatus()).toEqual({
      configured: true,
      from: 'clinic@example.com',
    });
  });

  it('prefers SMTP_FROM as the reported sender', () => {
    configure();
    process.env.SMTP_FROM = 'Clinic <noreply@example.com>';
    expect(new NotificationsService().emailStatus().from).toBe('Clinic <noreply@example.com>');
  });

  it('sends through the transporter with from, to and subject', async () => {
    configure();
    sendMail.mockResolvedValue({});
    const svc = new NotificationsService();
    await svc.sendEmail({ to: 'patient@example.com', subject: 'Hello', text: 'Body' });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'clinic@example.com',
      to: 'patient@example.com',
      subject: 'Hello',
      html: undefined,
      text: 'Body',
      attachments: undefined,
    });
  });
});
