import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../shared/database/prisma.service';
import { InventoryWorkflowService } from './inventory-workflow.service';
import { WorkflowActor } from './inventory-workflow.types';

const headers = [
  'inventoryItemId',
  'name',
  'unit',
  'systemStock',
  'updatedAt',
  'batchNumber',
  'expiryDate',
  'physicalStock',
];

@Injectable()
export class InventoryStocktakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: InventoryWorkflowService,
  ) {}

  async template(actor: WorkflowActor) {
    await this.workflow.authorize(actor, 'COUNT');
    const items = await this.prisma.inventoryItem.findMany({
      where: { branchId: actor.branchId, status: 'ACTIVE' },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return {
      rows: items.map((item) => ({
        inventoryItemId: item.id,
        name: item.name,
        unit: item.unit,
        systemStock: item.currentStock,
        updatedAt: item.updatedAt.toISOString(),
        batchNumber: item.batchNumber || '',
        expiryDate: item.expiryDate?.toISOString().slice(0, 10) || '',
        physicalStock: '',
      })),
    };
  }

  /**
   * @cc [owner:nareshshah139,label:product] stocktake-import-review-before-reset
   * Import MUST create a COUNT draft without changing stock. Blank counts remain uncounted;
   * duplicate/unknown IDs, invalid counts and stale exported revisions MUST reject the entire
   * draft. Retrying identical bytes and reason MUST return the same branch count document.
   */
  async import(
    actor: WorkflowActor,
    file: Express.Multer.File,
    reason: string,
  ) {
    await this.workflow.authorize(actor, 'COUNT', true);
    if (!file?.buffer?.length || file.buffer.length > 10 * 1024 * 1024)
      throw new BadRequestException('Choose a CSV or Excel file under 10 MB');
    if (!/\.(csv|xlsx)$/i.test(file.originalname))
      throw new BadRequestException('Use a CSV or XLSX stock-take template');
    if (!reason?.trim() || reason.length > 500)
      throw new BadRequestException(
        'Enter a stock-take reason (at most 500 characters)',
      );
    let rows: Record<string, any>[];
    try {
      const workbook = XLSX.read(file.buffer, {
        type: 'buffer',
        cellDates: false,
        raw: true,
      });
      if (workbook.SheetNames.length !== 1)
        throw new Error('Use a single worksheet');
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const heading =
        XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false })[0] ||
        [];
      if (
        headers.some((h) => !heading.includes(h)) ||
        new Set(heading).size !== heading.length
      )
        throw new Error('Keep the exported column headers');
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    } catch (e: any) {
      throw new BadRequestException(
        `Cannot read stock-take file: ${e.message}`,
      );
    }
    if (!rows.length || rows.length > 10000)
      throw new BadRequestException(
        'Import between 1 and 10,000 rows per count',
      );
    const seen = new Set<string>();
    const lines = rows
      .map((r, index) => {
        const id = String(r.inventoryItemId || '').trim();
        if (!id || seen.has(id))
          throw new BadRequestException(
            `Row ${index + 2}: missing or duplicate inventory ID`,
          );
        seen.add(id);
        const physical = String(r.physicalStock).trim();
        if (physical !== '' && !/^\d+$/.test(physical))
          throw new BadRequestException(
            `Row ${index + 2}: actual count must be a nonnegative whole number`,
          );
        if (!/^\d+$/.test(String(r.systemStock)) || !String(r.updatedAt))
          throw new BadRequestException(
            `Row ${index + 2}: keep the exported balance and revision`,
          );
        return {
          inventoryId: id,
          unit: r.unit,
          quantity: 0,
          physicalStock: physical === '' ? undefined : Number(physical),
          expectedStock: Number(r.systemStock),
          expectedUpdatedAt: String(r.updatedAt),
          countedBatchNumber: String(r.batchNumber).trim(),
          countedExpiryDate: String(r.expiryDate).trim(),
        };
      })
      .filter((l) => l.physicalStock !== undefined);
    const known = await this.prisma.inventoryItem.findMany({
      where: {
        branchId: actor.branchId,
        status: 'ACTIVE',
        id: { in: [...seen] },
      },
      select: { id: true },
    });
    if (known.length !== seen.size)
      throw new BadRequestException(
        'File contains unknown, inactive or other-branch inventory IDs',
      );
    if (!lines.length)
      throw new BadRequestException(
        'Enter at least one actual count; blank rows remain uncounted',
      );
    return this.workflow.saveDocument(actor, {
      kind: 'COUNT',
      reference: `Physical stock take: ${file.originalname}`.slice(0, 160),
      requestKey: `stocktake:${createHash('sha256').update(file.buffer).update(reason.trim()).digest('hex')}`,
      payload: { reason: reason.trim(), lines },
    });
  }
}
