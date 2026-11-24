import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { MessagingModule } from '../messaging/messaging.module';
import { FollowUpsController } from './follow-ups.controller';
import { FollowUpsService } from './follow-ups.service';
import { WorklistController } from './worklist.controller';
import { WorklistService } from './worklist.service';

@Module({
  imports: [PrismaModule, MessagingModule],
  controllers: [FollowUpsController, WorklistController],
  providers: [FollowUpsService, WorklistService],
})
export class FollowUpsModule {}
