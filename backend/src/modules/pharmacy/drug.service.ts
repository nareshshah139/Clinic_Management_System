import { autocompleteDrugCatalog } from '../../shared/search/drug-search';
import { loadInventoryGstRates } from './pharmacy-inventory-gst';
import { purchaseCatalogIssues } from './purchase-product-catalog';
import { writeStockMovement } from '../inventory/inventory-stock';
import { availableStock, stockIdentityKey } from './pharmacy-stock-identity';
import { isDeepStrictEqual } from 'node:util';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  CreateDrugDto,
  UpdateDrugDto,
  QueryDrugDto,
  DrugAutocompleteDto,
  CreateDrugInventoryChangeRequestDto,
  QueryDrugInventoryChangeRequestDto,
  ReviewDrugInventoryChangeRequestDto,
} from './dto/drug.dto';
import {
  DrugInventoryChangeRequestStatus,
  InventoryStatus,
  Prisma,
  TransactionType,
  UserRole,
} from '@prisma/client';

@Injectable()
export class DrugService {
  constructor(private prisma: PrismaService) {}

  async create(createDrugDto: CreateDrugDto, branchId: string) {
    try {
      this.assertProductMasterComplete(createDrugDto);

      // Duplicate checks: barcode/SKU, and soft match by name+manufacturer in same branch
      const dup = await this.prisma.drug.findFirst({
        where: {
          branchId,
          OR: [
            createDrugDto.barcode
              ? { barcode: createDrugDto.barcode }
              : undefined,
            createDrugDto.sku ? { sku: createDrugDto.sku } : undefined,
            {
              AND: [
                { name: { equals: createDrugDto.name, mode: 'insensitive' } },
                {
                  manufacturerName: {
                    equals: createDrugDto.manufacturerName,
                    mode: 'insensitive',
                  },
                },
              ],
            },
          ].filter(Boolean) as any,
        },
      });

      if (dup) {
        if (createDrugDto.barcode && dup.barcode === createDrugDto.barcode) {
          throw new ConflictException(
            'A drug with this barcode already exists',
          );
        }
        if (createDrugDto.sku && dup.sku === createDrugDto.sku) {
          throw new ConflictException('A drug with this SKU already exists');
        }
        // Same name+manufacturer — treat as duplicate
        throw new ConflictException(
          'A drug with the same name and manufacturer already exists',
        );
      }

      const drug = await this.prisma.drug.create({
        data: {
          ...createDrugDto,
          branchId,
        },
        include: {
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return drug;
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new Error(`Failed to create drug: ${error.message}`);
    }
  }

  async findAll(query: QueryDrugDto, branchId: string) {
    const {
      search,
      category,
      manufacturer,
      type,
      dosageForm,
      includeDiscontinued = false,
      minPrice,
      maxPrice,
      page = 1,
      limit = 20,
      sortBy = 'name',
      sortOrder = 'asc',
      isActive,
    } = query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.DrugWhereInput = {
      branchId,
      ...(isActive !== undefined ? { isActive } : { isActive: true }),
      ...(includeDiscontinued ? {} : { isDiscontinued: false }),
    };

    // Add search conditions. Tokenized matching lets "Adapalene Gel 0.1%"
    // match "Adapalene 0.1% Gel 15g" instead of requiring the full phrase
    // in the same order.
    if (search) {
      const tokens = this.normalizeSearchTokens(search);
      if (tokens.length > 1) {
        where.AND = tokens.map((token) => ({
          OR: this.buildDrugSearchClauses(token),
        }));
      } else {
        where.OR = this.buildDrugSearchClauses(search.trim());
      }
    }

    // Add filters
    if (category) {
      where.category = { contains: category, mode: 'insensitive' };
    }
    if (manufacturer) {
      where.manufacturerName = { contains: manufacturer, mode: 'insensitive' };
    }
    if (type) {
      where.type = { contains: type, mode: 'insensitive' };
    }
    if (dosageForm) {
      where.dosageForm = { contains: dosageForm, mode: 'insensitive' };
    }

    // Add price range filters
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    const orderBy = {
      [this.normalizeDrugSortBy(sortBy)]: sortOrder === 'desc' ? 'desc' : 'asc',
    } as Prisma.DrugOrderByWithRelationInput;

    try {
      const [drugs, total] = await Promise.all([
        this.prisma.drug.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          include: {
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
            _count: {
              select: {
                invoiceItems: true,
                inventoryItems: true,
              },
            },
            inventoryItems: {
              where: {
                branchId,
                status: InventoryStatus.ACTIVE,
              },
              select: {
                id: true,
                currentStock: true,
                stockStatus: true,
                reorderLevel: true,
                minStockLevel: true,
                expiryDate: true,
                updatedAt: true,
              },
              orderBy: {
                updatedAt: 'desc',
              },
            },
          },
        }),
        this.prisma.drug.count({ where }),
      ]);

      const gstRates = await loadInventoryGstRates(this.prisma, drugs.map(drug => drug.id), branchId);
      const enrichedDrugs = drugs.map((drug) => {
        const inventoryItems = drug.inventoryItems || [];
        const totalStock = inventoryItems.reduce(
          (sum, item) => sum + Number(item.currentStock || 0),
          0,
        );
        const primaryInventoryItem = inventoryItems[0] || null;
        return {
          ...drug,
          gstRate: gstRates.get(drug.id) ?? null,
          totalStock,
          primaryInventoryItemId: primaryInventoryItem?.id || null,
          primaryStockStatus: primaryInventoryItem?.stockStatus || null,
        };
      });

      return {
        data: enrichedDrugs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new Error(`Failed to fetch drugs: ${error.message}`);
    }
  }

  /**
   * @cc [owner:nareshshah139,label:product] billing-drug-detail-inventory-gst
   * A branch-scoped product lookup MUST expose its Inventory GST rate, including zero.
   * Missing or conflicting inventory rates MUST remain null for pharmacist review.
   */
  async findOne(id: string, branchId: string) {
    try {
      const drug = await this.prisma.drug.findFirst({
        where: {
          id,
          branchId,
        },
        include: {
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
          invoiceItems: {
            select: {
              id: true,
              quantity: true,
              totalAmount: true,
              createdAt: true,
              invoice: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  patient: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 10,
          },
          inventoryItems: {
            select: {
              id: true,
              currentStock: true,
              minStockLevel: true,
              maxStockLevel: true,
              storageLocation: true,
              expiryDate: true,
            },
          },
          _count: {
            select: {
              invoiceItems: true,
              inventoryItems: true,
            },
          },
        },
      });

      if (!drug) {
        throw new NotFoundException('Drug not found');
      }

      const rates = await loadInventoryGstRates(this.prisma, [drug.id], branchId);
      return { ...drug, gstRate: rates.get(drug.id) ?? null };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to fetch drug: ${error.message}`);
    }
  }

  async update(
    id: string,
    updateDrugDto: UpdateDrugDto,
    branchId: string,
    actorRole?: UserRole | string,
  ) {
    try {
      // Check if drug exists
      const existingDrug = await this.prisma.drug.findFirst({
        where: { id, branchId },
      });

      if (!existingDrug) {
        throw new NotFoundException('Drug not found');
      }

      if (
        actorRole === UserRole.PHARMACIST &&
        updateDrugDto.price !== undefined &&
        updateDrugDto.price !== existingDrug.price
      ) {
        throw new BadRequestException(
          'Pharmacist price edits must be submitted from Inventory Stock for doctor or admin approval.',
        );
      }

      this.assertProductMasterComplete(updateDrugDto, existingDrug);

      // Check for duplicate barcode or SKU (excluding current drug)
      if (updateDrugDto.barcode || updateDrugDto.sku) {
        const duplicateDrug = await this.prisma.drug.findFirst({
          where: {
            id: { not: id },
            OR: [
              updateDrugDto.barcode ? { barcode: updateDrugDto.barcode } : {},
              updateDrugDto.sku ? { sku: updateDrugDto.sku } : {},
            ].filter((condition) => Object.keys(condition).length > 0),
          },
        });

        if (duplicateDrug) {
          if (duplicateDrug.barcode === updateDrugDto.barcode) {
            throw new ConflictException(
              'A drug with this barcode already exists',
            );
          }
          if (duplicateDrug.sku === updateDrugDto.sku) {
            throw new ConflictException('A drug with this SKU already exists');
          }
        }
      }

      const drug = await this.prisma.drug.update({
        where: { id },
        data: updateDrugDto,
        include: {
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return drug;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new Error(`Failed to update drug: ${error.message}`);
    }
  }

  async createInventoryChangeRequests(
    dto: CreateDrugInventoryChangeRequestDto,
    branchId: string,
    requestedById: string,
  ) {
    if (dto.changes.some(change => change.scope === 'BATCH')) {
      if (dto.changes.length !== 1) throw new BadRequestException('Submit one batch edit at a time.');
      return this.createBatchChangeRequest(dto.changes[0], branchId, requestedById);
    }
    if (dto.changes.some(change => !change.drugId)) throw new BadRequestException('A drug ID is required for product-total edits.');
    const dedupedDrugIds = Array.from(
      new Set(dto.changes.map((change) => change.drugId!)),
    );

    if (dedupedDrugIds.length !== dto.changes.length) {
      throw new BadRequestException(
        'Each drug can appear only once in an inventory change batch.',
      );
    }

    const drugs = await this.prisma.drug.findMany({
      where: {
        branchId,
        id: { in: dedupedDrugIds },
        isActive: true,
      },
      include: {
        inventoryItems: {
          where: {
            branchId,
            status: InventoryStatus.ACTIVE,
          },
          include: { drugs: { select: { id: true } } },
          orderBy: {
            updatedAt: 'desc',
          },
        },
      },
    });

    if (drugs.length !== dedupedDrugIds.length) {
      const foundIds = new Set(drugs.map((drug) => drug.id));
      const missingIds = dedupedDrugIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Drug not found or inactive: ${missingIds.join(', ')}`,
      );
    }

    const existingPending =
      await this.prisma.drugInventoryChangeRequest.findMany({
        where: {
          branchId,
          drugId: { in: dedupedDrugIds },
          status: DrugInventoryChangeRequestStatus.PENDING,
        },
        include: {
          drug: {
            select: {
              name: true,
            },
          },
        },
      });

    if (existingPending.length > 0) {
      throw new ConflictException(
        `Pending inventory request already exists for ${existingPending
          .map((request) => request.drug?.name || 'this item')
          .join(', ')}.`,
      );
    }

    const drugById = new Map(drugs.map((drug) => [drug.id, drug]));
    const now = new Date();

    const created = await this.prisma.$transaction(
      dto.changes.map((change) => {
        const drug = drugById.get(change.drugId!);
        if (!drug) {
          throw new NotFoundException(`Drug not found: ${change.drugId}`);
        }
        const proposedPrice = change.proposedPrice;
        const proposedStock = change.proposedStock;
        const hasPriceChange =
          proposedPrice !== undefined && proposedPrice !== drug.price;
        const stockSnapshot = this.resolveStockSnapshot(
          drug.inventoryItems,
          change.inventoryItemId,
          drug.name,
          proposedStock !== undefined,
        );
        const hasStockChange =
          proposedStock !== undefined &&
          proposedStock !== stockSnapshot.totalStock;
        const savedSnapshot = hasStockChange
          ? this.inventoryApprovalSnapshot(drug.inventoryItems, drug.id)
          : undefined;

        if (!hasPriceChange && !hasStockChange) {
          throw new BadRequestException(
            `No price or stock change requested for ${drug.name}.`,
          );
        }

        return this.prisma.drugInventoryChangeRequest.create({
          data: {
            branchId,
            drugId: drug.id,
            inventoryItemId:
              proposedStock !== undefined ? stockSnapshot.primaryItemId : null,
            requestedById,
            currentPrice: hasPriceChange ? drug.price : null,
            proposedPrice: hasPriceChange ? proposedPrice : null,
            currentStock: hasStockChange ? stockSnapshot.totalStock : null,
            proposedStock: hasStockChange ? proposedStock : null,
            stockSnapshot: savedSnapshot,
            reason: change.reason?.trim() || null,
            createdAt: now,
          },
          include: this.inventoryChangeRequestInclude(),
        });
      }),
    );

    return {
      data: created,
      summary: {
        submitted: created.length,
      },
    };
  }

  async findInventoryChangeRequests(
    query: QueryDrugInventoryChangeRequestDto,
    branchId: string,
  ) {
    const { status = DrugInventoryChangeRequestStatus.PENDING, search } =
      query;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.DrugInventoryChangeRequestWhereInput = {
      branchId,
      status,
    };

    if (search?.trim()) {
      const term = search.trim();
      where.OR = [
        { inventoryItem: { name: { contains: term, mode: 'insensitive' } } },
        { drug: { name: { contains: term, mode: 'insensitive' } } },
        {
          drug: {
            manufacturerName: { contains: term, mode: 'insensitive' },
          },
        },
        { requestedBy: { firstName: { contains: term, mode: 'insensitive' } } },
        { requestedBy: { lastName: { contains: term, mode: 'insensitive' } } },
        { reviewedBy: { firstName: { contains: term, mode: 'insensitive' } } },
        { reviewedBy: { lastName: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [requests, total] = await Promise.all([
      this.prisma.drugInventoryChangeRequest.findMany({
        where,
        include: this.inventoryChangeRequestInclude(),
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.drugInventoryChangeRequest.count({ where }),
    ]);

    return {
      data: requests,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * @cc [owner:nareshshah139,label:product] inventory-approval-atomic-claim
   * Only a pending branch request may be approved. Its status, unchanged price basis,
   * stock change and signed ledger movement MUST commit together once; concurrent changes fail.
   */
  async approveInventoryChangeRequest(
    id: string,
    dto: ReviewDrugInventoryChangeRequestDto,
    branchId: string,
    reviewedById: string,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const request = await tx.drugInventoryChangeRequest.findFirst({
          where: { id, branchId },
          include: {
            drug: true,
            inventoryItem: true,
          },
        });

        if (!request) {
          throw new NotFoundException('Inventory change request not found');
        }

        if (request.status !== DrugInventoryChangeRequestStatus.PENDING) {
          throw new ConflictException(
            'Only pending inventory change requests can be approved.',
          );
        }

        const batchEdit = (request.stockSnapshot as any)?.scope === 'BATCH';
        if (!batchEdit && (!request.drugId || !request.drug)) throw new ConflictException('Product link missing. Reject this legacy request and resubmit from Stock.');
        if (batchEdit) {
          await this.applyApprovedBatchChange(tx, request, branchId, reviewedById);
        } else if (request.proposedPrice !== null && request.proposedPrice !== undefined) {
          if (request.currentPrice !== request.drug!.price) {
            throw new ConflictException('Price changed since this request. Reject it and resubmit.');
          }
          await tx.drug.update({
            where: { id: request.drugId!, branchId, price: request.currentPrice },
            data: { price: request.proposedPrice },
          });
        }

        if (!batchEdit && request.proposedStock !== null && request.proposedStock !== undefined) {
          await this.applyApprovedStockChange(
            tx,
            { ...request, drugId: request.drugId!, drug: request.drug! },
            branchId,
            reviewedById,
          );
        }

        return tx.drugInventoryChangeRequest.update({
          where: { id, branchId, status: DrugInventoryChangeRequestStatus.PENDING },
          data: {
            status: DrugInventoryChangeRequestStatus.APPROVED,
            reviewedById,
            reviewNote: dto.reviewNote?.trim() || null,
            reviewedAt: new Date(),
          },
          include: this.inventoryChangeRequestInclude(),
        });
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (['P2025', 'P2034'].includes((error as any)?.code)) {
        throw new ConflictException('Request or inventory changed. Refresh before reviewing again.');
      }
      throw error;
    }
  }

  async rejectInventoryChangeRequest(
    id: string,
    dto: ReviewDrugInventoryChangeRequestDto,
    branchId: string,
    reviewedById: string,
  ) {
    const request = await this.prisma.drugInventoryChangeRequest.findFirst({
      where: { id, branchId },
    });

    if (!request) {
      throw new NotFoundException('Inventory change request not found');
    }

    if (request.status !== DrugInventoryChangeRequestStatus.PENDING) {
      throw new ConflictException(
        'Only pending inventory change requests can be rejected.',
      );
    }

    try {
      return await this.prisma.drugInventoryChangeRequest.update({
      where: { id, branchId, status: DrugInventoryChangeRequestStatus.PENDING },
      data: {
        status: DrugInventoryChangeRequestStatus.REJECTED,
        reviewedById,
        reviewNote: dto.reviewNote?.trim() || null,
        reviewedAt: new Date(),
      },
      include: this.inventoryChangeRequestInclude(),
      });
    } catch (error) {
      if ((error as any)?.code === 'P2025') throw new ConflictException('Request was already reviewed. Refresh the approval queue.');
      throw error;
    }
  }

  async remove(id: string, branchId: string) {
    try {
      // Check if drug exists
      const existingDrug = await this.prisma.drug.findFirst({
        where: { id, branchId },
      });

      if (!existingDrug) {
        throw new NotFoundException('Drug not found');
      }

      // Check if drug is used in any invoices
      const invoiceItemsCount = await this.prisma.pharmacyInvoiceItem.count({
        where: { drugId: id },
      });

      if (invoiceItemsCount > 0) {
        // Soft delete - mark as inactive instead of hard delete
        const drug = await this.prisma.drug.update({
          where: { id },
          data: { isActive: false },
        });
        return { message: 'Drug marked as inactive (used in invoices)', drug };
      }

      // Hard delete if not used
      await this.prisma.drug.delete({
        where: { id },
      });

      return { message: 'Drug deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to delete drug: ${error.message}`);
    }
  }

  /**
   * @cc [owner:nareshshah139,label:product] drug-autocomplete-shared-search
   * Autocomplete MUST use the shared product matcher and branch-scoped active catalogue
   * candidates. Ingredient/name modes MUST restrict matches to their requested fields. It MUST
   * rank before limiting results and MUST NOT change products, prices, mappings or stock.
   */
  async autocomplete(query: DrugAutocompleteDto, branchId: string) {
    const drugs = await autocompleteDrugCatalog(this.prisma, query, branchId);
    const gstRates = await loadInventoryGstRates(this.prisma, drugs.map(drug => drug.id), branchId);
    return drugs.map(drug => ({ ...drug, gstRate: gstRates.get(drug.id) ?? null }));
  }

  async getCategories(branchId: string) {
    try {
      const categories = await this.prisma.drug.findMany({
        where: {
          branchId,
          isActive: true,
          category: { not: null },
        },
        select: {
          category: true,
        },
        distinct: ['category'],
        orderBy: {
          category: 'asc',
        },
      });

      return categories
        .map((item) => item.category)
        .filter(Boolean)
        .sort();
    } catch (error) {
      throw new Error(`Failed to fetch categories: ${error.message}`);
    }
  }

  async getManufacturers(branchId: string) {
    try {
      const manufacturers = await this.prisma.drug.findMany({
        where: {
          branchId,
          isActive: true,
        },
        select: {
          manufacturerName: true,
        },
        distinct: ['manufacturerName'],
        orderBy: {
          manufacturerName: 'asc',
        },
      });

      return manufacturers
        .map((item) => item.manufacturerName)
        .filter(Boolean)
        .sort();
    } catch (error) {
      throw new Error(`Failed to fetch manufacturers: ${error.message}`);
    }
  }

  async getDosageForms(branchId: string) {
    try {
      const dosageForms = await this.prisma.drug.findMany({
        where: {
          branchId,
          isActive: true,
          dosageForm: { not: null },
        },
        select: {
          dosageForm: true,
        },
        distinct: ['dosageForm'],
        orderBy: {
          dosageForm: 'asc',
        },
      });

      return dosageForms
        .map((item) => item.dosageForm)
        .filter(Boolean)
        .sort();
    } catch (error) {
      throw new Error(`Failed to fetch dosage forms: ${error.message}`);
    }
  }

  /**
   * @cc [owner:nareshshah139,label:product] alternatives-available-stock-only
   * Alternative quantities MUST exclude holds and expired batches, accepting expiry through
   * its calendar day. Ambiguous product links or mixed stock units/packs MUST not be aggregated.
   */
  async getAlternatives(id: string, branchId: string) {
    try {
      const source = await this.prisma.drug.findFirst({
        where: {
          id,
          branchId,
          isActive: true,
          isDiscontinued: false,
        },
        select: {
          id: true,
          name: true,
          composition1: true,
          strength: true,
          dosageForm: true,
        },
      });

      if (!source) {
        throw new NotFoundException('Drug not found');
      }

      const missing = [
        ['composition1', 'Primary composition'],
        ['strength', 'Strength'],
        ['dosageForm', 'Dosage form'],
      ]
        .filter(([field]) => {
          const value = source[field as keyof typeof source];
          return typeof value !== 'string' || value.trim().length === 0;
        })
        .map(([, label]) => label);

      if (missing.length > 0) {
        throw new BadRequestException(
          `Cannot suggest alternatives for ${source.name}. Missing: ${missing.join(', ')}.`,
        );
      }

      const alternatives = await this.prisma.drug.findMany({
        where: {
          branchId,
          id: { not: source.id },
          isActive: true,
          isDiscontinued: false,
          composition1: {
            equals: source.composition1 as string,
            mode: 'insensitive',
          },
          strength: { equals: source.strength as string, mode: 'insensitive' },
          dosageForm: {
            equals: source.dosageForm as string,
            mode: 'insensitive',
          },
        },
        include: {
          inventoryItems: {
            where: {
              branchId,
              status: 'ACTIVE',
              currentStock: { gt: 0 },
            },
            select: {
              id: true,
              status: true,
              currentStock: true,
              heldStock: true,
              unit: true,
              packSize: true,
              packUnit: true,
              drugs: { select: { id: true } },
              batchNumber: true,
              expiryDate: true,
              mrp: true,
              sellingPrice: true,
              stockStatus: true,
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
      });

      return alternatives
        .map((drug) => {
          const unambiguous = drug.inventoryItems.every(batch =>
            batch.drugs.length === 1 && batch.drugs[0].id === drug.id,
          ) && new Set(drug.inventoryItems.map(stockIdentityKey)).size === 1;
          const usableBatches = drug.inventoryItems
            .filter(batch => unambiguous && availableStock(batch) > 0)
            .sort((a, b) => {
              const aExpiry = a.expiryDate
                ? a.expiryDate.getTime()
                : Number.MAX_SAFE_INTEGER;
              const bExpiry = b.expiryDate
                ? b.expiryDate.getTime()
                : Number.MAX_SAFE_INTEGER;
              return aExpiry - bExpiry;
            });
          const totalStock = usableBatches.reduce(
            (sum, batch) => sum + availableStock(batch),
            0,
          );
          const nearestBatch = usableBatches[0];

          return {
            id: drug.id,
            name: drug.name,
            manufacturerName: drug.manufacturerName,
            composition1: drug.composition1,
            strength: drug.strength,
            dosageForm: drug.dosageForm,
            packSizeLabel: drug.packSizeLabel,
            price: drug.price,
            totalStock,
            nearestExpiry: nearestBatch?.expiryDate || null,
            nearestBatchNumber: nearestBatch?.batchNumber || null,
            mrp: nearestBatch?.mrp ?? nearestBatch?.sellingPrice ?? drug.price,
            batches: usableBatches,
          };
        })
        .filter((drug) => drug.totalStock > 0)
        .sort((a, b) => {
          const aExpiry = a.nearestExpiry
            ? new Date(a.nearestExpiry).getTime()
            : Number.MAX_SAFE_INTEGER;
          const bExpiry = b.nearestExpiry
            ? new Date(b.nearestExpiry).getTime()
            : Number.MAX_SAFE_INTEGER;
          if (aExpiry !== bExpiry) return aExpiry - bExpiry;
          return b.totalStock - a.totalStock;
        });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new Error(`Failed to fetch drug alternatives: ${error.message}`);
    }
  }

  async getStatistics(branchId: string) {
    try {
      const [
        totalDrugs,
        activeDrugs,
        discontinuedDrugs,
        lowStockDrugs,
        topCategories,
        topManufacturers,
        recentlyAdded,
      ] = await Promise.all([
        this.prisma.drug.count({ where: { branchId } }),
        this.prisma.drug.count({ where: { branchId, isActive: true } }),
        this.prisma.drug.count({ where: { branchId, isDiscontinued: true } }),
        this.prisma.drug.count({
          where: {
            branchId,
            isActive: true,
            inventoryItems: {
              some: {
                branchId,
                status: 'ACTIVE',
                stockStatus: { in: ['LOW_STOCK', 'OUT_OF_STOCK'] },
              },
            },
          },
        }),
        this.prisma.drug.groupBy({
          by: ['category'],
          where: { branchId, isActive: true, category: { not: null } },
          _count: { category: true },
          orderBy: { _count: { category: 'desc' } },
          take: 5,
        }),
        this.prisma.drug.groupBy({
          by: ['manufacturerName'],
          where: { branchId, isActive: true },
          _count: { manufacturerName: true },
          orderBy: { _count: { manufacturerName: 'desc' } },
          take: 5,
        }),
        this.prisma.drug.findMany({
          where: { branchId, isActive: true },
          select: {
            id: true,
            name: true,
            manufacturerName: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

      return {
        totalDrugs,
        activeDrugs,
        discontinuedDrugs,
        lowStockDrugs,
        topCategories: topCategories.map((item) => ({
          category: item.category,
          count: item._count.category,
        })),
        topManufacturers: topManufacturers.map((item) => ({
          manufacturer: item.manufacturerName,
          count: item._count.manufacturerName,
        })),
        recentlyAdded,
      };
    } catch (error) {
      throw new Error(`Failed to fetch drug statistics: ${error.message}`);
    }
  }

  private inventoryChangeRequestInclude() {
    return {
      drug: {
        select: {
          id: true,
          name: true,
          manufacturerName: true,
          packSizeLabel: true,
          category: true,
          dosageForm: true,
          strength: true,
          price: true,
          isActive: true,
          isDiscontinued: true,
        },
      },
      inventoryItem: {
        select: {
          id: true,
          name: true,
          currentStock: true,
          unit: true,
          stockStatus: true,
          batchNumber: true,
          expiryDate: true,
          storageLocation: true,
        },
      },
      requestedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
      reviewedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
    } satisfies Prisma.DrugInventoryChangeRequestInclude;
  }

  /**
   * @cc [owner:nareshshah139,label:product] batch-edit-snapshot
   * Batch edit snapshots MUST retain identity, revision, stock, holds, selling price and linked
   * drug prices, so approval detects concurrent changes without inferring a catalog match.
   */
  private batchEditSnapshot(item: any) {
    return {
      scope: 'BATCH', id: item.id, updatedAt: new Date(item.updatedAt).toISOString(),
      currentStock: item.currentStock, heldStock: item.heldStock, sellingPrice: item.sellingPrice,
      unit: item.unit, status: item.status,
      drugs: item.drugs.map((drug: any) => ({ id: drug.id, price: drug.price })).sort((a: any, b: any) => a.id.localeCompare(b.id)),
    };
  }

  /**
   * @cc [owner:nareshshah139,label:product] batch-edit-awaits-approval
   * A batch edit MUST use an exact item in the authenticated branch, a matching displayed
   * revision and a nonblank reason. Submission MUST only create a pending request, including
   * for unlinked items; conflicting pending item/product edits and ambiguous price links fail.
   */
  private async createBatchChangeRequest(change: CreateDrugInventoryChangeRequestDto['changes'][number], branchId: string, requestedById: string) {
    if (!change.inventoryItemId || !change.reason?.trim() || !change.expectedUpdatedAt) {
      throw new BadRequestException('Select a batch and provide its current revision and an invoice or shelf-count reason.');
    }
    return this.prisma.$transaction(async tx => {
      const item = await tx.inventoryItem.findFirst({
        where: { id: change.inventoryItemId, branchId },
        include: { drugs: { select: { id: true, price: true, branchId: true } } },
      });
      if (!item) throw new NotFoundException('Clinic inventory item not found.');
      if (new Date(item.updatedAt).toISOString() !== change.expectedUpdatedAt) throw new ConflictException('Batch changed. Refresh before editing.');
      const price = change.proposedPrice, stock = change.proposedStock;
      if (price !== undefined && (!Number.isFinite(price) || price < 0) || stock !== undefined && (!Number.isSafeInteger(stock) || stock < 0)) {
        throw new BadRequestException('Price must be nonnegative and stock must be a nonnegative whole number.');
      }
      const priceChanged = price !== undefined && price !== item.sellingPrice;
      const stockChanged = stock !== undefined && stock !== item.currentStock;
      if (!priceChanged && !stockChanged) throw new BadRequestException('Change the price or stock before submitting.');
      if (stockChanged && stock! < item.heldStock) throw new BadRequestException('Physical stock cannot be below held stock.');
      if (priceChanged && (item.drugs.length > 1 || item.drugs.some(drug => drug.branchId !== branchId))) {
        throw new BadRequestException('Resolve ambiguous product links before editing the price.');
      }
      const pending = await tx.drugInventoryChangeRequest.findFirst({ where: {
        branchId, status: 'PENDING', OR: [
          { inventoryItemId: item.id },
          ...(item.drugs.length ? [{ drugId: { in: item.drugs.map(drug => drug.id) } }] : []),
        ],
      } });
      if (pending) throw new ConflictException('A price/stock edit for this item is already awaiting approval.');
      const request = await tx.drugInventoryChangeRequest.create({ data: {
        branchId, inventoryItemId: item.id, drugId: item.drugs.length === 1 ? item.drugs[0].id : null,
        requestedById, currentPrice: priceChanged ? item.sellingPrice : null,
        proposedPrice: priceChanged ? price : null, currentStock: stockChanged ? item.currentStock : null,
        proposedStock: stockChanged ? stock : null, reason: change.reason!.trim(),
        stockSnapshot: this.batchEditSnapshot(item),
      }, include: this.inventoryChangeRequestInclude() });
      return { data: [request], summary: { submitted: 1 } };
    }, { isolationLevel: 'Serializable' });
  }

  /**
   * @cc [owner:nareshshah139,label:product] approved-batch-edit-exact-item
   * Approval MUST reject changed snapshots, preserve holds and every other batch, and commit
   * the selected item's price/count, exact signed stock movement and request status atomically.
   * A uniquely linked drug's price MUST follow an approved selling price; unlinked edits MUST
   * NOT create or guess a catalog identity.
   */
  private async applyApprovedBatchChange(tx: Prisma.TransactionClient, request: any, branchId: string, reviewedById: string) {
    const item = await tx.inventoryItem.findFirst({
      where: { id: request.inventoryItemId, branchId },
      include: { drugs: { select: { id: true, price: true, branchId: true } } },
    });
    if (!item || !isDeepStrictEqual(this.batchEditSnapshot(item), request.stockSnapshot)) {
      throw new ConflictException('Batch changed since this request. Reject it and resubmit after checking the stock and price.');
    }
    if (request.proposedStock != null) {
      if (request.proposedStock < item.heldStock) throw new BadRequestException('Physical stock cannot be below held stock.');
      const delta = request.proposedStock - item.currentStock;
      if (delta) await writeStockMovement(tx, {
        itemId: item.id, branchId, userId: reviewedById, type: TransactionType.ADJUSTMENT, delta,
        reason: request.reason, reference: `INVENTORY-APPROVAL-${request.id}`,
        notes: `Approved batch count ${request.id}`,
      });
    }
    if (request.proposedPrice != null) {
      if (item.drugs.length > 1 || item.drugs.some(drug => drug.branchId !== branchId)) throw new ConflictException('Product links changed. Review the item before editing its price.');
      await tx.inventoryItem.update({ where: { id: item.id, branchId }, data: { sellingPrice: request.proposedPrice } });
      if (item.drugs.length === 1) await tx.drug.update({ where: { id: item.drugs[0].id, branchId }, data: { price: request.proposedPrice } });
    }
  }

  private resolveStockSnapshot(
    inventoryItems: Array<{
      id: string;
      currentStock: number;
      updatedAt?: Date | null;
    }>,
    requestedInventoryItemId: string | undefined,
    drugName: string,
    isRequired: boolean,
  ) {
    const totalStock = inventoryItems.reduce(
      (sum, item) => sum + Number(item.currentStock || 0),
      0,
    );
    const primaryItem = requestedInventoryItemId
      ? inventoryItems.find((item) => item.id === requestedInventoryItemId)
      : inventoryItems[0];

    if (isRequired && !primaryItem) {
      throw new BadRequestException(
        `Cannot request a stock change for ${drugName}; no active inventory item is linked to this drug.`,
      );
    }

    return {
      totalStock,
      primaryItemId: primaryItem?.id || null,
    };
  }

  /**
   * @cc [owner:nareshshah139,label:product] inventory-approval-batch-snapshot
   * Aggregate count requests MUST snapshot every linked active batch's balance, hold, revision
   * and unit basis. Ambiguous product links or different unit/pack bases MUST reject the request.
   */
  private inventoryApprovalSnapshot(items: any[], drugId: string) {
    const bases = new Set(items.map(item => JSON.stringify([item.unit, item.packSize ?? null, item.packUnit ?? null])));
    if (bases.size !== 1 || items.some(item => item.drugs?.length !== 1 || item.drugs[0].id !== drugId)) {
      throw new BadRequestException('Stock units, packs or product links differ. Use a batch-specific physical count.');
    }
    return [...items].sort((a, b) => a.id.localeCompare(b.id)).map(item => ({
      id: item.id,
      currentStock: item.currentStock,
      heldStock: item.heldStock,
      updatedAt: new Date(item.updatedAt).toISOString(),
      unit: item.unit,
      packSize: item.packSize ?? null,
      packUnit: item.packUnit ?? null,
      drugId,
    }));
  }

  /**
   * @cc [owner:nareshshah139,label:product] approved-count-preserves-stock-history
   * Approval MUST reject missing or changed batch snapshots and counts below held stock.
   * A nonzero count change MUST write the exact signed on-hand delta with before/after balances
   * in the approval transaction, preserving all other batches and holds; unchanged counts write no movement.
   */
  private async applyApprovedStockChange(
    tx: Prisma.TransactionClient,
    request: {
      id: string;
      drugId: string;
      inventoryItemId: string | null;
      proposedStock: number | null;
      stockSnapshot?: Prisma.JsonValue;
      drug: { name: string };
    },
    branchId: string,
    reviewedById: string,
  ) {
    if (request.proposedStock === null || request.proposedStock === undefined) {
      return;
    }

    const inventoryItems = await tx.inventoryItem.findMany({
      where: {
        branchId,
        status: InventoryStatus.ACTIVE,
        drugs: {
          some: { id: request.drugId },
        },
      },
      include: { drugs: { select: { id: true } } },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const targetItem = request.inventoryItemId
      ? inventoryItems.find((item) => item.id === request.inventoryItemId)
      : inventoryItems[0];

    if (!targetItem) {
      throw new BadRequestException(
        `Cannot approve stock change for ${request.drug.name}; no active linked inventory item was found.`,
      );
    }

    if (!request.stockSnapshot) {
      throw new ConflictException('This request has no stock snapshot. Reject it and resubmit the count.');
    }
    const snapshot = this.inventoryApprovalSnapshot(inventoryItems, request.drugId);
    if (!isDeepStrictEqual(snapshot, request.stockSnapshot)) {
      throw new ConflictException('Inventory changed since this count. Reject it and resubmit after recounting.');
    }

    const currentTotalStock = inventoryItems.reduce(
      (sum, item) => sum + Number(item.currentStock || 0),
      0,
    );
    const stockDelta = request.proposedStock - currentTotalStock;

    if (stockDelta === 0) {
      return;
    }

    const newTargetStock = Number(targetItem.currentStock || 0) + stockDelta;
    if (newTargetStock < targetItem.heldStock) {
      throw new BadRequestException(
        `Cannot set total stock for ${request.drug.name} to ${request.proposedStock}; preserve held stock and the other linked batches.`,
      );
    }

    await writeStockMovement(tx, {
      itemId: targetItem.id, branchId, userId: reviewedById,
      type: TransactionType.ADJUSTMENT, delta: stockDelta,
      reason: 'Approved inventory update',
      reference: `INVENTORY-APPROVAL-${request.id}`,
      notes: `Inventory change request ${request.id}`,
    });
  }

  private assertProductMasterComplete(
    input: Partial<CreateDrugDto & UpdateDrugDto>,
    existing?: {
      type?: string | null;
      isActive?: boolean | null;
      isDiscontinued?: boolean | null;
      composition1?: string | null;
      category?: string | null;
      dosageForm?: string | null;
      strength?: string | null;
    },
  ): void {
    const candidate = {
      ...existing,
      ...input,
    };

    if (candidate.isActive === false || candidate.isDiscontinued === true) {
      return;
    }

    const labels = { composition1: 'Generic/Salt or primary composition', category: 'Therapeutic category', dosageForm: 'Dosage form', strength: 'Strength' };
    const missing = purchaseCatalogIssues(candidate).map(field => labels[field]);

    if (missing.length > 0) {
      throw new BadRequestException(
        `Product master incomplete. Required for active pharmacy drugs: ${missing.join(', ')}.`,
      );
    }
  }

  private normalizeDrugSortBy(sortBy?: string): string {
    const allowed = new Set([
      'name',
      'createdAt',
      'updatedAt',
      'price',
      'manufacturerName',
      'category',
    ]);
    if (!sortBy) return 'name';
    if (!allowed.has(sortBy)) {
      throw new BadRequestException(`Unsupported sortBy field: ${sortBy}`);
    }
    return sortBy;
  }

  private normalizeSearchTokens(search: string): string[] {
    const tokens = search
      .trim()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);

    return tokens.length > 0 ? tokens : [search.trim()];
  }

  private buildDrugSearchClauses(token: string): Prisma.DrugWhereInput[] {
    return [
      { name: { contains: token, mode: 'insensitive' } },
      { manufacturerName: { contains: token, mode: 'insensitive' } },
      { composition1: { contains: token, mode: 'insensitive' } },
      { composition2: { contains: token, mode: 'insensitive' } },
      { category: { contains: token, mode: 'insensitive' } },
    ];
  }
}
