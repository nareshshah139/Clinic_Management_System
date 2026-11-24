import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { SendPassService } from './send-pass.service';
import { WhatsAppSender } from './whatsapp-sender';

@Module({
  imports: [PrismaModule],
  providers: [WhatsAppSender, SendPassService],
  exports: [WhatsAppSender, SendPassService],
})
export class MessagingModule {}
