import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PortalRecordsService } from './records.service';
import { SignInService } from './sign-in.service';
import { TaskPageService } from './task.service';

@Module({
  imports: [PrismaModule, MessagingModule],
  providers: [TaskPageService, SignInService, PortalRecordsService],
  exports: [TaskPageService, SignInService, PortalRecordsService],
})
export class PortalModule {}
