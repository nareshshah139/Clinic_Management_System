import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { SendPassService } from './send-pass.service';
import { WhatsAppSender } from './whatsapp-sender';
import { InboundWhatsAppService } from './inbound.service';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';

@Module({
  imports: [PrismaModule],
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppSender, SendPassService, InboundWhatsAppService],
  exports: [WhatsAppSender, SendPassService, InboundWhatsAppService],
})
export class MessagingModule {}
