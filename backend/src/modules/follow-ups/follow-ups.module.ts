import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { FollowUpsController } from './follow-ups.controller';
import { FollowUpsService } from './follow-ups.service';

@Module({
  imports: [PrismaModule],
  controllers: [FollowUpsController],
  providers: [FollowUpsService],
})
export class FollowUpsModule {}
