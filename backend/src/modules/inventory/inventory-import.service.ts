import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  InventoryItemType,
  InventoryStatus,
  StockStatus,
  TransactionType,
  UnitType,
} from './dto/inventory.dto';

interface InventoryStarterImportRow {
  name: string;
  manufacturer: string;
  composition1?: string;
  composition2?: string;
  category: string;
  dosageForm: string;
  strength: string;
  packSizeLabel: string;
  description?: string;
  sku?: string;
  barcode?: string;
  supplier?: string;
  batchNumber?: string;
  expiryDate?: string;
  hsnCode?: string;
  gstRate?: number;
  storageLocation?: string;
  storageConditions?: string;
  costPrice: number;
  sellingPrice: number;
  mrp?: number;
  currentStock: number;
  reorderLevel: number;
  minStockLevel: number;
  maxStockLevel: number;
  packSize?: number;
  packUnit?: string;
  unit: UnitType;
  requiresPrescription: boolean;
  isControlled: boolean;
  hasCostPrice: boolean;
  hasSellingPrice: boolean;
  hasMrp: boolean;
  hasCurrentStock: boolean;
}

interface InventoryStarterImportOutcome {
  status: 'created' | 'updated';
  drugCreated: boolean;
  stockAdjusted: boolean;
}

@Injectable()
export class InventoryImportService {
  private readonly logger = new Logger(InventoryImportService.name);
  constructor(private readonly prisma: PrismaService) {}

  async importStarterExcel(
    file: Express.Multer.File | undefined,
    branchId: string,
    userId: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Please upload a non-empty Excel file');
    }

    if (!/\.(xlsx|xls)$/i.test(file.originalname || '')) {
      throw new BadRequestException('Only .xlsx and .xls files are supported');
    }

    const rows = this.readWorkbookRows(file.buffer);
    const nonEmptyRows = rows.filter((row) =>
      Object.values(row).some((value) => String(value ?? '').trim() !== ''),
    );

    if (nonEmptyRows.length === 0) {
      throw new BadRequestException('The uploaded Excel file has no data rows');
    }

    if (nonEmptyRows.length > 1000) {
      throw new BadRequestException(
        'Import is limited to 1,000 rows at a time',
      );
    }

    const result = {
      importId: randomUUID(),
      totalRows: nonEmptyRows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      drugsCreated: 0,
      stockAdjusted: 0,
      errors: [] as Array<{ row: number; message: string }>,
    };
    const startedAt = Date.now();
    this.logger.log({
      event: 'inventory_import_started',
      importId: result.importId,
      totalRows: result.totalRows,
    });
    const duplicateRows = this.findDuplicateImportRows(nonEmptyRows);

    for (const [index, sourceRow] of nonEmptyRows.entries()) {
      // SheetJS preserves the original zero-based worksheet row, including gaps.
      const rowNumber =
        typeof sourceRow.__rowNum__ === 'number'
          ? sourceRow.__rowNum__ + 1
          : index + 2;
      try {
        const duplicates = duplicateRows.get(rowNumber);
        if (duplicates) {
          result.skipped += 1;
          result.errors.push({
            row: rowNumber,
            message: `Duplicate medicine/code and batch in rows ${duplicates.join(', ')}. Keep one correct opening-stock row and import it again.`,
          });
          this.logger.warn({
            event: 'inventory_import_row_failed',
            importId: result.importId,
            row: rowNumber,
            code: 'DUPLICATE_ROW',
          });
          continue;
        }
        const parsed = this.mapImportRow(sourceRow);
        if (!parsed) {
          this.logger.warn({
            event: 'inventory_import_row_failed',
            importId: result.importId,
            row: rowNumber,
            code: 'MISSING_NAME',
          });
          result.skipped += 1;
          result.errors.push({
            row: rowNumber,
            message:
              'Missing medicine name. Add a Drug name, Medicine name, Item name, Product name, or Name column.',
          });
          continue;
        }

        const outcome = await this.upsertImportRow(parsed, branchId, userId);
        if (outcome.status === 'created') result.created += 1;
        if (outcome.status === 'updated') result.updated += 1;
        if (outcome.drugCreated) result.drugsCreated += 1;
        if (outcome.stockAdjusted) result.stockAdjusted += 1;
      } catch (error) {
        // Never log workbook values or raw Prisma errors (which include row data).
        const code =
          typeof error?.code === 'string' && /^P\d{4}$/.test(error.code)
            ? error.code
            : 'ROW_FAILED';
        this.logger.warn({
          event: 'inventory_import_row_failed',
          importId: result.importId,
          row: rowNumber,
          code,
        });
        result.skipped += 1;
        result.errors.push({
          row: rowNumber,
          message:
            code === 'P2028' || code === 'P2024'
              ? `Database could not finish saving this row (${code}). Contact support with the import reference.`
              : code === 'P2002'
                ? 'A medicine with this SKU or barcode already exists. Check for duplicate codes.'
                : `Could not save this row (${code}). Contact support with the import reference.`,
        });
      }
    }

    this.logger.log({
      event: 'inventory_import_completed',
      importId: result.importId,
      totalRows: result.totalRows,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      durationMs: Date.now() - startedAt,
    });
    return result;
  }

  private readWorkbookRows(buffer: Buffer): Record<string, unknown>[] {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error('Workbook does not contain any sheets');
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        raw: false,
      });
      // This stock export leaves the first (medicine name) header empty.
      // Recognize its specific layout rather than guessing for arbitrary files.
      const headers =
        XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          range: sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']).s.r : 0,
          defval: '',
          raw: false,
        })[0] || [];
      const normalizedHeaders = headers.map((header) =>
        this.normalizeImportKey(String(header)),
      );
      const isLooseStockExport =
        normalizedHeaders[0] === '' &&
        ['manufacturername', 'currentstockloose', 'averagemrp'].every(
          (header) => normalizedHeaders.includes(header),
        ) &&
        !['drugname', 'medicinename', 'itemname', 'productname', 'name'].some(
          (header) => normalizedHeaders.includes(header),
        );
      if (isLooseStockExport) {
        for (const row of rows) row['Drug name'] = row[''] ?? row.__EMPTY;
        const combined: Record<string, unknown>[] = [];
        let previous: Record<string, unknown> | undefined;
        for (const row of rows) {
          const populated = Object.entries(row).filter(([, value]) =>
            String(value ?? '').trim(),
          );
          const compositionOnly =
            populated.length > 0 &&
            populated.every(
              ([key]) => this.normalizeImportKey(key) === 'composition',
            );
          if (compositionOnly && previous) {
            for (const [key, value] of populated) {
              previous[key] = [previous[key], value].filter(Boolean).join('\n');
            }
          } else {
            combined.push(row);
            if (String(row['Drug name'] ?? '').trim()) previous = row;
            else if (populated.length > 0) previous = undefined;
          }
        }
        return combined;
      }
      return rows;
    } catch (error) {
      throw new BadRequestException(
        `Could not read Excel file: ${error.message}`,
      );
    }
  }

  private findDuplicateImportRows(rows: Record<string, unknown>[]) {
    const identities = new Map<string, number[]>();
    rows.forEach((source, index) => {
      const row = this.normalizeImportRow(source);
      const name = this.readImportString(row, [
        'drugname',
        'medicinename',
        'itemname',
        'productname',
        'name',
      ]);
      if (!name) return;
      const batch =
        this.readImportString(row, [
          'batchnumber',
          'batch',
          'lotnumber',
        ])?.toLowerCase() || '';
      const rowNumber =
        typeof source.__rowNum__ === 'number'
          ? source.__rowNum__ + 1
          : index + 2;
      const keys = [
        ['name', name.toLowerCase()],
        ['sku', this.readImportString(row, ['sku', 'itemcode', 'productcode'])],
        ['barcode', this.readImportString(row, ['barcode', 'ean', 'upc'])],
      ];
      for (const [kind, value] of keys) {
        if (!value) continue;
        const key = JSON.stringify([kind, value, batch]);
        identities.set(key, [...(identities.get(key) || []), rowNumber]);
      }
    });
    const duplicates = new Map<number, number[]>();
    for (const group of identities.values()) {
      if (group.length > 1) for (const row of group) duplicates.set(row, group);
    }
    return duplicates;
  }

  private mapImportRow(
    sourceRow: Record<string, unknown>,
  ): InventoryStarterImportRow | null {
    const row = this.normalizeImportRow(sourceRow);
    const name = this.readImportString(row, [
      'drugname',
      'medicinename',
      'itemname',
      'productname',
      'name',
    ]);

    if (!name) return null;

    const packSizeLabel =
      this.readImportString(row, [
        'packsizelabel',
        'packsize',
        'pack',
        'packing',
        'unitpack',
      ]) || '1 piece';
    const composition1 = this.readImportString(row, [
      'composition',
      'composition1',
      'primarycomposition',
      'primarycompositions',
      'genericname',
      'generic',
      'salt',
    ]);
    const composition2 = this.readImportString(row, [
      'composition2',
      'secondarycomposition',
      'secondarycompositions',
    ]);
    const category =
      this.readImportString(row, [
        'category',
        'itemcategory',
        'therapeuticcategory',
        'drugcategory',
      ]) ||
      this.inferCategory(name) ||
      'Uncategorised';
    const dosageForm =
      this.readImportString(row, ['dosageform', 'dossageform', 'form']) ||
      this.inferDosageForm(`${name} ${packSizeLabel}`) ||
      'Other';
    const strength =
      this.readImportString(row, ['strength', 'dose', 'power']) ||
      this.parseStrength(`${composition1 || ''} ${name}`) ||
      'Unspecified';
    const manufacturer =
      this.readImportString(row, [
        'manufacturer',
        'manufacturername',
        'mfg',
        'company',
      ]) || 'Unknown Manufacturer';

    const sellingPriceValue = this.readImportNumber(row, [
      'sellingprice',
      'saleprice',
      'price',
      'rate',
      'approxpriceinr',
      'approxprice',
    ]);
    const mrpValue = this.readImportNumber(row, [
      'mrp',
      'averagemrp',
      'maximumretailprice',
    ]);
    const costPriceValue = this.readImportNumber(row, [
      'costprice',
      'purchaseprice',
      'purchaserate',
      'ptr',
      'cost',
    ]);
    const basePrice = sellingPriceValue ?? mrpValue ?? costPriceValue ?? 0;
    const costPrice = this.roundMoney(
      costPriceValue ?? (basePrice > 0 ? basePrice * 0.75 : 0),
    );
    const sellingPrice = this.roundMoney(
      sellingPriceValue ?? mrpValue ?? basePrice,
    );
    const currentStockValue = this.readImportNumber(row, [
      'currentstock',
      'currentstockloose',
      'stock',
      'quantity',
      'qty',
      'openingstock',
      'initialstock',
      'availableqty',
      'availablequantity',
    ]);
    const reorderLevelValue = this.readImportNumber(row, [
      'reorderlevel',
      'minimumstock',
      'minstock',
      'minstocklevel',
    ]);
    const maxStockLevelValue = this.readImportNumber(row, [
      'maximumstock',
      'maxstock',
      'maxstocklevel',
    ]);
    const packInfo = this.parsePackSizeLabel(packSizeLabel);
    const requiresPrescription =
      this.readImportBoolean(row, [
        'requiresprescription',
        'rxrequired',
        'prescriptionrequired',
      ]) ?? this.inferRequiresPrescription(name, category, dosageForm);

    return {
      name,
      manufacturer,
      composition1,
      composition2,
      category,
      dosageForm,
      strength,
      packSizeLabel,
      description:
        this.readImportString(row, ['description', 'notes']) || composition1,
      sku: this.readImportString(row, ['sku', 'itemcode', 'productcode']),
      barcode: this.readImportString(row, ['barcode', 'ean', 'upc']),
      supplier:
        this.readImportString(row, ['supplier', 'distributor', 'vendor']) ||
        manufacturer,
      batchNumber: this.readImportString(row, [
        'batchnumber',
        'batch',
        'lotnumber',
      ]),
      expiryDate: this.readImportDate(row, ['expirydate', 'expiry', 'expdate']),
      hsnCode: this.readImportString(row, ['hsncode', 'hsn']),
      gstRate: this.readImportNumber(row, [
        'gstrate',
        'gst',
        'gstpercent',
        'itemgst',
      ]),
      storageLocation: this.readImportString(row, [
        'storagelocation',
        'location',
        'rack',
      ]),
      storageConditions: this.readImportString(row, [
        'storageconditions',
        'storage',
      ]),
      costPrice,
      sellingPrice,
      mrp: mrpValue,
      currentStock: Math.max(0, Math.round(currentStockValue ?? 0)),
      reorderLevel: Math.max(0, Math.round(reorderLevelValue ?? 10)),
      minStockLevel: Math.max(0, Math.round(reorderLevelValue ?? 10)),
      maxStockLevel: Math.max(1, Math.round(maxStockLevelValue ?? 1000)),
      packSize: packInfo.packSize,
      packUnit: packInfo.packUnit,
      unit: packInfo.unit,
      requiresPrescription,
      isControlled:
        this.readImportBoolean(row, ['iscontrolled', 'controlled']) ??
        this.inferControlledDrug(name),
      hasCostPrice: costPriceValue !== undefined,
      hasSellingPrice:
        sellingPriceValue !== undefined || mrpValue !== undefined,
      hasMrp: mrpValue !== undefined,
      hasCurrentStock: currentStockValue !== undefined,
    };
  }

  private async upsertImportRow(
    row: InventoryStarterImportRow,
    branchId: string,
    userId: string,
  ): Promise<InventoryStarterImportOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const existingDrug = await this.findImportedDrug(tx, row, branchId);
      const drugUniqueFields = await this.getSafeDrugUniqueFields(
        tx,
        row,
        existingDrug?.id,
      );
      const hasImportedPrice =
        row.hasSellingPrice || row.hasCostPrice || row.hasMrp;
      const drugPayload: any = {
        name: row.name,
        manufacturerName: row.manufacturer,
        type: 'allopathy',
        packSizeLabel: row.packSizeLabel,
        composition1: row.composition1,
        composition2: row.composition2,
        category: row.category,
        description: row.description,
        dosageForm: row.dosageForm,
        strength: row.strength,
        storageConditions: row.storageConditions,
        minStockLevel: row.minStockLevel,
        maxStockLevel: row.maxStockLevel,
        isActive: true,
        isDiscontinued: false,
        ...drugUniqueFields,
      };
      if (!existingDrug || hasImportedPrice) {
        drugPayload.price = row.sellingPrice;
      }

      const drug = existingDrug
        ? await tx.drug.update({
            where: { id: existingDrug.id },
            data: drugPayload,
          })
        : await tx.drug.create({
            data: {
              ...drugPayload,
              branchId,
            },
          });

      const existingInventory = await this.findImportedInventoryItem(
        tx,
        row,
        branchId,
      );
      const inventoryUniqueFields = await this.getSafeInventoryUniqueFields(
        tx,
        row,
        existingInventory?.id,
      );
      const expiryDate = row.expiryDate ? new Date(row.expiryDate) : undefined;
      const stockStatus = this.deriveImportedStockStatus(
        row.currentStock,
        row.reorderLevel,
        expiryDate,
      );

      if (!existingInventory) {
        const inventoryItem = await tx.inventoryItem.create({
          data: {
            branchId,
            name: row.name,
            description: row.description,
            genericName: row.composition1,
            brandName: row.name,
            type: InventoryItemType.MEDICINE,
            category: row.category,
            subCategory: row.category,
            manufacturer: row.manufacturer,
            supplier: row.supplier,
            costPrice: row.costPrice,
            sellingPrice: row.sellingPrice,
            mrp: row.mrp,
            unit: row.unit,
            packSize: row.packSize,
            packUnit: row.packUnit,
            currentStock: row.currentStock,
            minStockLevel: row.minStockLevel,
            maxStockLevel: row.maxStockLevel,
            reorderLevel: row.reorderLevel,
            reorderQuantity: row.reorderLevel,
            expiryDate,
            batchNumber: row.batchNumber,
            hsnCode: row.hsnCode,
            gstRate: row.gstRate,
            requiresPrescription: row.requiresPrescription,
            isControlled: row.isControlled,
            storageLocation: row.storageLocation,
            storageConditions: row.storageConditions,
            status: InventoryStatus.ACTIVE,
            stockStatus,
            metadata: JSON.stringify({ source: 'excel-starter-import' }),
            ...inventoryUniqueFields,
            drugs: {
              connect: { id: drug.id },
            },
          },
        });

        const stockAdjusted = await this.createStarterStockTransaction(
          tx,
          inventoryItem.id,
          branchId,
          userId,
          row.currentStock,
          row.costPrice,
          row,
        );

        return {
          status: 'created',
          drugCreated: !existingDrug,
          stockAdjusted,
        };
      }

      const stockDelta = row.hasCurrentStock
        ? row.currentStock - existingInventory.currentStock
        : 0;
      const isDrugLinked = await tx.inventoryItem.count({
        where: {
          id: existingInventory.id,
          drugs: { some: { id: drug.id } },
        },
      });
      const updatePayload: any = {
        name: row.name,
        description: row.description,
        genericName: row.composition1,
        brandName: row.name,
        type: InventoryItemType.MEDICINE,
        category: row.category,
        subCategory: row.category,
        manufacturer: row.manufacturer,
        supplier: row.supplier,
        unit: row.unit,
        packSize: row.packSize,
        packUnit: row.packUnit,
        minStockLevel: row.minStockLevel,
        maxStockLevel: row.maxStockLevel,
        reorderLevel: row.reorderLevel,
        reorderQuantity: row.reorderLevel,
        expiryDate,
        batchNumber: row.batchNumber,
        hsnCode: row.hsnCode,
        gstRate: row.gstRate,
        requiresPrescription: row.requiresPrescription,
        isControlled: row.isControlled,
        storageLocation: row.storageLocation,
        storageConditions: row.storageConditions,
        status: InventoryStatus.ACTIVE,
        metadata: JSON.stringify({ source: 'excel-starter-import' }),
        ...inventoryUniqueFields,
      };
      if (row.hasCostPrice) updatePayload.costPrice = row.costPrice;
      if (row.hasSellingPrice) updatePayload.sellingPrice = row.sellingPrice;
      if (row.hasMrp) updatePayload.mrp = row.mrp;
      if (row.hasCurrentStock) {
        updatePayload.currentStock = row.currentStock;
        updatePayload.stockStatus = stockStatus;
      }
      if (isDrugLinked === 0) {
        updatePayload.drugs = {
          connect: { id: drug.id },
        };
      }

      await tx.inventoryItem.update({
        where: { id: existingInventory.id },
        data: updatePayload,
      });

      const stockAdjusted = await this.createStarterStockTransaction(
        tx,
        existingInventory.id,
        branchId,
        userId,
        stockDelta,
        row.hasCostPrice ? row.costPrice : existingInventory.costPrice,
        row,
      );

      return {
        status: 'updated',
        drugCreated: !existingDrug,
        stockAdjusted,
      };
    });
  }

  private normalizeImportRow(sourceRow: Record<string, unknown>) {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(sourceRow)) {
      normalized[this.normalizeImportKey(key)] = value;
    }
    return normalized;
  }

  private normalizeImportKey(key: string) {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private readImportString(
    row: Record<string, unknown>,
    aliases: string[],
  ): string | undefined {
    for (const alias of aliases) {
      const value = row[this.normalizeImportKey(alias)];
      if (value === undefined || value === null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return undefined;
  }

  private readImportNumber(
    row: Record<string, unknown>,
    aliases: string[],
  ): number | undefined {
    for (const alias of aliases) {
      const value = row[this.normalizeImportKey(alias)];
      const parsed = this.parseImportNumber(value);
      if (parsed !== undefined) return parsed;
    }
    return undefined;
  }

  private readImportBoolean(
    row: Record<string, unknown>,
    aliases: string[],
  ): boolean | undefined {
    for (const alias of aliases) {
      const value = row[this.normalizeImportKey(alias)];
      if (value === undefined || value === null || value === '') continue;
      if (typeof value === 'boolean') return value;
      const text = String(value).trim().toLowerCase();
      if (['true', 'yes', 'y', '1', 'rx', 'required'].includes(text)) {
        return true;
      }
      if (['false', 'no', 'n', '0', 'notrequired'].includes(text)) {
        return false;
      }
    }
    return undefined;
  }

  private readImportDate(
    row: Record<string, unknown>,
    aliases: string[],
  ): string | undefined {
    for (const alias of aliases) {
      const value = row[this.normalizeImportKey(alias)];
      if (value === undefined || value === null || value === '') continue;
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
      }
      // Month-only expiry strings must not become month/day in the year 2001.
      const monthYear = String(value)
        .trim()
        .match(/^(0?[1-9]|1[0-2])[\/-](\d{2}|\d{4})$/);
      if (monthYear) {
        const year =
          monthYear[2].length === 2
            ? 2000 + Number(monthYear[2])
            : Number(monthYear[2]);
        return new Date(
          Date.UTC(year, Number(monthYear[1]), 1) - 1,
        ).toISOString();
      }
      const numeric = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(numeric) && numeric > 25000) {
        const parsed = XLSX.SSF.parse_date_code(numeric);
        if (parsed) {
          return new Date(
            Date.UTC(parsed.y, parsed.m - 1, parsed.d),
          ).toISOString();
        }
      }
      const parsedDate = new Date(String(value));
      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString();
      }
    }
    return undefined;
  }

  private parseImportNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : undefined;
    }
    const cleaned = String(value)
      .replace(/,/g, '')
      .replace(/[^\d.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') return undefined;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private parsePackSizeLabel(packSizeLabel: string): {
    packSize?: number;
    packUnit?: string;
    unit: UnitType;
  } {
    const normalized = packSizeLabel.toLowerCase();
    const stripMatch = normalized.match(/strip\s+of\s+(\d+)/);
    const genericMatch = normalized.match(/(\d+(?:\.\d+)?)\s*([a-z]+)/);
    const packSize = stripMatch
      ? Number(stripMatch[1])
      : genericMatch
        ? Number(genericMatch[1])
        : undefined;
    const packUnit = stripMatch
      ? 'pieces'
      : genericMatch
        ? genericMatch[2]
        : undefined;

    return {
      packSize: packSize ? Math.max(1, Math.round(packSize)) : undefined,
      packUnit,
      unit: this.mapImportUnitType(`${packSizeLabel} ${packUnit || ''}`),
    };
  }

  private mapImportUnitType(value: string): UnitType {
    const text = value.toLowerCase();
    if (
      text.includes('strip') ||
      text.includes('tablet') ||
      text.includes('capsule')
    ) {
      return UnitType.STRIPS;
    }
    if (
      text.includes('tube') ||
      text.includes('cream') ||
      text.includes('gel') ||
      text.includes('ointment') ||
      /\b(g|gm|gram)\b/.test(text)
    ) {
      return UnitType.TUBES;
    }
    if (
      text.includes('bottle') ||
      text.includes('syrup') ||
      text.includes('lotion') ||
      text.includes('solution') ||
      text.includes('drop') ||
      /\b(ml|l)\b/.test(text)
    ) {
      return UnitType.BOTTLES;
    }
    if (text.includes('vial')) return UnitType.VIALS;
    if (text.includes('ampoule')) return UnitType.AMPOULES;
    if (text.includes('syringe')) return UnitType.SYRINGES;
    if (text.includes('box')) return UnitType.BOXES;
    if (text.includes('pack')) return UnitType.PACKS;
    if (text.includes('kit')) return UnitType.KITS;
    return UnitType.PIECES;
  }

  private inferCategory(name: string): string | undefined {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('antibiotic')) return 'Antibiotics';
    if (lowerName.includes('sunscreen')) return 'Sunscreen';
    if (lowerName.includes('cream') || lowerName.includes('ointment')) {
      return 'Topical';
    }
    if (lowerName.includes('tablet')) return 'Tablets';
    if (lowerName.includes('capsule')) return 'Capsules';
    if (lowerName.includes('syrup')) return 'Syrups';
    if (lowerName.includes('injection')) return 'Injections';
    return undefined;
  }

  private inferDosageForm(value: string): string | undefined {
    const text = value.toLowerCase();
    const forms = [
      'tablet',
      'capsule',
      'cream',
      'ointment',
      'gel',
      'lotion',
      'solution',
      'syrup',
      'injection',
      'drops',
      'shampoo',
      'soap',
      'powder',
      'spray',
    ];
    const match = forms.find((form) => text.includes(form));
    return match ? match[0].toUpperCase() + match.slice(1) : undefined;
  }

  private parseStrength(value: string): string | undefined {
    const match = value.match(/(\d+(?:\.\d+)?\s*(?:mg|mcg|g|gm|ml|iu|%))/i);
    return match ? match[1].replace(/\s+/g, ' ').trim() : undefined;
  }

  private inferRequiresPrescription(
    name: string,
    category: string,
    dosageForm: string,
  ) {
    const text = `${name} ${category} ${dosageForm}`.toLowerCase();
    return [
      'antibiotic',
      'retinoid',
      'steroid',
      'isotretinoin',
      'tablet',
      'capsule',
      'injection',
    ].some((term) => text.includes(term));
  }

  private inferControlledDrug(name: string) {
    const text = name.toLowerCase();
    return ['isotretinoin', 'steroid', 'tretinoin'].some((term) =>
      text.includes(term),
    );
  }

  private async findImportedDrug(
    tx: any,
    row: InventoryStarterImportRow,
    branchId: string,
  ) {
    const codeConditions = [
      row.sku ? { sku: row.sku } : undefined,
      row.barcode ? { barcode: row.barcode } : undefined,
    ].filter(Boolean);

    if (codeConditions.length > 0) {
      const byCode = await tx.drug.findFirst({
        where: {
          branchId,
          OR: codeConditions,
        },
      });
      if (byCode) return byCode;
    }

    return tx.drug.findFirst({
      where: {
        branchId,
        name: { equals: row.name, mode: 'insensitive' },
        manufacturerName: { equals: row.manufacturer, mode: 'insensitive' },
      },
    });
  }

  private async findImportedInventoryItem(
    tx: any,
    row: InventoryStarterImportRow,
    branchId: string,
  ) {
    const codeConditions = [
      row.sku ? { sku: row.sku } : undefined,
      row.barcode ? { barcode: row.barcode } : undefined,
    ].filter(Boolean);

    if (codeConditions.length > 0) {
      const byCode = await tx.inventoryItem.findFirst({
        where: {
          branchId,
          OR: codeConditions,
          ...(row.batchNumber
            ? { batchNumber: { equals: row.batchNumber, mode: 'insensitive' } }
            : {}),
        },
      });
      if (byCode) return byCode;
    }

    const nameWhere: any = {
      branchId,
      name: { equals: row.name, mode: 'insensitive' },
    };
    if (row.batchNumber) {
      nameWhere.batchNumber = {
        equals: row.batchNumber,
        mode: 'insensitive',
      };
    }
    return tx.inventoryItem.findFirst({
      where: nameWhere,
    });
  }

  private async getSafeDrugUniqueFields(
    tx: any,
    row: InventoryStarterImportRow,
    existingDrugId?: string,
  ) {
    const fields: Record<string, string> = {};
    if (row.sku) {
      const owner = await tx.drug.findFirst({ where: { sku: row.sku } });
      if (!owner || owner.id === existingDrugId) fields.sku = row.sku;
    }
    if (row.barcode) {
      const owner = await tx.drug.findFirst({
        where: { barcode: row.barcode },
      });
      if (!owner || owner.id === existingDrugId) fields.barcode = row.barcode;
    }
    return fields;
  }

  private async getSafeInventoryUniqueFields(
    tx: any,
    row: InventoryStarterImportRow,
    existingInventoryId?: string,
  ) {
    const fields: Record<string, string> = {};
    if (row.sku) {
      const owner = await tx.inventoryItem.findFirst({
        where: { sku: row.sku },
      });
      if (!owner || owner.id === existingInventoryId) fields.sku = row.sku;
    }
    if (row.barcode) {
      const owner = await tx.inventoryItem.findFirst({
        where: { barcode: row.barcode },
      });
      if (!owner || owner.id === existingInventoryId) {
        fields.barcode = row.barcode;
      }
    }
    return fields;
  }

  private async createStarterStockTransaction(
    tx: any,
    itemId: string,
    branchId: string,
    userId: string,
    quantityDelta: number,
    unitPrice: number,
    row: InventoryStarterImportRow,
  ) {
    if (quantityDelta === 0) return false;

    const quantity = Math.abs(Math.round(quantityDelta));
    await tx.stockTransaction.create({
      data: {
        itemId,
        branchId,
        userId,
        type: TransactionType.ADJUSTMENT,
        quantity,
        unitPrice,
        totalAmount: quantity * unitPrice,
        reference: 'Excel starter import',
        reason:
          quantityDelta > 0
            ? 'Opening stock imported from Excel'
            : 'Opening stock corrected from Excel',
        notes: `Imported ${row.name} from pharmacy starter inventory file`,
        batchNumber: row.batchNumber,
        expiryDate: row.expiryDate ? new Date(row.expiryDate) : undefined,
        supplier: row.supplier,
        location: row.storageLocation,
      },
    });

    return true;
  }

  private deriveImportedStockStatus(
    currentStock: number,
    reorderLevel: number,
    expiryDate?: Date,
  ) {
    if (expiryDate && expiryDate < new Date()) return StockStatus.EXPIRED;
    if (currentStock <= 0) return StockStatus.OUT_OF_STOCK;
    if (reorderLevel && currentStock <= reorderLevel) {
      return StockStatus.LOW_STOCK;
    }
    return StockStatus.IN_STOCK;
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100;
  }
}
