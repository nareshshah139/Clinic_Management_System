import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Request,
  Header,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuditLogsService } from './audit-logs.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import { UserRole } from '@prisma/client';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: UserRole;
    branchId: string;
  };
}

@ApiTags('Audit Logs')
@Controller('audit-logs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('audit:read')
  @ApiOperation({ summary: 'Get all audit logs with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async findAll(@Query() query: QueryAuditLogsDto) {
    return this.auditLogsService.findAll(query);
  }

  @Get('statistics')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('audit:read')
  @ApiOperation({ summary: 'Get audit log statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStatistics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.auditLogsService.getStatistics(startDate, endDate);
  }

  @Get('export')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('audit:export')
  @ApiOperation({ summary: 'Export audit logs' })
  @ApiResponse({ status: 200, description: 'Logs exported successfully' })
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="audit-logs.csv"')
  async exportLogs(@Query() query: QueryAuditLogsDto): Promise<StreamableFile> {
    const csv = await this.auditLogsService.exportLogs(query, 'csv');
    const buffer = Buffer.from(csv, 'utf-8');
    return new StreamableFile(buffer);
  }

  @Get('export/json')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('audit:export')
  @ApiOperation({ summary: 'Export audit logs as JSON' })
  @ApiResponse({ status: 200, description: 'Logs exported successfully' })
  async exportLogsJSON(@Query() query: QueryAuditLogsDto) {
    return this.auditLogsService.exportLogs(query, 'json');
  }

  @Get('entity/:entity/:entityId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR)
  @Permissions('audit:read')
  @ApiOperation({ summary: 'Get audit logs for a specific entity' })
  @ApiResponse({ status: 200, description: 'Entity audit logs retrieved' })
  async findByEntity(
    @Param('entity') entity: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditLogsService.findByEntity(entity, entityId);
  }

  @Get('user/:userId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('audit:read')
  @ApiOperation({ summary: 'Get audit logs for a specific user' })
  @ApiResponse({ status: 200, description: 'User audit logs retrieved' })
  async findByUser(
    @Param('userId') userId: string,
    @Query() query: QueryAuditLogsDto,
  ) {
    return this.auditLogsService.findByUser(userId, query);
  }

  @Get('my-activity')
  @ApiOperation({ summary: 'Get current user activity logs' })
  @ApiResponse({ status: 200, description: 'User activity retrieved' })
  async getMyActivity(
    @Request() req: AuthenticatedRequest,
    @Query() query: QueryAuditLogsDto,
  ) {
    return this.auditLogsService.findByUser(req.user.id, query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('audit:read')
  @ApiOperation({ summary: 'Get a specific audit log by ID' })
  @ApiResponse({ status: 200, description: 'Audit log retrieved' })
  @ApiResponse({ status: 404, description: 'Audit log not found' })
  async findOne(@Param('id') id: string) {
    return this.auditLogsService.findOne(id);
  }
}

