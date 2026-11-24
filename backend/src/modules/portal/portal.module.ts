import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { PortalController } from './portal.controller';
import { PortalGuard } from './portal.guard';
import { TaskPageService } from './task.service';

@Module({
  imports: [PrismaModule],
  controllers: [PortalController],
  providers: [PortalGuard, TaskPageService],
})
export class PortalModule {}
