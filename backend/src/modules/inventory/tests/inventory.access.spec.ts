import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InventoryController } from '../inventory.controller';
import { InventoryImportService } from '../inventory-import.service';
import { InventoryItemRequestService } from '../inventory-item-request.service';
import { InventoryService } from '../inventory.service';
import { accessApp } from './inventory-access-app';

const stock = {
  findAllInventoryItems: jest.fn(async () => ({ items: [] })),
  createStockTransaction: jest.fn(async () => ({ id: 'tx' })),
  updateInventoryItem: jest.fn(async () => ({ id: 'item' })),
  deleteInventoryItem: jest.fn(async () => ({ id: 'item' })),
  deleteSupplier: jest.fn(async () => ({ id: 'supplier' })),
};

const calls = {
  read: (app: INestApplication, user: string) =>
    request(app.getHttpServer()).get('/inventory/items').set('x-user', user),
  stockChange: (app: INestApplication, user: string) =>
    request(app.getHttpServer())
      .post('/inventory/transactions')
      .set('x-user', user)
      .send({ itemId: 'item', type: 'PURCHASE', quantity: 1 }),
  priceChange: (app: INestApplication, user: string) =>
    request(app.getHttpServer())
      .patch('/inventory/items/item')
      .set('x-user', user)
      .send({ sellingPrice: 10 }),
  remove: (app: INestApplication, user: string) =>
    request(app.getHttpServer())
      .delete('/inventory/items/item')
      .set('x-user', user),
  removeSupplier: (app: INestApplication, user: string) =>
    request(app.getHttpServer())
      .delete('/inventory/suppliers/supplier')
      .set('x-user', user),
};

describe('/inventory access control', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await accessApp(InventoryController, [
      { provide: InventoryService, useValue: stock },
      { provide: InventoryImportService, useValue: {} },
      { provide: InventoryItemRequestService, useValue: {} },
    ]);
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it.each(['owner', 'admin', 'doctor'])(
    'lets %s read, change stock and prices, and delete',
    async (user) => {
      await calls.read(app, user).expect(200);
      await calls.stockChange(app, user).expect(201);
      await calls.priceChange(app, user).expect(200);
      await calls.remove(app, user).expect(200);
      await calls.removeSupplier(app, user).expect(200);
      expect(stock.deleteInventoryItem).toHaveBeenCalledWith('item', 'branch');
    },
  );

  it.each(['nurse', 'patient', 'accountant', 'manager'])(
    'refuses %s even with every inventory permission granted',
    async (user) => {
      for (const call of [
        calls.read,
        calls.stockChange,
        calls.priceChange,
        calls.remove,
        calls.removeSupplier,
      ]) {
        await call(app, user).expect(403);
      }
      expect(stock.findAllInventoryItems).not.toHaveBeenCalled();
      expect(stock.deleteInventoryItem).not.toHaveBeenCalled();
    },
  );

  it('refuses a listed role that holds no inventory permission', async () => {
    await calls.read(app, 'receptionNoGrants').expect(403);
    await calls.stockChange(app, 'receptionNoGrants').expect(403);
    await calls.remove(app, 'receptionNoGrants').expect(403);
  });

  it('lets a pharmacist with no stored grants read, change stock and prices, and delete', async () => {
    await calls.read(app, 'pharmacist').expect(200);
    await calls.stockChange(app, 'pharmacist').expect(201);
    await calls.priceChange(app, 'pharmacist').expect(200);
    await calls.remove(app, 'pharmacist').expect(200);
    await calls.removeSupplier(app, 'pharmacist').expect(200);
  });

  it('lets other staff read with only the read permission and nothing more', async () => {
    await calls.read(app, 'receptionReader').expect(200);
    await calls.stockChange(app, 'receptionReader').expect(403);
    await calls.priceChange(app, 'receptionReader').expect(403);
    await calls.remove(app, 'receptionReader').expect(403);
    expect(stock.createStockTransaction).not.toHaveBeenCalled();
  });

  it('keeps delete separate from stock and price changes', async () => {
    await calls.stockChange(app, 'receptionStocker').expect(201);
    await calls.priceChange(app, 'receptionStocker').expect(200);
    await calls.remove(app, 'receptionStocker').expect(403);
    await calls.remove(app, 'receptionDeleter').expect(200);
    await calls.removeSupplier(app, 'receptionDeleter').expect(403);
  });

  it('rejects a request with no signed-in user', async () => {
    await request(app.getHttpServer()).get('/inventory/items').expect(403);
  });
});
