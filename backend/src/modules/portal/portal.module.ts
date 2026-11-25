import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PortalController } from './portal.controller';
import { PortalGuard } from './portal.guard';
import { SignInService } from './sign-in.service';
import { TaskPageService } from './task.service';

@Module({
  imports: [PrismaModule, MessagingModule],
  controllers: [PortalController],
  providers: [PortalGuard, TaskPageService, SignInService],
  exports: [SignInService],
})
export class PortalModule {}
