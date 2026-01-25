import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { WhatsAppTemplatesService } from './whatsapp-templates.service';
import { WhatsAppTemplatesController } from './whatsapp-templates.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [WhatsAppTemplatesController],
  providers: [WhatsAppTemplatesService],
  exports: [WhatsAppTemplatesService],
})
export class WhatsAppTemplatesModule {}


