import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PortalController } from './portal.controller';
import { PortalGuard } from './portal.guard';
import { PortalRecordsService } from './records.service';
import { SignInService } from './sign-in.service';
import { TaskPageService } from './task.service';

@Module({
  imports: [PrismaModule, MessagingModule],
  controllers: [PortalController],
  providers: [PortalGuard, TaskPageService, SignInService, PortalRecordsService],
  exports: [SignInService, PortalRecordsService],
})
export class PortalModule {}
