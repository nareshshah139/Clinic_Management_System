import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryItemRequestStatus, Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../shared/database/prisma.service';
import { CreateInventoryItemDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';
import {
  canReviewItemRequests,
  ItemRequestAction,
  nextItemRequestStatus,
} from './inventory-item-request.state';
import {
  firstNameToken,
  matchInventory,
  matchPendingRequests,
  PossibleDuplicates,
  probeOf,
} from './inventory-item-request-duplicates';

export interface ItemRequestActor {
  id: string;
  branchId: string;
  role: string;
}

const REQUEST_INCLUDE = {
  requestedBy: { select: { id: true, firstName: true, lastName: true } },
  reviewedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.InventoryItemRequestInclude;

@Injectable()
export class InventoryItemRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async createOrRequest(
    dto: CreateInventoryItemDto,
    actor: ItemRequestActor,
  ) {
    if (canReviewItemRequests(actor.role)) {
      const item = await this.inventoryService.createInventoryItem(
        dto,
        actor.branchId,
      );
      return { created: true as const, item };
    }

    await this.inventoryService.assertItemIdentifiersFree(dto, actor.branchId);
    const request = await this.prisma.inventoryItemRequest.create({
      data: {
        branchId: actor.branchId,
        requestedById: actor.id,
        itemName: dto.name,
        payload: JSON.parse(JSON.stringify(dto)),
      },
      include: REQUEST_INCLUDE,
    });
    const [possibleDuplicates] = await this.possibleDuplicates(
      [request],
      actor.branchId,
    );
    return {
      created: false as const,
      request: { ...request, possibleDuplicates },
    };
  }

  async list(actor: ItemRequestActor, status?: string) {
    const requests = await this.prisma.inventoryItemRequest.findMany({
      where: this.scope(actor, this.parseStatus(status)),
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    if (!canReviewItemRequests(actor.role)) {
      return requests.map((r) => ({ ...r, possibleDuplicates: null }));
    }
    const open = requests.filter(
      (r) => r.status === InventoryItemRequestStatus.PENDING,
    );
    const duplicates = await this.possibleDuplicates(open, actor.branchId);
    const byId = new Map(open.map((r, i) => [r.id, duplicates[i]]));
    return requests.map((r) => ({
      ...r,
      possibleDuplicates: byId.get(r.id) ?? null,
    }));
  }

  private async possibleDuplicates(
    requests: Array<{ id: string; itemName: string; payload: Prisma.JsonValue }>,
    branchId: string,
  ): Promise<PossibleDuplicates[]> {
    if (!requests.length) return [];
    const probes = requests.map(probeOf);
    const tokens = [...new Set(probes.map((p) => firstNameToken(p.itemName)))].filter(Boolean);
    const skus = probes.flatMap((p) => (p.sku ? [p.sku] : []));
    const barcodes = probes.flatMap((p) => (p.barcode ? [p.barcode] : []));

    const [items, pending] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: {
          branchId,
          OR: [
            ...tokens.map((t) => ({
              name: { contains: t, mode: 'insensitive' as const },
            })),
            ...(skus.length ? [{ sku: { in: skus } }] : []),
            ...(barcodes.length ? [{ barcode: { in: barcodes } }] : []),
          ],
        },
        select: {
          id: true,
          name: true,
          manufacturer: true,
          unit: true,
          packSize: true,
          packUnit: true,
          batchNumber: true,
          currentStock: true,
          sku: true,
          barcode: true,
        },
      }),
      this.prisma.inventoryItemRequest.findMany({
        where: { branchId, status: InventoryItemRequestStatus.PENDING },
        select: {
          id: true,
          itemName: true,
          createdAt: true,
          requestedBy: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    return probes.map((probe) => ({
      inventory: matchInventory(probe, items),
      pendingRequests: matchPendingRequests(probe, pending),
    }));
  }

  async pendingCount(actor: ItemRequestActor) {
    const [requests, imports] = await Promise.all([
      this.prisma.inventoryItemRequest.count({
        where: this.scope(actor, InventoryItemRequestStatus.PENDING),
      }),
      this.prisma.inventoryMigration.count({
        where: {
          branchId: actor.branchId,
          ...(canReviewItemRequests(actor.role)
            ? {}
            : { requestedById: actor.id }),
          approval: 'PENDING',
        },
      }),
    ]);
    return { count: requests + imports };
  }

  async approve(id: string, actor: ItemRequestActor, note?: string) {
    await this.prisma.$transaction(async (tx) => {
      const request = await this.claim(tx, id, actor, 'approve', note);
      const dto = await this.parsePayload(request.payload);
      const item = await this.inventoryService.createInventoryItem(
        dto,
        actor.branchId,
        tx,
      );
      await tx.inventoryItemRequest.update({
        where: { id },
        data: { inventoryItemId: item.id },
      });
      await this.audit(tx, actor, 'INVENTORY_ITEM_REQUEST_APPROVED', id, {
        inventoryItemId: item.id,
      });
    });
    return this.findOne(id, actor.branchId);
  }

  async reject(id: string, actor: ItemRequestActor, note?: string) {
    const trimmed = note?.trim();
    if (!trimmed) {
      throw new BadRequestException('A note is required to reject a request');
    }
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, actor, 'reject', trimmed);
      await this.audit(tx, actor, 'INVENTORY_ITEM_REQUEST_REJECTED', id, {
        note: trimmed,
      });
    });
    return this.findOne(id, actor.branchId);
  }

  private async claim(
    tx: Prisma.TransactionClient,
    id: string,
    actor: ItemRequestActor,
    action: ItemRequestAction,
    note?: string,
  ) {
    const request = await tx.inventoryItemRequest.findFirst({
      where: { id, branchId: actor.branchId },
    });
    if (!request) throw new NotFoundException('Item request not found');

    const next = nextItemRequestStatus(request.status, action);
    if (!next) this.throwAlreadyReviewed(request.status);

    const claimed = await tx.inventoryItemRequest.updateMany({
      where: {
        id,
        branchId: actor.branchId,
        status: InventoryItemRequestStatus.PENDING,
      },
      data: {
        status: next!,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewNote: note?.trim() || null,
      },
    });
    if (claimed.count !== 1) {
      const current = await tx.inventoryItemRequest.findFirst({
        where: { id, branchId: actor.branchId },
        select: { status: true },
      });
      this.throwAlreadyReviewed(current?.status ?? request.status);
    }
    return request;
  }

  private throwAlreadyReviewed(status: InventoryItemRequestStatus): never {
    const verb = status === 'APPROVED' ? 'approved' : 'rejected';
    throw new ConflictException({
      message: `This request was already ${verb}`,
      status,
    });
  }

  private async parsePayload(payload: Prisma.JsonValue) {
    const dto = plainToInstance(CreateInventoryItemDto, payload);
    const errors = await validate(dto, { whitelist: true });
    if (errors.length) {
      throw new BadRequestException(
        `Stored request is no longer valid: ${errors
          .map((e) => e.property)
          .join(', ')}`,
      );
    }
    return dto;
  }

  private async findOne(id: string, branchId: string) {
    return this.prisma.inventoryItemRequest.findFirstOrThrow({
      where: { id, branchId },
      include: REQUEST_INCLUDE,
    });
  }

  private scope(actor: ItemRequestActor, status?: InventoryItemRequestStatus) {
    return {
      branchId: actor.branchId,
      ...(canReviewItemRequests(actor.role) ? {} : { requestedById: actor.id }),
      ...(status ? { status } : {}),
    };
  }

  private parseStatus(status?: string) {
    if (!status) return undefined;
    if (!(status in InventoryItemRequestStatus)) {
      throw new BadRequestException(`Unknown status ${status}`);
    }
    return status as InventoryItemRequestStatus;
  }

  private audit(
    tx: Prisma.TransactionClient,
    actor: ItemRequestActor,
    action: string,
    entityId: string,
    detail: Record<string, unknown>,
  ) {
    return tx.auditLog.create({
      data: {
        userId: actor.id,
        action,
        entity: 'InventoryItemRequest',
        entityId,
        newValues: JSON.stringify({ branchId: actor.branchId, ...detail }),
      },
    });
  }
}
