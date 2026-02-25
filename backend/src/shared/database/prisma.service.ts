import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RequestContextService } from '../context/request-context.service';

function redactSensitiveFields<T>(input: T): T {
  const SENSITIVE_KEYS = new Set([
    'password',
    'resetToken',
    'resetTokenExpiry',
  ]);

  const visit = (val: any): any => {
    if (val === null || val === undefined) return val;
    if (Array.isArray(val)) return val.map(visit);
    if (typeof val === 'object') {
      const out: any = Array.isArray(val) ? [] : {};
      for (const [k, v] of Object.entries(val)) {
        if (SENSITIVE_KEYS.has(k)) {
          out[k] = '[REDACTED]';
        } else {
          out[k] = visit(v);
        }
      }
      return out;
    }
    return val;
  };

  return visit(input);
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly requestContext: RequestContextService) {
    super();

    const base = this as any;
    const getRequestContext = () => this.requestContext.get();

    const extended = this.$extends({
      query: {
        $allModels: {
          async create({ model, args, query }: any) {
            const result = await query(args);
            await audit({ base, model, operation: 'create', args, result, getCtx: getRequestContext });
            return result;
          },
          async update({ model, args, query }: any) {
            const oldValues = await tryFindOld(base, model, args);
            const result = await query(args);
            await audit({ base, model, operation: 'update', args, result, oldValues, getCtx: getRequestContext });
            return result;
          },
          async upsert({ model, args, query }: any) {
            const result = await query(args);
            await audit({ base, model, operation: 'upsert', args, result, getCtx: getRequestContext });
            return result;
          },
          async delete({ model, args, query }: any) {
            const oldValues = await tryFindOld(base, model, args);
            const result = await query(args);
            await audit({ base, model, operation: 'delete', args, result, oldValues, getCtx: getRequestContext });
            return result;
          },
          async createMany({ model, args, query }: any) {
            const result = await query(args);
            await audit({ base, model, operation: 'createMany', args, result, getCtx: getRequestContext });
            return result;
          },
          async updateMany({ model, args, query }: any) {
            const result = await query(args);
            await audit({ base, model, operation: 'updateMany', args, result, getCtx: getRequestContext });
            return result;
          },
          async deleteMany({ model, args, query }: any) {
            const result = await query(args);
            await audit({ base, model, operation: 'deleteMany', args, result, getCtx: getRequestContext });
            return result;
          },
        },
      },
    });

    // Copy extended client API onto this instance so DI consumers can use it transparently
    Object.assign(this, extended);

    async function tryFindOld(client: any, model: string, args: any) {
      try {
        const lower = model.charAt(0).toLowerCase() + model.slice(1);
        if (args?.where) {
          return await client[lower].findUnique({ where: args.where });
        }
      } catch {}
      return null;
    }

    async function audit({ base, model, operation, args, result, oldValues, getCtx }: any) {
      if (model === 'AuditLog') return;
      const allowed = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
      if (!allowed.has(operation)) return;

      let entityId: string | null = null;
      if (result && typeof result === 'object' && 'id' in result && (result as any).id != null) {
        entityId = String((result as any).id);
      } else if (args?.where?.id != null) {
        entityId = String(args.where.id);
      } else if (Array.isArray(result) && result.length > 0 && result[0]?.id != null) {
        entityId = String(result[0].id);
      } else if (operation.endsWith('Many')) {
        entityId = 'BULK';
      }

      let newValues: any = null;
      if (operation === 'create' || operation === 'upsert' || operation === 'update' || operation === 'delete') {
        newValues = result ?? null;
      } else if (operation === 'createMany' || operation === 'updateMany') {
        newValues = args?.data ?? null;
      }

      const ctx = getCtx?.();

      try {
        await base.auditLog.create({
          data: {
            userId: ctx?.userId ?? null,
            action: String(operation).toUpperCase(),
            entity: model,
            entityId: entityId ?? 'UNKNOWN',
            oldValues: oldValues ? JSON.stringify(redactSensitiveFields(oldValues)) : null,
            newValues: newValues ? JSON.stringify(redactSensitiveFields(newValues)) : null,
            ipAddress: ctx?.ipAddress ?? null,
            userAgent: ctx?.userAgent ?? null,
          },
        });
      } catch {
        // swallow audit errors
      }
    }
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Successfully connected to database');
    } catch (error) {
      this.logger.error('Database connection failed – check DATABASE_URL configuration', error as any);
      throw new Error('Database connection failed – verify DATABASE_URL');
    }
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting from database...');
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }
}
