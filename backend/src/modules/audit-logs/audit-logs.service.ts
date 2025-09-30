import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryAuditLogsDto) {
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

    // Build where clause
    const where: Prisma.AuditLogWhereInput = {};

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

  async findOne(id: string) {
    return this.prisma.auditLog.findUnique({
      where: { id },
    });
  }

  async findByEntity(entity: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: {
        entity,
        entityId,
      },
      orderBy: {
        timestamp: 'desc',
      },
    });
  }

  async findByUser(userId: string, query: QueryAuditLogsDto) {
    const { page = 1, limit = 50, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = { userId };

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

  async getStatistics(startDate?: string, endDate?: string) {
    const where: Prisma.AuditLogWhereInput = {};

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
        take: 10,
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

  async exportLogs(query: QueryAuditLogsDto, format: 'json' | 'csv' = 'json') {
    const result = await this.findAll({ ...query, limit: 10000 }); // Max export limit

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

  async deleteOldLogs(daysToKeep: number = 90) {
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

