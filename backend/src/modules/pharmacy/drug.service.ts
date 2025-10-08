import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { CreateDrugDto, UpdateDrugDto, QueryDrugDto, DrugAutocompleteDto } from './dto/drug.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class DrugService {
  constructor(private prisma: PrismaService) {}

  async create(createDrugDto: CreateDrugDto, branchId: string) {
    try {
      // Duplicate checks: barcode/SKU, and soft match by name+manufacturer in same branch
      const dup = await this.prisma.drug.findFirst({
        where: {
          branchId,
          OR: [
            createDrugDto.barcode ? { barcode: createDrugDto.barcode } : undefined,
            createDrugDto.sku ? { sku: createDrugDto.sku } : undefined,
            {
              AND: [
                { name: { equals: createDrugDto.name, mode: 'insensitive' } },
                { manufacturerName: { equals: createDrugDto.manufacturerName, mode: 'insensitive' } },
              ],
            },
          ].filter(Boolean) as any,
        },
      });

      if (dup) {
        if (createDrugDto.barcode && dup.barcode === createDrugDto.barcode) {
          throw new ConflictException('A drug with this barcode already exists');
        }
        if (createDrugDto.sku && dup.sku === createDrugDto.sku) {
          throw new ConflictException('A drug with this SKU already exists');
        }
        // Same name+manufacturer — treat as duplicate
        throw new ConflictException('A drug with the same name and manufacturer already exists');
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
      if (error instanceof ConflictException) {
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

    // Add search conditions
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { manufacturerName: { contains: search, mode: 'insensitive' } },
        { composition1: { contains: search, mode: 'insensitive' } },
        { composition2: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
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

    // Build order clause
    const orderBy: Prisma.DrugOrderByWithRelationInput = {};
    orderBy[sortBy] = sortOrder;

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
          },
        }),
        this.prisma.drug.count({ where }),
      ]);

      return {
        data: drugs,
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
              location: true,
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

  async update(id: string, updateDrugDto: UpdateDrugDto, branchId: string) {
    try {
      // Check if drug exists
      const existingDrug = await this.prisma.drug.findFirst({
        where: { id, branchId },
      });

      if (!existingDrug) {
        throw new NotFoundException('Drug not found');
      }

      // Check for duplicate barcode or SKU (excluding current drug)
      if (updateDrugDto.barcode || updateDrugDto.sku) {
        const duplicateDrug = await this.prisma.drug.findFirst({
          where: {
            id: { not: id },
            OR: [
              updateDrugDto.barcode ? { barcode: updateDrugDto.barcode } : {},
              updateDrugDto.sku ? { sku: updateDrugDto.sku } : {},
            ].filter(condition => Object.keys(condition).length > 0),
          },
        });

        if (duplicateDrug) {
          if (duplicateDrug.barcode === updateDrugDto.barcode) {
            throw new ConflictException('A drug with this barcode already exists');
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
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      throw new Error(`Failed to update drug: ${error.message}`);
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

  async autocomplete(query: DrugAutocompleteDto, branchId: string) {
    // Handle limit conversion manually since DTO transformation may not work reliably
    let limit = 10; // default
    if ((query as any).limit !== undefined) {
      if (typeof (query as any).limit === 'string') {
        const num = parseInt((query as any).limit, 10);
        if (!isNaN(num) && num >= 1 && num <= 50) {
          limit = num;
        }
      } else if (typeof (query as any).limit === 'number' && (query as any).limit >= 1 && (query as any).limit <= 50) {
        limit = (query as any).limit;
      }
    }

    const rawQ = ((query as any).q as string | undefined) || '';
    const q = rawQ.trim();
    const mode = (((query as any).mode as string | undefined) || 'all').toLowerCase();

    try {
      const where: Prisma.DrugWhereInput = {
        branchId,
        isActive: true,
        isDiscontinued: false,
      };

      if (q) {
        if (mode === 'name') {
          where.OR = [
            { name: { contains: q, mode: 'insensitive' } },
          ];
        } else if (mode === 'ingredient') {
          where.OR = [
            { composition1: { contains: q, mode: 'insensitive' } },
            { composition2: { contains: q, mode: 'insensitive' } },
          ];
        } else {
          where.OR = [
            { name: { contains: q, mode: 'insensitive' } },
            { manufacturerName: { contains: q, mode: 'insensitive' } },
            { composition1: { contains: q, mode: 'insensitive' } },
            { composition2: { contains: q, mode: 'insensitive' } },
            { category: { contains: q, mode: 'insensitive' } },
          ];
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
      const scoreOf = (drug: { name?: string | null; composition1?: string | null; composition2?: string | null; manufacturerName?: string | null; category?: string | null; }) => {
        let score = 0;
        const name = (drug.name || '').toLowerCase();
        const comp1 = (drug.composition1 || '').toLowerCase();
        const comp2 = (drug.composition2 || '').toLowerCase();
        const manu = (drug.manufacturerName || '').toLowerCase();
        const cat = (drug.category || '').toLowerCase();

        if (mode === 'name') {
          if (name.startsWith(qLower)) score += 1000; else if (name.includes(qLower)) score += 700;
          // small boosts if ingredient also matches
          if (comp1.includes(qLower)) score += 50;
          if (comp2.includes(qLower)) score += 25;
        } else if (mode === 'ingredient') {
          if (comp1.startsWith(qLower)) score += 1000; else if (comp1.includes(qLower)) score += 700;
          if (comp2.startsWith(qLower)) score += 800; else if (comp2.includes(qLower)) score += 500;
          // small boosts if name also matches
          if (name.includes(qLower)) score += 50;
        } else {
          // all signals
          if (name.startsWith(qLower)) score += 1000; else if (name.includes(qLower)) score += 700;
          if (comp1.startsWith(qLower)) score += 500; else if (comp1.includes(qLower)) score += 300;
          if (comp2.startsWith(qLower)) score += 200; else if (comp2.includes(qLower)) score += 120;
          if (manu.startsWith(qLower)) score += 90; else if (manu.includes(qLower)) score += 50;
          if (cat.startsWith(qLower)) score += 40; else if (cat.includes(qLower)) score += 20;
        }

        return score;
      };

      const ranked = candidates
        .map(d => ({ d, s: scoreOf(d) }))
        .filter(x => x.s > 0)
        .sort((a, b) => {
          if (b.s !== a.s) return b.s - a.s;
          const an = (a.d.name || '').toLowerCase();
          const bn = (b.d.name || '').toLowerCase();
          return an.localeCompare(bn);
        })
        .slice(0, limit)
        .map(x => x.d);

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
        .map(item => item.category)
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
        .map(item => item.manufacturerName)
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
        .map(item => item.dosageForm)
        .filter(Boolean)
        .sort();
    } catch (error) {
      throw new Error(`Failed to fetch dosage forms: ${error.message}`);
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
                currentStock: { lte: this.prisma.drug.fields.minStockLevel }
              }
            }
          } 
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
        topCategories: topCategories.map(item => ({
          category: item.category,
          count: item._count.category,
        })),
        topManufacturers: topManufacturers.map(item => ({
          manufacturer: item.manufacturerName,
          count: item._count.manufacturerName,
        })),
        recentlyAdded,
      };
    } catch (error) {
      throw new Error(`Failed to fetch drug statistics: ${error.message}`);
    }
  }
} 