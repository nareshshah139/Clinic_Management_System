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
  StockStatus,
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

      const enrichedDrugs = drugs.map((drug) => {
        const inventoryItems = drug.inventoryItems || [];
        const totalStock = inventoryItems.reduce(
          (sum, item) => sum + Number(item.currentStock || 0),
          0,
        );
        const primaryInventoryItem = inventoryItems[0] || null;
        return {
          ...drug,
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

      return drug;
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
          'Pharmacist price edits must be submitted through Inventory Updates for doctor approval.',
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
    const dedupedDrugIds = Array.from(
      new Set(dto.changes.map((change) => change.drugId)),
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
          .map((request) => request.drug.name)
          .join(', ')}.`,
      );
    }

    const drugById = new Map(drugs.map((drug) => [drug.id, drug]));
    const now = new Date();

    const created = await this.prisma.$transaction(
      dto.changes.map((change) => {
        const drug = drugById.get(change.drugId);
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

  async approveInventoryChangeRequest(
    id: string,
    dto: ReviewDrugInventoryChangeRequestDto,
    branchId: string,
    reviewedById: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
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

      if (request.proposedPrice !== null && request.proposedPrice !== undefined) {
        await tx.drug.update({
          where: { id: request.drugId },
          data: { price: request.proposedPrice },
        });
      }

      if (request.proposedStock !== null && request.proposedStock !== undefined) {
        await this.applyApprovedStockChange(
          tx,
          request,
          branchId,
          reviewedById,
        );
      }

      return tx.drugInventoryChangeRequest.update({
        where: { id },
        data: {
          status: DrugInventoryChangeRequestStatus.APPROVED,
          reviewedById,
          reviewNote: dto.reviewNote?.trim() || null,
          reviewedAt: new Date(),
        },
        include: this.inventoryChangeRequestInclude(),
      });
    });
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

    return this.prisma.drugInventoryChangeRequest.update({
      where: { id },
      data: {
        status: DrugInventoryChangeRequestStatus.REJECTED,
        reviewedById,
        reviewNote: dto.reviewNote?.trim() || null,
        reviewedAt: new Date(),
      },
      include: this.inventoryChangeRequestInclude(),
    });
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

  async autocomplete(query: DrugAutocompleteDto, branchId: string) {
    // Handle limit conversion manually since DTO transformation may not work reliably
    let limit = 10; // default
    if ((query as any).limit !== undefined) {
      if (typeof (query as any).limit === 'string') {
        const num = parseInt((query as any).limit, 10);
        if (!isNaN(num) && num >= 1 && num <= 50) {
          limit = num;
        }
      } else if (
        typeof (query as any).limit === 'number' &&
        (query as any).limit >= 1 &&
        (query as any).limit <= 50
      ) {
        limit = (query as any).limit;
      }
    }

    const rawQ = ((query as any).q as string | undefined) || '';
    const q = rawQ.trim();
    const mode = (
      ((query as any).mode as string | undefined) || 'all'
    ).toLowerCase();

    try {
      const where: Prisma.DrugWhereInput = {
        branchId,
        isActive: true,
        isDiscontinued: false,
      };

      if (q) {
        const tokens = this.normalizeSearchTokens(q);
        if (mode === 'name') {
          if (tokens.length > 1) {
            where.AND = tokens.map((token) => ({
              OR: [{ name: { contains: token, mode: 'insensitive' } }],
            }));
          } else {
            where.OR = [{ name: { contains: q, mode: 'insensitive' } }];
          }
        } else if (mode === 'ingredient') {
          const ingredientClauses = (token: string) => [
            { composition1: { contains: token, mode: 'insensitive' } },
            { composition2: { contains: token, mode: 'insensitive' } },
          ];
          if (tokens.length > 1) {
            where.AND = tokens.map((token) => ({
              OR: ingredientClauses(token),
            }));
          } else {
            where.OR = ingredientClauses(q);
          }
        } else {
          if (tokens.length > 1) {
            where.AND = tokens.map((token) => ({
              OR: this.buildDrugSearchClauses(token),
            }));
          } else {
            where.OR = this.buildDrugSearchClauses(q);
          }
        }
      }

      // Fetch a broader candidate set for better ranking, then score & trim
      const sampleTake = Math.min(200, Math.max(limit * 5, 50));

      const candidates = await this.prisma.drug.findMany({
        where,
        select: {
          id: true,
          name: true,
          price: true,
          manufacturerName: true,
          packSizeLabel: true,
          composition1: true,
          composition2: true,
          category: true,
          dosageForm: true,
          strength: true,
        },
        orderBy: { name: 'asc' },
        take: q ? sampleTake : limit, // if no q provided, just return first page
      });

      if (!q) {
        return candidates.slice(0, limit);
      }

      const qLower = q.toLowerCase();
      const scoreOf = (drug: {
        name?: string | null;
        composition1?: string | null;
        composition2?: string | null;
        manufacturerName?: string | null;
        category?: string | null;
      }) => {
        let score = 0;
        const name = (drug.name || '').toLowerCase();
        const comp1 = (drug.composition1 || '').toLowerCase();
        const comp2 = (drug.composition2 || '').toLowerCase();
        const manu = (drug.manufacturerName || '').toLowerCase();
        const cat = (drug.category || '').toLowerCase();

        if (mode === 'name') {
          if (name.startsWith(qLower)) score += 1000;
          else if (name.includes(qLower)) score += 700;
          // small boosts if ingredient also matches
          if (comp1.includes(qLower)) score += 50;
          if (comp2.includes(qLower)) score += 25;
        } else if (mode === 'ingredient') {
          if (comp1.startsWith(qLower)) score += 1000;
          else if (comp1.includes(qLower)) score += 700;
          if (comp2.startsWith(qLower)) score += 800;
          else if (comp2.includes(qLower)) score += 500;
          // small boosts if name also matches
          if (name.includes(qLower)) score += 50;
        } else {
          // all signals
          if (name.startsWith(qLower)) score += 1000;
          else if (name.includes(qLower)) score += 700;
          if (comp1.startsWith(qLower)) score += 500;
          else if (comp1.includes(qLower)) score += 300;
          if (comp2.startsWith(qLower)) score += 200;
          else if (comp2.includes(qLower)) score += 120;
          if (manu.startsWith(qLower)) score += 90;
          else if (manu.includes(qLower)) score += 50;
          if (cat.startsWith(qLower)) score += 40;
          else if (cat.includes(qLower)) score += 20;
        }

        return score;
      };

      const ranked = candidates
        .map((d) => ({ d, s: scoreOf(d) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => {
          if (b.s !== a.s) return b.s - a.s;
          const an = (a.d.name || '').toLowerCase();
          const bn = (b.d.name || '').toLowerCase();
          return an.localeCompare(bn);
        })
        .slice(0, limit)
        .map((x) => x.d);

      return ranked;
    } catch (error) {
      throw new Error(`Failed to autocomplete drugs: ${error.message}`);
    }
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

      const now = new Date();
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
              currentStock: true,
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
          const usableBatches = drug.inventoryItems
            .filter(
              (batch) =>
                batch.stockStatus !== 'EXPIRED' &&
                (!batch.expiryDate || batch.expiryDate >= now),
            )
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
            (sum, batch) => sum + batch.currentStock,
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

  private async applyApprovedStockChange(
    tx: Prisma.TransactionClient,
    request: {
      id: string;
      drugId: string;
      inventoryItemId: string | null;
      proposedStock: number | null;
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
      select: {
        id: true,
        currentStock: true,
        costPrice: true,
        reorderLevel: true,
        minStockLevel: true,
        expiryDate: true,
        updatedAt: true,
      },
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

    const currentTotalStock = inventoryItems.reduce(
      (sum, item) => sum + Number(item.currentStock || 0),
      0,
    );
    const stockDelta = request.proposedStock - currentTotalStock;

    if (stockDelta === 0) {
      return;
    }

    const newTargetStock = Number(targetItem.currentStock || 0) + stockDelta;
    if (newTargetStock < 0) {
      throw new BadRequestException(
        `Cannot set total stock for ${request.drug.name} to ${request.proposedStock}; other linked batches already exceed that value.`,
      );
    }

    await tx.inventoryItem.update({
      where: { id: targetItem.id },
      data: {
        currentStock: newTargetStock,
        stockStatus: this.deriveStockStatus({
          currentStock: newTargetStock,
          reorderLevel: targetItem.reorderLevel,
          minStockLevel: targetItem.minStockLevel,
          expiryDate: targetItem.expiryDate,
        }),
      },
    });

    await tx.stockTransaction.create({
      data: {
        itemId: targetItem.id,
        branchId,
        userId: reviewedById,
        type: TransactionType.ADJUSTMENT,
        quantity: Math.abs(stockDelta),
        unitPrice: Number(targetItem.costPrice || 0),
        totalAmount: Math.abs(stockDelta) * Number(targetItem.costPrice || 0),
        reason: 'Doctor-approved inventory update',
        notes: `Inventory change request ${request.id}`,
      },
    });
  }

  private deriveStockStatus(input: {
    currentStock: number;
    reorderLevel?: number | null;
    minStockLevel?: number | null;
    expiryDate?: Date | null;
  }) {
    if (input.expiryDate && input.expiryDate < new Date()) {
      return StockStatus.EXPIRED;
    }
    if (input.currentStock <= 0) {
      return StockStatus.OUT_OF_STOCK;
    }
    const lowStockThreshold = input.reorderLevel ?? input.minStockLevel;
    if (lowStockThreshold && input.currentStock <= lowStockThreshold) {
      return StockStatus.LOW_STOCK;
    }
    return StockStatus.IN_STOCK;
  }

  private assertProductMasterComplete(
    input: Partial<CreateDrugDto & UpdateDrugDto>,
    existing?: {
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

    const requiredFields: Array<[keyof typeof candidate, string]> = [
      ['composition1', 'Generic/Salt or primary composition'],
      ['category', 'Therapeutic category'],
      ['dosageForm', 'Dosage form'],
      ['strength', 'Strength'],
    ];

    const missing = requiredFields
      .filter(([field]) => {
        const value = candidate[field];
        return typeof value !== 'string' || value.trim().length === 0;
      })
      .map(([, label]) => label);

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
