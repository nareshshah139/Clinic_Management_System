import { Module } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogsController } from './audit-logs.controller';
import { PrismaService } from '../../shared/database/prisma.service';
import { RequestContextService } from '../../shared/context/request-context.service';

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService, PrismaService, RequestContextService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}

