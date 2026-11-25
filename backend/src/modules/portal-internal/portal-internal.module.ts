import { Module } from '@nestjs/common';
import { PortalModule } from '../portal/portal.module';
import { PortalInternalController } from './portal-internal.controller';
import { InternalRecordsController } from './records.controller';
import { InternalTaskController } from './task.controller';
import { InternalSignInController } from './sign-in.controller';
import { PortalInternalGuard } from './portal-internal.guard';

@Module({
  imports: [PortalModule],
  controllers: [PortalInternalController, InternalSignInController, InternalRecordsController, InternalTaskController],
  providers: [PortalInternalGuard],
})
export class PortalInternalModule {}
