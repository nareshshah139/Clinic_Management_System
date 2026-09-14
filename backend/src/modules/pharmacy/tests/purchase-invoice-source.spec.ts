import {
  alignPurchaseSource,
  readPurchaseSourcePages,
  matchingSourceRows,
  normalizePurchaseSource,
} from '../purchase-invoice-source';
import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';

jest.mock('../../../shared/codex/codex-oauth', () => ({
  extractWithCodexOAuth: jest.fn(),
  purchaseOcrCodexConfig: () => ({ model: 'test', reasoningEffort: 'medium' }),
}));
import { extractWithCodexOAuth } from '../../../shared/codex/codex-oauth';
import { PURCHASE_INVOICE_SOURCE_PROMPT } from '../purchase-invoice-ocr.prompts';
import sharp from 'sharp';

describe('Invoice source evidence', () => {
  it('batches page-only reads, remaps page coordinates, and keeps final totals on the last page', async () => {
    const read = jest.fn(async (image: string) => ({
      sourceRegions: {
        invoiceNumber: [1, 10, 20, 40, 50],
        netPayable: [1, 10, 30, 40, 60],
      },
      items: [
        {
          batchNumber: image,
          sourceRegions: { batchNumber: [1, 100, 200, 300, 400] },
        },
      ],
      pageRotations: [270],
    }));
    const result = await readPurchaseSourcePages(
      ['original-1', 'original-2'],
      read,
    );
    expect(read.mock.calls).toEqual([['original-1'], ['original-2']]);
    expect(result.sourceRegions.invoiceNumber[0]).toBe(1);
    expect(result.sourceRegions.netPayable[0]).toBe(2);
    expect(result.items[1].sourceRegions.batchNumber).toEqual([
      2, 100, 200, 300, 400,
    ]);
    expect(result.pageRotations).toEqual([270, 270]);
  });
  it('keeps reliable pages if a different page fails, without moving those regions to the wrong page', async () => {
    const result = await readPurchaseSourcePages(
      ['bad', 'good'],
      async (image) => {
        if (image === 'bad') throw new Error('timeout');
        return {
          items: [
            {
              batchNumber: 'B2',
              sourceRegions: { batchNumber: [1, 10, 10, 20, 20] },
            },
          ],
        };
      },
    );
    expect(result.items[0].sourceRegions.batchNumber[0]).toBe(2);
  });
  it('uses the persisted source row order when a repeated extraction has reordered rows', () => {
    expect(
      matchingSourceRows(
        [{ batchNumber: 'B2' }, { batchNumber: 'B1' }],
        [{ batchNumber: 'B1' }, { batchNumber: 'B2' }],
      ),
    ).toEqual([1, 0]);
  });
  it('joins reordered 20-row locations without accepting replacement prices or shifted row indexes', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      productName: 'Cream',
      batchNumber: `B${i}`,
      packSize: '30ML',
      mrp: 100 + i,
    }));
    const locations = {
      invoiceNumber: 'WRONG',
      sourceRegions: { invoiceNumber: [1, 10, 10, 20, 20] },
      items: items
        .map((item, i) => ({
          ...item,
          mrp: 999,
          sourceRegions: {
            mrp: [i < 10 ? 1 : 2, 10, (i % 10) * 50, 20, (i % 10) * 50 + 20],
          },
        }))
        .reverse(),
    };
    const map = alignPurchaseSource(
      { invoiceNumber: 'ORIGINAL', items },
      locations,
      [
        { width: 100, height: 100 },
        { width: 100, height: 100 },
      ],
    );
    expect(map.headers.invoiceNumber.value).toBe('ORIGINAL');
    expect(map.rows[19]).toMatchObject({
      index: 19,
      values: { mrp: '119', batchNumber: 'B19' },
      regions: { mrp: [2, 10, 450, 20, 470] },
    });
    const ambiguous = alignPurchaseSource(
      { items: [items[0], items[0]] },
      { items: [locations.items[19]] },
      [{ width: 100, height: 100 }],
    );
    expect(ambiguous.rows.map((row) => row.regions)).toEqual([{}, {}]);
  });
  it('keeps persisted row references when the same image is extracted again in a different order', async () => {
    const map = normalizePurchaseSource(
      { items: [{ batchNumber: 'B1' }, { batchNumber: 'B2' }] },
      [{ width: 100, height: 100 }],
    );
    const db: any = {
      pharmacyPurchaseInvoiceDocument: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue({ sourceMap: map }),
      },
    };
    const service = new PharmacyPurchaseInvoiceService(db);
    jest
      .spyOn(service, 'extractDocumentDraft')
      .mockResolvedValue({
        sourceMap: map,
        draft: { items: [{ batchNumber: 'B2' }, { batchNumber: 'B1' }] },
      } as any);
    jest
      .spyOn(service as any, 'enrichKnownProducts')
      .mockImplementation(async (draft) => draft);
    const result = await (service as any).extractArchivedDocument(
      { buffer: Buffer.from('test') },
      'branch',
      { id: 'doc' },
    );
    expect(result.draft.items.map((item: any) => item.ocrSourceRef)).toEqual([
      'doc:1',
      'doc:0',
    ]);
  });
  it('keeps extraction values and flags when the optional location pass fails and sends only original images', async () => {
    const service = new PharmacyPurchaseInvoiceService({} as any);
    const raw = { invoiceNumber: 'SOURCE-1', items: [] };
    const image =
      'data:image/png;base64,' +
      (
        await sharp({
          create: { width: 8, height: 8, channels: 3, background: 'white' },
        })
          .png()
          .toBuffer()
      ).toString('base64');
    jest
      .spyOn(service as any, 'buildOcrImageDataUrls')
      .mockResolvedValue({ imageDataUrls: [image], flags: [], pageCount: 1 });
    jest
      .spyOn(service as any, 'extractPurchaseInvoiceJson')
      .mockResolvedValue(raw);
    const normalize = jest
      .spyOn(service as any, 'normalizeExtractedPurchaseDraft')
      .mockReturnValue({ ...raw, ocrFlags: [] });
    jest.mocked(extractWithCodexOAuth).mockImplementation(async (prompt) => {
      if (prompt === PURCHASE_INVOICE_SOURCE_PROMPT)
        throw new Error('unavailable');
      return JSON.stringify({
        invoiceNumber: 'SOURCE-1',
        items: [],
        complete: true,
      });
    });
    const result = await service.extractDocumentDraft(
      { buffer: Buffer.from('test'), size: 4 } as any,
      'branch',
    );
    expect(result.sourceMap).toBeUndefined();
    expect(result.draft.invoiceNumber).toBe('SOURCE-1');
    expect(normalize).toHaveBeenCalledWith(raw, []);
    expect(extractWithCodexOAuth).toHaveBeenCalledWith(
      PURCHASE_INVOICE_SOURCE_PROMPT,
      [image],
    );
    expect(result.draft.ocrFlags?.join(' ')).not.toContain('location');
  });

  it('keeps valid printed regions and rejects invented keys, unprinted values and out-of-page coordinates', () => {
    const map = normalizePurchaseSource(
      {
        invoiceNumber: 'S-1',
        billType: null,
        sourceRegions: {
          invoiceNumber: [1, 10, 20, 100, 40],
          billType: [1, 1, 1, 20, 20],
          unauthorized: [1, 1, 1, 2, 2],
        },
        items: [
          {
            productName: 'Example',
            quantityPurchased: 0,
            sourceRegions: {
              productName: [2, 0, 0, 20, 20],
              quantityPurchased: [1, 200, 300, 230, 340],
              mrp: [1, -1, 0, 100, 100],
            },
          },
        ],
      },
      [{ width: 1600, height: 1400 }],
    );
    expect(Object.keys(map.headers)).toEqual(['invoiceNumber']);
    expect(map.rows[0].regions).toEqual({
      quantityPurchased: [1, 200, 300, 230, 340],
    });
    expect(map.rows[0].values.quantityPurchased).toBe('0');
  });
  it('preserves all 20 repeated batch rows across two pages without merging or shifting their boxes', () => {
    const items = Array.from({ length: 20 }, (_, index) => ({
      productName: 'Repeated cream',
      batchNumber: `B${index}`,
      sourceRegions: {
        batchNumber: [
          index < 10 ? 1 : 2,
          100,
          50 + (index % 10) * 60,
          200,
          80 + (index % 10) * 60,
        ],
      },
    }));
    const map = normalizePurchaseSource({ pageRotations: [270, 0], items }, [
      { width: 1400, height: 1600 },
      { width: 1200, height: 1600 },
    ]);
    expect(map.rows).toHaveLength(20);
    expect(map.rows[19]).toMatchObject({
      index: 19,
      values: { batchNumber: 'B19' },
      regions: { batchNumber: [2, 100, 590, 200, 620] },
    });
    expect(map.pages[0].rotation).toBe(270);
  });
  it('locates an older document without changing invoice values or stock, and reuses saved evidence', async () => {
    const db: any = {
      pharmacyPurchaseInvoiceDocument: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'doc',
          data: Buffer.from('test'),
          sizeBytes: 4,
          mimeType: 'image/jpeg',
          fileName: 'test.jpg',
          sourceMap: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      pharmacyPurchaseInvoice: { update: jest.fn() },
      stockTransaction: { create: jest.fn() },
    };
    const service = new PharmacyPurchaseInvoiceService(db);
    const map = normalizePurchaseSource({ items: [] }, [
      { width: 100, height: 100 },
    ]);
    jest
      .spyOn(service, 'extractDocumentDraft')
      .mockResolvedValue({ sourceMap: map, draft: { items: [] } } as any);
    expect(await service.locateDocumentSources('doc', 'branch')).toEqual(map);
    expect(db.pharmacyPurchaseInvoiceDocument.findFirst).toHaveBeenCalledWith({
      where: { id: 'doc', branchId: 'branch' },
    });
    expect(db.pharmacyPurchaseInvoice.update).not.toHaveBeenCalled();
    expect(db.stockTransaction.create).not.toHaveBeenCalled();
    db.pharmacyPurchaseInvoiceDocument.findFirst.mockResolvedValue({
      sourceMap: map,
    });
    await service.locateDocumentSources('doc', 'branch');
    expect(service.extractDocumentDraft).toHaveBeenCalledTimes(1);
  });
  it('does not persist a failed location pass and lets it be retried', async () => {
    const db: any = {
      pharmacyPurchaseInvoiceDocument: {
        findFirst: jest.fn().mockResolvedValue({
          data: Buffer.from('test'),
          sizeBytes: 4,
          mimeType: 'image/jpeg',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new PharmacyPurchaseInvoiceService(db);
    jest
      .spyOn(service, 'extractDocumentDraft')
      .mockResolvedValue({ sourceMap: undefined } as any);
    await expect(
      service.locateDocumentSources('doc', 'branch'),
    ).rejects.toThrow(/could not be read/);
    await expect(
      service.locateDocumentSources('doc', 'branch'),
    ).rejects.toThrow(/could not be read/);
    expect(
      db.pharmacyPurchaseInvoiceDocument.updateMany,
    ).not.toHaveBeenCalled();
    expect(service.extractDocumentDraft).toHaveBeenCalledTimes(2);
  });
  it('does not return another branch document or render invalid page numbers', async () => {
    const db: any = {
      pharmacyPurchaseInvoiceDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new PharmacyPurchaseInvoiceService(db);
    await expect(service.getSourceMap('doc', 'other')).rejects.toThrow(
      /not found/,
    );
    await expect(
      service.getDocumentPreview('doc', -1, 'branch'),
    ).rejects.toThrow(/Invalid/);
  });
});
