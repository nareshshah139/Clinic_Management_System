import { BadRequestException, Injectable } from '@nestjs/common';
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
      totalRows: nonEmptyRows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      drugsCreated: 0,
      stockAdjusted: 0,
      errors: [] as Array<{ row: number; message: string }>,
    };

    for (const [index, sourceRow] of nonEmptyRows.entries()) {
      const rowNumber = index + 2;
      try {
        const parsed = this.mapImportRow(sourceRow);
        if (!parsed) {
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
        result.skipped += 1;
        result.errors.push({
          row: rowNumber,
          message: error.message || 'Import failed for this row',
        });
      }
    }

    return result;
  }

  private readWorkbookRows(buffer: Buffer): Record<string, unknown>[] {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error('Workbook does not contain any sheets');
      }

      return XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[firstSheetName],
        { defval: '', raw: false },
      );
    } catch (error) {
      throw new BadRequestException(
        `Could not read Excel file: ${error.message}`,
      );
    }
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
        'therapeuticcategory',
        'drugcategory',
      ]) ||
      this.inferCategory(name) ||
      'Uncategorised';
    const dosageForm =
      this.readImportString(row, ['dosageform', 'form']) ||
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
      expiryDate: this.readImportDate(row, [
        'expirydate',
        'expiry',
        'expdate',
      ]),
      hsnCode: this.readImportString(row, ['hsncode', 'hsn']),
      gstRate: this.readImportNumber(row, ['gstrate', 'gst', 'gstpercent']),
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
    const cleaned = String(value).replace(/,/g, '').replace(/[^\d.-]/g, '');
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
    const match = value.match(
      /(\d+(?:\.\d+)?\s*(?:mg|mcg|g|gm|ml|iu|%))/i,
    );
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
