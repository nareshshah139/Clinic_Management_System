import { Module } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionsController } from './prescriptions.controller';
import { PrismaModule } from '../../shared/database/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PharmacyModule } from '../pharmacy/pharmacy.module';

@Module({
  imports: [PrismaModule, NotificationsModule, PharmacyModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
