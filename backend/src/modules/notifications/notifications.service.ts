import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

interface WhatsAppOptions {
  toPhoneE164: string; // E.164 format, e.g., +919999999999
  template?: { name: string; language: string; components?: any[] };
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
    const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    } as any;
    const body: any = {
      messaging_product: 'whatsapp',
      to: opts.toPhoneE164.replace(/^\+/, ''),
      type: opts.template ? 'template' : 'text',
    };
    if (opts.template) {
      body.template = {
        name: opts.template.name,
        language: { code: opts.template.language },
        components: opts.template.components || [],
      };
    } else if (opts.text) {
      body.text = { body: opts.text };
    }

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const msg = await res.text();
      this.logger.error(`WhatsApp send failed: ${res.status} ${msg}`);
    }
  }
} 