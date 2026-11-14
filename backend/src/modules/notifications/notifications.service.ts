import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly smtpTransporter: nodemailer.Transporter | null;

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
      attachments: opts.attachments,
    });
  }
}
