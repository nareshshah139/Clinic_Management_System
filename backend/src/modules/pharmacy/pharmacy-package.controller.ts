import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  HttpStatus,
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth,
  ApiParam,
  ApiQuery
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { PharmacyPackageService } from './pharmacy-package.service';
import {
  CreatePharmacyPackageDto,
  UpdatePharmacyPackageDto,
  QueryPharmacyPackageDto,
  PharmacyPackageResponseDto,
  PharmacyPackageListResponseDto,
  PharmacyPackageCategory,
  PharmacyPackageSubcategory
} from './dto/pharmacy-package.dto';

@ApiTags('Pharmacy Packages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pharmacy/packages')
export class PharmacyPackageController {
  constructor(private readonly pharmacyPackageService: PharmacyPackageService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new pharmacy package' })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Package created successfully',
    type: PharmacyPackageResponseDto
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid input data' 
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'Unauthorized' 
  })
  async create(
    @Body() createPackageDto: CreatePharmacyPackageDto,
    @Request() req: any
  ): Promise<PharmacyPackageResponseDto> {
    const { branchId, userId } = req.user;
    return this.pharmacyPackageService.create(createPackageDto, branchId, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all pharmacy packages' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Packages retrieved successfully',
    type: PharmacyPackageListResponseDto
  })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name, description, or indications' })
  @ApiQuery({ name: 'category', required: false, enum: PharmacyPackageCategory, description: 'Filter by category' })
  @ApiQuery({ name: 'subcategory', required: false, enum: PharmacyPackageSubcategory, description: 'Filter by subcategory' })
  @ApiQuery({ name: 'createdBy', required: false, description: 'Filter by creator (doctor ID)' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status' })
  @ApiQuery({ name: 'isPublic', required: false, type: Boolean, description: 'Filter by public status' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort by field (default: createdAt)' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], description: 'Sort order (default: desc)' })
  async findAll(
    @Query() query: QueryPharmacyPackageDto,
    @Request() req: any
  ): Promise<PharmacyPackageListResponseDto> {
    const { branchId, userId } = req.user;
    return this.pharmacyPackageService.findAll(query, branchId, userId);
  }

  @Get('category/:category')
  @ApiOperation({ summary: 'Get packages by category' })
  @ApiParam({ name: 'category', description: 'Package category', example: 'Dermatology' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Packages retrieved successfully',
    type: [PharmacyPackageResponseDto]
  })
  async getPackagesByCategory(
    @Param('category') category: string,
    @Request() req: any
  ): Promise<PharmacyPackageResponseDto[]> {
    const { branchId, userId } = req.user;
    return this.pharmacyPackageService.getPackagesByCategory(category, branchId, userId);
  }

  @Get('dermatology')
  @ApiOperation({ summary: 'Get all dermatology packages (convenience endpoint)' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Dermatology packages retrieved successfully',
    type: [PharmacyPackageResponseDto]
  })
  async getDermatologyPackages(
    @Request() req: any
  ): Promise<PharmacyPackageResponseDto[]> {
    const { branchId, userId } = req.user;
    return this.pharmacyPackageService.getPackagesByCategory('Dermatology', branchId, userId);
  }

  @Get('my-packages')
  @ApiOperation({ summary: 'Get packages created by the current user' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'User packages retrieved successfully',
    type: PharmacyPackageListResponseDto
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  async getMyPackages(
    @Query() query: QueryPharmacyPackageDto,
    @Request() req: any
  ): Promise<PharmacyPackageListResponseDto> {
    const { branchId, userId } = req.user;
    const searchQuery = { ...query, createdBy: userId };
    return this.pharmacyPackageService.findAll(searchQuery, branchId, userId);
  }

  @Get('public')
  @ApiOperation({ summary: 'Get all public packages' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Public packages retrieved successfully',
    type: PharmacyPackageListResponseDto
  })
  @ApiQuery({ name: 'category', required: false, enum: PharmacyPackageCategory, description: 'Filter by category' })
  @ApiQuery({ name: 'subcategory', required: false, enum: PharmacyPackageSubcategory, description: 'Filter by subcategory' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  async getPublicPackages(
    @Query() query: QueryPharmacyPackageDto,
    @Request() req: any
  ): Promise<PharmacyPackageListResponseDto> {
    const { branchId } = req.user;
    const searchQuery = { ...query, isPublic: true };
    return this.pharmacyPackageService.findAll(searchQuery, branchId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a pharmacy package by ID' })
  @ApiParam({ name: 'id', description: 'Package ID' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Package retrieved successfully',
    type: PharmacyPackageResponseDto
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Package not found' 
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Access denied to private package' 
  })
  async findOne(
    @Param('id') id: string,
    @Request() req: any
  ): Promise<PharmacyPackageResponseDto> {
    const { branchId, userId } = req.user;
    return this.pharmacyPackageService.findOne(id, branchId, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a pharmacy package' })
  @ApiParam({ name: 'id', description: 'Package ID' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Package updated successfully',
    type: PharmacyPackageResponseDto
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Package not found or no permission to update' 
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid input data' 
  })
  async update(
    @Param('id') id: string,
    @Body() updatePackageDto: UpdatePharmacyPackageDto,
    @Request() req: any
  ): Promise<PharmacyPackageResponseDto> {
    const { branchId, userId } = req.user;
    return this.pharmacyPackageService.update(id, updatePackageDto, branchId, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a pharmacy package (soft delete)' })
  @ApiParam({ name: 'id', description: 'Package ID' })
  @ApiResponse({ 
    status: HttpStatus.NO_CONTENT, 
    description: 'Package deleted successfully' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Package not found or no permission to delete' 
  })
  async remove(
    @Param('id') id: string,
    @Request() req: any
  ): Promise<void> {
    const { branchId, userId } = req.user;
    return this.pharmacyPackageService.remove(id, branchId, userId);
  }

  // Additional endpoints for specific dermatology subcategories
  @Get('dermatology/acne')
  @ApiOperation({ summary: 'Get acne treatment packages' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Acne treatment packages retrieved successfully',
    type: [PharmacyPackageResponseDto]
  })
  async getAcnePackages(
    @Request() req: any
  ): Promise<PharmacyPackageResponseDto[]> {
    const { branchId, userId } = req.user;
    const query: QueryPharmacyPackageDto = {
      category: PharmacyPackageCategory.DERMATOLOGY,
      subcategory: PharmacyPackageSubcategory.ACNE_TREATMENT
    };
    const result = await this.pharmacyPackageService.findAll(query, branchId, userId);
    return result.packages;
  }

  @Get('dermatology/anti-aging')
  @ApiOperation({ summary: 'Get anti-aging packages' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Anti-aging packages retrieved successfully',
    type: [PharmacyPackageResponseDto]
  })
  async getAntiAgingPackages(
    @Request() req: any
  ): Promise<PharmacyPackageResponseDto[]> {
    const { branchId, userId } = req.user;
    const query: QueryPharmacyPackageDto = {
      category: PharmacyPackageCategory.DERMATOLOGY,
      subcategory: PharmacyPackageSubcategory.ANTI_AGING
    };
    const result = await this.pharmacyPackageService.findAll(query, branchId, userId);
    return result.packages;
  }

  @Get('dermatology/hair-care')
  @ApiOperation({ summary: 'Get hair care packages' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Hair care packages retrieved successfully',
    type: [PharmacyPackageResponseDto]
  })
  async getHairCarePackages(
    @Request() req: any
  ): Promise<PharmacyPackageResponseDto[]> {
    const { branchId, userId } = req.user;
    const query: QueryPharmacyPackageDto = {
      category: PharmacyPackageCategory.DERMATOLOGY,
      subcategory: PharmacyPackageSubcategory.HAIR_CARE
    };
    const result = await this.pharmacyPackageService.findAll(query, branchId, userId);
    return result.packages;
  }

  @Get('dermatology/pigmentation')
  @ApiOperation({ summary: 'Get pigmentation treatment packages' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Pigmentation packages retrieved successfully',
    type: [PharmacyPackageResponseDto]
  })
  async getPigmentationPackages(
    @Request() req: any
  ): Promise<PharmacyPackageResponseDto[]> {
    const { branchId, userId } = req.user;
    const query: QueryPharmacyPackageDto = {
      category: PharmacyPackageCategory.DERMATOLOGY,
      subcategory: PharmacyPackageSubcategory.PIGMENTATION
    };
    const result = await this.pharmacyPackageService.findAll(query, branchId, userId);
    return result.packages;
  }
} 