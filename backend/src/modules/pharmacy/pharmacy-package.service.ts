import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { 
  CreatePharmacyPackageDto,
  UpdatePharmacyPackageDto,
  QueryPharmacyPackageDto,
  PharmacyPackageResponseDto,
  PharmacyPackageListResponseDto
} from './dto/pharmacy-package.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PharmacyPackageService {
  constructor(private prisma: PrismaService) {}

  async create(
    createPackageDto: CreatePharmacyPackageDto, 
    branchId: string, 
    createdBy: string
  ): Promise<PharmacyPackageResponseDto> {
    try {
      // Validate that all drugs exist and belong to the branch
      const drugIds = createPackageDto.items.map(item => item.drugId);
      const drugs = await this.prisma.drug.findMany({
        where: {
          id: { in: drugIds },
          branchId,
          isActive: true
        }
      });

      if (drugs.length !== drugIds.length) {
        throw new BadRequestException('One or more drugs not found or inactive');
      }

      // Calculate original price (sum of individual drug prices * quantities)
      const originalPrice = createPackageDto.items.reduce((total, item) => {
        const drug = drugs.find(d => d.id === item.drugId);
        return total + (drug ? drug.price * item.quantity : 0);
      }, 0);

      // Calculate discount percentage if not provided
      let discountPercent = createPackageDto.discountPercent || 0;
      if (discountPercent === 0 && originalPrice > createPackageDto.packagePrice) {
        discountPercent = ((originalPrice - createPackageDto.packagePrice) / originalPrice) * 100;
      }

      return await this.prisma.$transaction(async (prisma) => {
        // Create the package
        const package_ = await prisma.pharmacyPackage.create({
          data: {
            name: createPackageDto.name,
            description: createPackageDto.description,
            category: createPackageDto.category || 'Dermatology',
            subcategory: createPackageDto.subcategory,
            originalPrice,
            packagePrice: createPackageDto.packagePrice,
            discountPercent,
            duration: createPackageDto.duration,
            instructions: createPackageDto.instructions,
            indications: createPackageDto.indications,
            contraindications: createPackageDto.contraindications,
            createdBy,
            isPublic: createPackageDto.isPublic || false,
            branchId,
          },
          include: {
            creator: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                department: true,
              }
            }
          }
        });

        // Create package items
        const packageItems = await Promise.all(
          createPackageDto.items.map((item, index) => 
            prisma.pharmacyPackageItem.create({
              data: {
                packageId: package_.id,
                drugId: item.drugId,
                quantity: item.quantity,
                dosage: item.dosage,
                frequency: item.frequency,
                duration: item.duration,
                instructions: item.instructions,
                sequence: item.sequence || index + 1,
              },
              include: {
                drug: {
                  select: {
                    id: true,
                    name: true,
                    price: true,
                    manufacturerName: true,
                    packSizeLabel: true,
                    category: true,
                    dosageForm: true,
                    strength: true,
                  }
                }
              }
            })
          )
        );

        // Ensure inventory has at least 10x the amount of each package item
        for (const pkgItem of packageItems) {
          const targetQty = (pkgItem.quantity || 1) * 10;
          let invItem = await prisma.inventoryItem.findFirst({ where: { branchId, name: pkgItem.drug.name } });
          if (!invItem) {
            invItem = await prisma.inventoryItem.create({
              data: {
                branchId,
                name: pkgItem.drug.name,
                description: `Inventory for ${pkgItem.drug.name}`,
                type: 'MEDICINE',
                category: pkgItem.drug.category || 'Dermatology',
                manufacturer: pkgItem.drug.manufacturerName,
                costPrice: pkgItem.drug.price * 0.7,
                sellingPrice: pkgItem.drug.price,
                unit: 'PIECES',
                packSize: 1,
                currentStock: 0,
                status: 'ACTIVE',
                stockStatus: 'OUT_OF_STOCK',
              },
            });
          }
          if (invItem.currentStock < targetQty) {
            const diff = targetQty - invItem.currentStock;
            await prisma.stockTransaction.create({
              data: {
                itemId: invItem.id,
                type: 'PURCHASE',
                quantity: diff,
                unitPrice: invItem.costPrice,
                totalAmount: invItem.costPrice * diff,
                reason: `Auto top-up for package ${package_.name}`,
                branchId,
                userId: createdBy || 'system',
              },
            });
          }
        }

        return this.formatPackageResponse(package_, packageItems);
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to create pharmacy package');
    }
  }

  async findAll(
    query: QueryPharmacyPackageDto, 
    branchId: string, 
    userId?: string
  ): Promise<PharmacyPackageListResponseDto> {
    try {
      const page = query.page || 1;
      const limit = query.limit || 20;
      const skip = (page - 1) * limit;

      // Build where clause
      const where: Prisma.PharmacyPackageWhereInput = {
        branchId,
        isActive: query.isActive !== false, // Default to true unless explicitly false
      };

      // Search by name
      if (query.search) {
        where.OR = [
          { name: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { indications: { contains: query.search, mode: 'insensitive' } }
        ];
      }

      // Filter by category and subcategory
      if (query.category) {
        where.category = query.category;
      }
      if (query.subcategory) {
        where.subcategory = query.subcategory;
      }

      // Filter by creator or public packages
      if (query.createdBy) {
        where.createdBy = query.createdBy;
      } else if (userId) {
        // Show packages created by the user or public packages
        where.OR = [
          { createdBy: userId },
          { isPublic: true }
        ];
      } else if (query.isPublic !== undefined) {
        where.isPublic = query.isPublic;
      }

      // Build orderBy clause
      const orderBy: Prisma.PharmacyPackageOrderByWithRelationInput = {};
      if (query.sortBy) {
        orderBy[query.sortBy as keyof Prisma.PharmacyPackageOrderByWithRelationInput] = query.sortOrder || 'asc';
      } else {
        orderBy.createdAt = 'desc';
      }

      const [packages, total] = await Promise.all([
        this.prisma.pharmacyPackage.findMany({
          where,
          include: {
            creator: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                department: true,
              }
            },
            items: {
              include: {
                drug: {
                  select: {
                    id: true,
                    name: true,
                    price: true,
                    manufacturerName: true,
                    packSizeLabel: true,
                    category: true,
                    dosageForm: true,
                    strength: true,
                  }
                }
              },
              orderBy: { sequence: 'asc' }
            }
          },
          skip,
          take: limit,
          orderBy,
        }),
        this.prisma.pharmacyPackage.count({ where }),
      ]);

      const formattedPackages = packages.map(pkg => 
        this.formatPackageResponse(pkg, pkg.items)
      );

      return {
        packages: formattedPackages,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw new BadRequestException('Failed to fetch pharmacy packages');
    }
  }

  async findOne(id: string, branchId: string, userId?: string): Promise<PharmacyPackageResponseDto> {
    try {
      const package_ = await this.prisma.pharmacyPackage.findFirst({
        where: {
          id,
          branchId,
          isActive: true,
        },
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: true,
            }
          },
          items: {
            include: {
              drug: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  manufacturerName: true,
                  packSizeLabel: true,
                  category: true,
                  dosageForm: true,
                  strength: true,
                }
              }
            },
            orderBy: { sequence: 'asc' }
          }
        }
      });

      if (!package_) {
        throw new NotFoundException('Pharmacy package not found');
      }

      // Check if user has access to this package
      if (userId && !package_.isPublic && package_.createdBy !== userId) {
        throw new ForbiddenException('You do not have access to this package');
      }

      return this.formatPackageResponse(package_, package_.items);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException('Failed to fetch pharmacy package');
    }
  }

  async update(
    id: string, 
    updatePackageDto: UpdatePharmacyPackageDto, 
    branchId: string, 
    userId: string
  ): Promise<PharmacyPackageResponseDto> {
    try {
      // Check if package exists and user has permission to update
      const existingPackage = await this.prisma.pharmacyPackage.findFirst({
        where: {
          id,
          branchId,
          createdBy: userId, // Only creator can update
        }
      });

      if (!existingPackage) {
        throw new NotFoundException('Pharmacy package not found or you do not have permission to update it');
      }

      let originalPrice = existingPackage.originalPrice;
      let discountPercent = updatePackageDto.discountPercent;

      // If items are being updated, recalculate prices
      if (updatePackageDto.items) {
        const drugIds = updatePackageDto.items.map(item => item.drugId);
        const drugs = await this.prisma.drug.findMany({
          where: {
            id: { in: drugIds },
            branchId,
            isActive: true
          }
        });

        if (drugs.length !== drugIds.length) {
          throw new BadRequestException('One or more drugs not found or inactive');
        }

        originalPrice = updatePackageDto.items.reduce((total, item) => {
          const drug = drugs.find(d => d.id === item.drugId);
          return total + (drug ? drug.price * item.quantity : 0);
        }, 0);

        // Recalculate discount if package price is provided
        if (updatePackageDto.packagePrice && !discountPercent) {
          discountPercent = ((originalPrice - updatePackageDto.packagePrice) / originalPrice) * 100;
        }
      }

      return await this.prisma.$transaction(async (prisma) => {
        // Update package
        const updatedPackage = await prisma.pharmacyPackage.update({
          where: { id },
          data: {
            name: updatePackageDto.name,
            description: updatePackageDto.description,
            category: updatePackageDto.category,
            subcategory: updatePackageDto.subcategory,
            originalPrice,
            packagePrice: updatePackageDto.packagePrice,
            discountPercent,
            duration: updatePackageDto.duration,
            instructions: updatePackageDto.instructions,
            indications: updatePackageDto.indications,
            contraindications: updatePackageDto.contraindications,
            isActive: updatePackageDto.isActive,
            isPublic: updatePackageDto.isPublic,
          },
          include: {
            creator: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                department: true,
              }
            }
          }
        });

        let packageItems = [];

        // Update items if provided
        if (updatePackageDto.items) {
          // Delete existing items
          await prisma.pharmacyPackageItem.deleteMany({
            where: { packageId: id }
          });

          // Create new items
          packageItems = await Promise.all(
            updatePackageDto.items.map((item, index) => 
              prisma.pharmacyPackageItem.create({
                data: {
                  packageId: id,
                  drugId: item.drugId,
                  quantity: item.quantity,
                  dosage: item.dosage,
                  frequency: item.frequency,
                  duration: item.duration,
                  instructions: item.instructions,
                  sequence: item.sequence || index + 1,
                },
                include: {
                  drug: {
                    select: {
                      id: true,
                      name: true,
                      price: true,
                      manufacturerName: true,
                      packSizeLabel: true,
                      category: true,
                      dosageForm: true,
                      strength: true,
                    }
                  }
                }
              })
            )
          );
        } else {
          // Fetch existing items
          packageItems = await prisma.pharmacyPackageItem.findMany({
            where: { packageId: id },
            include: {
              drug: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  manufacturerName: true,
                  packSizeLabel: true,
                  category: true,
                  dosageForm: true,
                  strength: true,
                }
              }
            },
            orderBy: { sequence: 'asc' }
          });
        }

        return this.formatPackageResponse(updatedPackage, packageItems);
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to update pharmacy package');
    }
  }

  async remove(id: string, branchId: string, userId: string): Promise<void> {
    try {
      const package_ = await this.prisma.pharmacyPackage.findFirst({
        where: {
          id,
          branchId,
          createdBy: userId, // Only creator can delete
        }
      });

      if (!package_) {
        throw new NotFoundException('Pharmacy package not found or you do not have permission to delete it');
      }

      // Soft delete by setting isActive to false
      await this.prisma.pharmacyPackage.update({
        where: { id },
        data: { isActive: false }
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to delete pharmacy package');
    }
  }

  // Get packages by category (for quick access)
  async getPackagesByCategory(
    category: string, 
    branchId: string, 
    userId?: string
  ): Promise<PharmacyPackageResponseDto[]> {
    try {
      const where: Prisma.PharmacyPackageWhereInput = {
        branchId,
        category,
        isActive: true,
      };

      if (userId) {
        where.OR = [
          { createdBy: userId },
          { isPublic: true }
        ];
      } else {
        where.isPublic = true;
      }

      const packages = await this.prisma.pharmacyPackage.findMany({
        where,
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: true,
            }
          },
          items: {
            include: {
              drug: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  manufacturerName: true,
                  packSizeLabel: true,
                  category: true,
                  dosageForm: true,
                  strength: true,
                }
              }
            },
            orderBy: { sequence: 'asc' }
          }
        },
        orderBy: { name: 'asc' }
      });

      return packages.map(pkg => this.formatPackageResponse(pkg, pkg.items));
    } catch (error) {
      throw new BadRequestException('Failed to fetch packages by category');
    }
  }

  private formatPackageResponse(package_: any, items: any[]): PharmacyPackageResponseDto {
    return {
      id: package_.id,
      name: package_.name,
      description: package_.description,
      category: package_.category,
      subcategory: package_.subcategory,
      originalPrice: package_.originalPrice,
      packagePrice: package_.packagePrice,
      discountPercent: package_.discountPercent,
      duration: package_.duration,
      instructions: package_.instructions,
      indications: package_.indications,
      contraindications: package_.contraindications,
      createdBy: package_.createdBy,
      isActive: package_.isActive,
      isPublic: package_.isPublic,
      branchId: package_.branchId,
      createdAt: package_.createdAt.toISOString(),
      updatedAt: package_.updatedAt.toISOString(),
      creator: package_.creator ? {
        id: package_.creator.id,
        firstName: package_.creator.firstName,
        lastName: package_.creator.lastName,
        department: package_.creator.department,
      } : undefined,
      items: items.map(item => ({
        id: item.id,
        drugId: item.drugId,
        quantity: item.quantity,
        dosage: item.dosage,
        frequency: item.frequency,
        duration: item.duration,
        instructions: item.instructions,
        sequence: item.sequence,
        drug: {
          id: item.drug.id,
          name: item.drug.name,
          price: item.drug.price,
          manufacturerName: item.drug.manufacturerName,
          packSizeLabel: item.drug.packSizeLabel,
          category: item.drug.category,
          dosageForm: item.drug.dosageForm,
          strength: item.drug.strength,
        }
      }))
    };
  }
} 