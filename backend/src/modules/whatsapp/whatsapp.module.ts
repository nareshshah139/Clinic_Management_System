import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { WhatsAppGraphClient } from './graph-client';
import { WhatsAppConnectionService } from './whatsapp-connection.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [PrismaModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppGraphClient, WhatsAppService, WhatsAppConnectionService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
