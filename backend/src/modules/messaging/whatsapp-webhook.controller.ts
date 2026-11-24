import { BadRequestException, Controller, Get, HttpCode, Post, Req, Res, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../auth/auth.controller';
import { InboundWhatsAppService } from './inbound.service';
import { safeEqual, verifyMetaSignature } from './webhook-signature';

/**
 * @cc [owner:nareshshah139,label:security] whatsapp-webhook-boundary
 * The webhook MUST answer Meta's subscribe challenge only for the configured verify token, MUST read
 * the body from the raw bytes after the signature check (no DTO, so the global validation pipe never
 * runs), and MUST reject unsigned or wrongly signed bodies before anything is stored.
 */
@ApiExcludeController()
@Public()
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(private readonly inbound: InboundWhatsAppService) {}

  @Get()
  verify(@Req() req: Request, @Res() res: Response) {
    const token = process.env.WHATSAPP_VERIFY_TOKEN;
    const given = String(req.query['hub.verify_token'] ?? '');
    if (token && req.query['hub.mode'] === 'subscribe' && safeEqual(Buffer.from(given), Buffer.from(token))) {
      res.status(200).type('text/plain').send(String(req.query['hub.challenge'] ?? ''));
      return;
    }
    res.status(403).type('text/plain').send('Verification token does not match.');
  }

  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>) {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret) throw new ServiceUnavailableException('The WhatsApp webhook is not configured. Set WHATSAPP_APP_SECRET.');
    if (!req.rawBody || !verifyMetaSignature(req.rawBody, req.headers['x-hub-signature-256'], secret)) {
      throw new UnauthorizedException('The webhook signature does not match.');
    }
    let body: unknown;
    try {
      body = JSON.parse(req.rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('The webhook body is not JSON.');
    }
    return { ok: true, ...(await this.inbound.handle(body)) };
  }
}
