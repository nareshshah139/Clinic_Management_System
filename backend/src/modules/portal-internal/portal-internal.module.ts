import { Module } from '@nestjs/common';
import { PortalInternalController } from './portal-internal.controller';
import { PortalInternalGuard } from './portal-internal.guard';

@Module({
  controllers: [PortalInternalController],
  providers: [PortalInternalGuard],
})
export class PortalInternalModule {}
