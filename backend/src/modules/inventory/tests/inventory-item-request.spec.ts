import { ConflictException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InventoryItemRequestService } from '../inventory-item-request.service';
import { InventoryItemRequestController } from '../inventory-item-request.controller';
import { InventoryController } from '../inventory.controller';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { nextItemRequestStatus } from '../inventory-item-request.state';

const payload = {
  name: 'Cetaphil Cleanser 125ml',
  type: 'MEDICINE',
  unit: 'BOTTLES',
  costPrice: 100,
  sellingPrice: 150,
  mrp: 160,
  sku: 'CET-125',
};

const doctor = { id: 'doc-1', branchId: 'b1', role: 'DOCTOR' };
const reception = { id: 'rec-1', branchId: 'b1', role: 'RECEPTION' };

function build() {
  const rows = new Map<string, any>();
  const tx: any = {
    inventoryItemRequest: {
      findFirst: jest.fn(async ({ where }: any) => {
        const r = rows.get(where.id);
        return r && r.branchId === where.branchId ? { ...r } : null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const r = rows.get(where.id);
        if (!r || r.branchId !== where.branchId || r.status !== where.status) return { count: 0 };
        Object.assign(r, data);
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }: any) => Object.assign(rows.get(where.id), data)),
    },
    auditLog: { create: jest.fn() },
  };
  const prisma: any = {
    ...tx,
    inventoryItemRequest: {
      ...tx.inventoryItemRequest,
      create: jest.fn(async ({ data }: any) => {
        const row = { id: 'req-1', status: 'PENDING', inventoryItemId: null, ...data };
        rows.set(row.id, row);
        return row;
      }),
      findFirstOrThrow: jest.fn(async ({ where }: any) => ({ ...rows.get(where.id) })),
      findMany: jest.fn(async () => []),
    },
    inventoryItem: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const inventory: any = {
    createInventoryItem: jest.fn(async (dto: any) => ({ id: 'item-1', ...dto })),
    assertItemIdentifiersFree: jest.fn(),
  };
  return { service: new InventoryItemRequestService(prisma, inventory), prisma, inventory, rows };
}

describe('inventory item requests', () => {
  it('queues a request for staff and creates no inventory item', async () => {
    const { service, inventory, prisma } = build();
    const outcome = await service.createOrRequest(payload as any, reception);

    expect(outcome.created).toBe(false);
    expect(inventory.createInventoryItem).not.toHaveBeenCalled();
    expect(prisma.inventoryItemRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId: 'b1',
          requestedById: 'rec-1',
          itemName: 'Cetaphil Cleanser 125ml',
          payload,
        }),
      }),
    );
  });

  it('creates directly for an approver', async () => {
    const { service, inventory, prisma } = build();
    const outcome = await service.createOrRequest(payload as any, doctor);

    expect(outcome).toEqual({ created: true, item: { id: 'item-1', ...payload } });
    expect(inventory.createInventoryItem).toHaveBeenCalledWith(payload, 'b1');
    expect(prisma.inventoryItemRequest.create).not.toHaveBeenCalled();
  });

  it('approve creates the item from the payload and links it', async () => {
    const { service, inventory, rows } = build();
    await service.createOrRequest(payload as any, reception);

    const result = await service.approve('req-1', doctor);

    expect(inventory.createInventoryItem).toHaveBeenCalledTimes(1);
    expect(inventory.createInventoryItem.mock.calls[0][0]).toMatchObject(payload);
    expect(inventory.createInventoryItem.mock.calls[0][1]).toBe('b1');
    expect(result).toMatchObject({ status: 'APPROVED', inventoryItemId: 'item-1', reviewedById: 'doc-1' });
    expect(rows.get('req-1').status).toBe('APPROVED');
  });

  it('second approve is a 409 and creates no second item', async () => {
    const { service, inventory } = build();
    await service.createOrRequest(payload as any, reception);
    await service.approve('req-1', doctor);

    await expect(service.approve('req-1', doctor)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.approve('req-1', doctor)).rejects.toMatchObject({
      response: { message: 'This request was already approved', status: 'APPROVED' },
    });
    expect(inventory.createInventoryItem).toHaveBeenCalledTimes(1);
  });

  it('losing the conditional claim reports the winner state', async () => {
    const { service, inventory, rows, prisma } = build();
    await service.createOrRequest(payload as any, reception);
    const tx = (prisma.$transaction as jest.Mock);
    tx.mockImplementationOnce(async (fn: any) => {
      const inner: any = {
        inventoryItemRequest: {
          findFirst: jest.fn(async () => ({ ...rows.get('req-1') })),
          updateMany: jest.fn(async () => {
            rows.get('req-1').status = 'REJECTED';
            return { count: 0 };
          }),
        },
      };
      inner.inventoryItemRequest.findFirst
        .mockResolvedValueOnce({ ...rows.get('req-1') })
        .mockResolvedValueOnce({ status: 'REJECTED' });
      return fn(inner);
    });

    await expect(service.approve('req-1', doctor)).rejects.toMatchObject({
      response: { message: 'This request was already rejected', status: 'REJECTED' },
    });
    expect(inventory.createInventoryItem).not.toHaveBeenCalled();
  });

  it('reject without a note is a 400 and touches nothing', async () => {
    const { service, prisma } = build();
    await service.createOrRequest(payload as any, reception);

    await expect(service.reject('req-1', doctor, '   ')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reject stores the note, marks REJECTED and creates no item', async () => {
    const { service, inventory } = build();
    await service.createOrRequest(payload as any, reception);

    const result = await service.reject('req-1', doctor, 'Duplicate of Cetaphil 120ml');

    expect(result).toMatchObject({ status: 'REJECTED', reviewNote: 'Duplicate of Cetaphil 120ml' });
    expect(inventory.createInventoryItem).not.toHaveBeenCalled();
    await expect(service.approve('req-1', doctor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to approve a stored payload that no longer validates', async () => {
    const { service, inventory, rows } = build();
    await service.createOrRequest(payload as any, reception);
    rows.get('req-1').payload = { ...payload, costPrice: -5 };

    await expect(service.approve('req-1', doctor)).rejects.toBeInstanceOf(BadRequestException);
    expect(inventory.createInventoryItem).not.toHaveBeenCalled();
  });

  it('scopes listing to own requests for staff and to the branch for approvers', async () => {
    const { service, prisma } = build();
    prisma.inventoryItemRequest.findMany = jest.fn().mockResolvedValue([]);
    await service.list(reception, 'PENDING');
    await service.list(doctor);

    expect(prisma.inventoryItemRequest.findMany.mock.calls[0][0].where).toEqual({
      branchId: 'b1',
      requestedById: 'rec-1',
      status: 'PENDING',
    });
    expect(prisma.inventoryItemRequest.findMany.mock.calls[1][0].where).toEqual({ branchId: 'b1' });
    await expect(service.list(doctor, 'BOGUS')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transition table: only PENDING moves', () => {
    expect(nextItemRequestStatus('PENDING', 'approve')).toBe('APPROVED');
    expect(nextItemRequestStatus('PENDING', 'reject')).toBe('REJECTED');
    expect(nextItemRequestStatus('APPROVED', 'reject')).toBeNull();
    expect(nextItemRequestStatus('REJECTED', 'approve')).toBeNull();
  });
});

describe('item request route guards', () => {
  const guard = new RolesGuard(new Reflector());
  const ctxFor = (handler: any, cls: any, role: string): any => ({
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  });
  const proto = InventoryItemRequestController.prototype;

  it.each(['PHARMACIST', 'RECEPTION', 'MANAGER'])('%s cannot approve or reject', (role) => {
    expect(guard.canActivate(ctxFor(proto.approve, InventoryItemRequestController, role))).toBe(false);
    expect(guard.canActivate(ctxFor(proto.reject, InventoryItemRequestController, role))).toBe(false);
  });

  it.each(['DOCTOR', 'ADMIN', 'OWNER'])('%s can approve and reject', (role) => {
    expect(guard.canActivate(ctxFor(proto.approve, InventoryItemRequestController, role))).toBe(true);
    expect(guard.canActivate(ctxFor(proto.reject, InventoryItemRequestController, role))).toBe(true);
  });

  it('lets a doctor call the create route directly', () => {
    expect(
      guard.canActivate(ctxFor(InventoryController.prototype.createInventoryItem, InventoryController, 'DOCTOR')),
    ).toBe(true);
  });
});

describe('opening stock import', () => {
  it('still reaches the importer for pharmacy staff', () => {
    const importer = { importStarterExcel: jest.fn().mockReturnValue({ imported: 2 }) };
    const controller = new (InventoryController as any)({}, importer, {});
    const file = { originalname: 'opening.xlsx' };
    expect(controller.importInventoryStarterExcel(file, { user: reception })).toEqual({ imported: 2 });
    expect(importer.importStarterExcel).toHaveBeenCalledWith(file, 'b1', 'rec-1');
  });
});
