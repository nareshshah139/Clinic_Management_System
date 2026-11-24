import { Injectable } from '@nestjs/common';

export class WhatsAppNotConfiguredError extends Error {
  constructor() {
    super('The clinic WhatsApp number is not configured');
    this.name = 'WhatsAppNotConfiguredError';
  }
}

export class WhatsAppRejectedError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`WhatsApp rejected the message (${status} ${code})`);
    this.name = 'WhatsAppRejectedError';
  }
}

export class WhatsAppUnavailableError extends Error {
  constructor(readonly status: number | null) {
    super(`WhatsApp could not be reached (${status ?? 'network'})`);
    this.name = 'WhatsAppUnavailableError';
  }
}

export type WhatsAppPayload =
  | { kind: 'text'; text: string }
  | { kind: 'template'; name: string; language: string; components?: unknown[] };

/**
 * @cc [owner:nareshshah139,label:integrity] automated-whatsapp-sender
 * Automated sends MUST go through this sender from the clinic's one number: it returns the
 * provider message id, throws WhatsAppNotConfiguredError without credentials, WhatsAppRejectedError
 * when the provider refuses (4xx), and WhatsAppUnavailableError when it may succeed on retry. It
 * never logs the message body.
 */
@Injectable()
export class WhatsAppSender {
  private config() {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const base = (process.env.WHATSAPP_GRAPH_BASE_URL || 'https://graph.facebook.com/v18.0').replace(/\/+$/, '');
    if (!token || !phoneId) throw new WhatsAppNotConfiguredError();
    return { token, url: `${base}/${phoneId}/messages` };
  }

  isConfigured(): boolean {
    return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  }

  async send(toE164: string, payload: WhatsAppPayload): Promise<{ providerMessageId: string }> {
    const { token, url } = this.config();
    const body =
      payload.kind === 'text'
        ? { messaging_product: 'whatsapp', to: toE164.replace(/^\+/, ''), type: 'text', text: { body: payload.text } }
        : {
            messaging_product: 'whatsapp',
            to: toE164.replace(/^\+/, ''),
            type: 'template',
            template: { name: payload.name, language: { code: payload.language }, ...(payload.components ? { components: payload.components } : {}) },
          };
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new WhatsAppUnavailableError(null);
    }
    const json: any = await res.json().catch(() => ({}));
    if (res.status === 429 || res.status >= 500) throw new WhatsAppUnavailableError(res.status);
    if (!res.ok) throw new WhatsAppRejectedError(res.status, String(json?.error?.code ?? 'unknown'));
    const id = json?.messages?.[0]?.id;
    if (typeof id !== 'string' || !id) throw new WhatsAppRejectedError(res.status, 'no-message-id');
    return { providerMessageId: id };
  }
}
