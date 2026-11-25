import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { Prisma } from '@prisma/client';

/**
 * @cc [owner:nareshshah139,label:integrity] audit-log-add-only
 * The service MUST NOT create or update audit entries and MUST only read them, except
 * deleteOldLogs, the single deletion path. Entries are added by the database layer, not here.
 */
@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * @cc [owner:nareshshah139,label:security] audit-log-branch-scope
   * Every read MUST return only entries made by staff of the reader's branch, so one clinic never
   * sees another's changes. An entry with no user belongs to no branch and MUST NOT be returned.
   */
  private async madeInBranch(branchId: string): Promise<Prisma.AuditLogWhereInput> {
    const staff = await this.prisma.user.findMany({ where: { branchId }, select: { id: true } });
    return { userId: { in: staff.map((member) => member.id) } };
  }

  async findAll(query: QueryAuditLogsDto, branchId: string) {
    const {
      page = 1,
      limit = 50,
      entity,
      entityId,
      action,
      userId,
      startDate,
      endDate,
      sortBy = 'timestamp',
      sortOrder = 'desc',
      search,
    } = query;

    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100); // Max 100 items per page

    const where: Prisma.AuditLogWhereInput = { AND: [await this.madeInBranch(branchId)] };

    if (entity) {
      where.entity = entity;
    }

    if (entityId) {
      where.entityId = entityId;
    }

    if (action) {
      where.action = action;
    }

    if (userId) {
      where.userId = userId;
    }

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = new Date(startDate);
      }
      if (endDate) {
        where.timestamp.lte = new Date(endDate);
      }
    }

    if (search) {
      where.OR = [
        { entity: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
        { action: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Execute query
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, branchId: string) {
    return this.prisma.auditLog.findFirst({
      where: { id, AND: [await this.madeInBranch(branchId)] },
    });
  }

  async findByEntity(entity: string, entityId: string, branchId: string) {
    return this.prisma.auditLog.findMany({
      where: {
        entity,
        entityId,
        AND: [await this.madeInBranch(branchId)],
      },
      orderBy: {
        timestamp: 'desc',
      },
    });
  }

  async findByUser(userId: string, query: QueryAuditLogsDto, branchId: string) {
    const { page = 1, limit = 50, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = { userId, AND: [await this.madeInBranch(branchId)] };

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = new Date(startDate);
      }
      if (endDate) {
        where.timestamp.lte = new Date(endDate);
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getStatistics(startDate: string | undefined, endDate: string | undefined, branchId: string) {
    const where: Prisma.AuditLogWhereInput = { AND: [await this.madeInBranch(branchId)] };

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = new Date(startDate);
      }
      if (endDate) {
        where.timestamp.lte = new Date(endDate);
      }
    }

    const [
      totalLogs,
      actionBreakdown,
      entityBreakdown,
      userBreakdown,
    ] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
      }),
      this.prisma.auditLog.groupBy({
        by: ['entity'],
        where,
        _count: { entity: true },
        orderBy: { _count: { entity: 'desc' } },
      }),
      this.prisma.auditLog.groupBy({
        by: ['userId'],
        where: { ...where, userId: { not: null } },
        _count: { userId: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
      }),
    ]);

    return {
      totalLogs,
      actionBreakdown: actionBreakdown.map(item => ({
        action: item.action,
        count: item._count.action,
      })),
      entityBreakdown: entityBreakdown.map(item => ({
        entity: item.entity,
        count: item._count.entity,
      })),
      topUsers: userBreakdown.map(item => ({
        userId: item.userId,
        count: item._count.userId,
      })),
    };
  }

  /**
   * @cc [owner:nareshshah139] audit-export-shape
   * CSV export MUST return encoded text; JSON export MUST retain structured records.
   */
  async exportLogs(query: QueryAuditLogsDto, format: 'csv', branchId: string): Promise<string>;
  async exportLogs(query: QueryAuditLogsDto, format: 'json', branchId: string): Promise<Awaited<ReturnType<AuditLogsService['findAll']>>['data']>;
  async exportLogs(query: QueryAuditLogsDto, format: 'json' | 'csv', branchId: string) {
    const result = await this.findAll({ ...query, limit: 10000 }, branchId); // Max export limit

    if (format === 'csv') {
      return this.convertToCSV(result.data);
    }

    return result.data;
  }

  private convertToCSV(logs: any[]): string {
    if (logs.length === 0) return '';

    const headers = [
      'ID',
      'Timestamp',
      'User ID',
      'Action',
      'Entity',
      'Entity ID',
      'IP Address',
      'User Agent',
    ];

    const rows = logs.map(log => [
      log.id,
      log.timestamp.toISOString(),
      log.userId || '',
      log.action,
      log.entity,
      log.entityId,
      log.ipAddress || '',
      log.userAgent || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    return csvContent;
  }

  /**
   * @cc [owner:nareshshah139,label:integrity] audit-log-retention
   * deleteOldLogs MUST delete only entries strictly older than daysToKeep days (default 90) and
   * MUST reject a negative or non-finite value before deleting anything. No route or job calls it
   * today, so no role can trigger it over HTTP; a future caller MUST be limited to OWNER or ADMIN.
   */
  async deleteOldLogs(daysToKeep: number = 90) {
    if (!Number.isFinite(daysToKeep) || daysToKeep < 0) {
      throw new RangeError('daysToKeep must be a non-negative number');
    }
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.prisma.auditLog.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(`Deleted ${result.count} audit logs older than ${daysToKeep} days`);
    return result;
  }
}

