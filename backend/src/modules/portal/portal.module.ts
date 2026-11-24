import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PortalController } from './portal.controller';
import { PortalGuard } from './portal.guard';
import { SignInController } from './sign-in.controller';
import { SignInService } from './sign-in.service';
import { TaskPageService } from './task.service';

@Module({
  imports: [PrismaModule, MessagingModule],
  controllers: [PortalController, SignInController],
  providers: [PortalGuard, TaskPageService, SignInService],
})
export class PortalModule {}
