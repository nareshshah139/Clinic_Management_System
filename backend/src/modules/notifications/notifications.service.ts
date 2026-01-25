import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

type WhatsAppTemplateParameter =
  | { type: 'text'; text: string }
  | { type: 'currency'; currency: { fallback_value: string; code: string; amount_1000: number } }
  | { type: 'date_time'; date_time: { fallback_value: string } };

type WhatsAppTemplateComponent =
  | { type: 'header'; parameters?: WhatsAppTemplateParameter[] }
  | { type: 'body'; parameters?: WhatsAppTemplateParameter[] }
  | { type: 'button'; sub_type?: 'quick_reply' | 'url'; index?: string; parameters?: WhatsAppTemplateParameter[] };

interface WhatsAppOptions {
  toPhoneE164: string; // E.164 format, e.g., +919999999999
  template?: { name: string; language: string; components?: WhatsAppTemplateComponent[] };
  text?: string;
  // Optional per-doctor overrides
  overrideToken?: string;
  overridePhoneId?: string; // Meta WhatsApp Business Phone Number ID
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly smtpTransporter: nodemailer.Transporter | null;
  private readonly whatsappToken?: string;
  private readonly whatsappPhoneId?: string; // Meta WhatsApp Business Phone Number ID

  constructor() {
    // SMTP init
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      this.smtpTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: (process.env.SMTP_SECURE ?? 'false') === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      } as any);
    } else {
      this.smtpTransporter = null;
    }

    // WhatsApp init
    this.whatsappToken = process.env.WHATSAPP_TOKEN || undefined;
    this.whatsappPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || undefined;
  }

  private normalizeE164(phone: string | undefined | null): string | null {
    if (!phone || typeof phone !== 'string') return null;
    const digits = phone.replace(/[^\d+]/g, '');
    if (!digits) return null;
    return digits.startsWith('+') ? digits : `+${digits}`;
  }

  private async postWhatsApp(
    phoneId: string,
    token: string,
    body: Record<string, any>,
    attempt = 1,
    maxAttempts = 2,
  ): Promise<void> {
    const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    } as Record<string, string>;

    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (err: any) {
      const retryable = attempt < maxAttempts;
      this.logger.error(
        `WhatsApp send failed (network): ${err?.message ?? err}. attempt=${attempt}/${maxAttempts}`,
      );
      if (retryable) {
        return this.postWhatsApp(phoneId, token, body, attempt + 1, maxAttempts);
      }
      throw err;
    }

    if (!res.ok) {
      const isRetryable = (res.status >= 500 || res.status === 429) && attempt < maxAttempts;
      let errText: string | undefined;
      try {
        errText = await res.text();
      } catch {
        errText = undefined;
      }
      this.logger.error(
        `WhatsApp send failed: status=${res.status} attempt=${attempt}/${maxAttempts} body=${errText || 'n/a'}`,
      );
      if (isRetryable) {
        return this.postWhatsApp(phoneId, token, body, attempt + 1, maxAttempts);
      }
    }
  }

  async sendEmail(opts: EmailOptions): Promise<void> {
    if (!this.smtpTransporter) {
      this.logger.warn('SMTP is not configured; skipping email');
      return;
    }
    const from = process.env.SMTP_FROM || process.env.SMTP_USER as string;
    await this.smtpTransporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
  }

  async sendWhatsApp(opts: WhatsAppOptions): Promise<void> {
    const token = opts.overrideToken || this.whatsappToken;
    const phoneId = opts.overridePhoneId || this.whatsappPhoneId;
    if (!token || !phoneId) {
      this.logger.warn('WhatsApp is not configured; skipping message');
      return;
    }
    const normalized = this.normalizeE164(opts.toPhoneE164);
    if (!normalized) {
      this.logger.warn(`WhatsApp send skipped: invalid phone ${opts.toPhoneE164}`);
      return;
    }

    const payload: any = {
      messaging_product: 'whatsapp',
      to: normalized.replace(/^\+/, ''),
      type: opts.template ? 'template' : 'text',
    };
    if (opts.template) {
      payload.template = {
        name: opts.template.name,
        language: { code: opts.template.language },
        components: opts.template.components || [],
      };
    } else if (opts.text) {
      payload.text = { body: opts.text };
    } else {
      this.logger.warn('WhatsApp send skipped: neither template nor text provided');
      return;
    }

    await this.postWhatsApp(phoneId, token, payload);
  }
} 