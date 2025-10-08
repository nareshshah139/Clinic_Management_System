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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import { UserRole } from '@prisma/client';
import { DrugService } from './drug.service';
import { CreateDrugDto, UpdateDrugDto, QueryDrugDto, DrugAutocompleteDto } from './dto/drug.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

@ApiTags('Drugs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('drugs')
export class DrugController {
  constructor(private readonly drugService: DrugService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Create a new drug' })
  @ApiResponse({ status: 201, description: 'Drug created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Drug with barcode/SKU already exists' })
  async create(@Body() createDrugDto: CreateDrugDto, @Request() req: any) {
    return this.drugService.create(createDrugDto, req.user.branchId);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR)
  @Permissions('pharmacy:drug:read')
  @ApiOperation({ summary: 'Get all drugs with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Drugs retrieved successfully' })
  async findAll(@Query() query: QueryDrugDto, @Request() req: any) {
    return this.drugService.findAll(query, req.user.branchId);
  }

  @Get('autocomplete')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR)
  @Permissions('pharmacy:drug:autocomplete')
  @ApiOperation({ summary: 'Autocomplete drugs for search' })
  @ApiResponse({ status: 200, description: 'Autocomplete results retrieved successfully' })
  async autocomplete(@Query() query: DrugAutocompleteDto, @Request() req: any) {
    return this.drugService.autocomplete(query, req.user.branchId);
  }

  @Get('categories')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR)
  @Permissions('pharmacy:drug:categories')
  @ApiOperation({ summary: 'Get all drug categories' })
  @ApiResponse({ status: 200, description: 'Categories retrieved successfully' })
  async getCategories(@Request() req: any) {
    return this.drugService.getCategories(req.user.branchId);
  }

  @Get('manufacturers')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR)
  @Permissions('pharmacy:drug:manufacturers')
  @ApiOperation({ summary: 'Get all drug manufacturers' })
  @ApiResponse({ status: 200, description: 'Manufacturers retrieved successfully' })
  async getManufacturers(@Request() req: any) {
    return this.drugService.getManufacturers(req.user.branchId);
  }

  @Get('dosage-forms')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR)
  @Permissions('pharmacy:drug:dosageForms')
  @ApiOperation({ summary: 'Get all dosage forms' })
  @ApiResponse({ status: 200, description: 'Dosage forms retrieved successfully' })
  async getDosageForms(@Request() req: any) {
    return this.drugService.getDosageForms(req.user.branchId);
  }

  @Get('statistics')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('pharmacy:drug:statistics')
  @ApiOperation({ summary: 'Get drug statistics and analytics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStatistics(@Request() req: any) {
    return this.drugService.getStatistics(req.user.branchId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR)
  @Permissions('pharmacy:drug:read')
  @ApiOperation({ summary: 'Get a drug by ID' })
  @ApiResponse({ status: 200, description: 'Drug retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Drug not found' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.drugService.findOne(id, req.user.branchId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('pharmacy:drug:update')
  @ApiOperation({ summary: 'Update a drug' })
  @ApiResponse({ status: 200, description: 'Drug updated successfully' })
  @ApiResponse({ status: 404, description: 'Drug not found' })
  @ApiResponse({ status: 409, description: 'Drug with barcode/SKU already exists' })
  async update(
    @Param('id') id: string,
    @Body() updateDrugDto: UpdateDrugDto,
    @Request() req: any,
  ) {
    return this.drugService.update(id, updateDrugDto, req.user.branchId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('pharmacy:drug:delete')
  @ApiOperation({ summary: 'Delete a drug' })
  @ApiResponse({ status: 200, description: 'Drug deleted successfully' })
  @ApiResponse({ status: 404, description: 'Drug not found' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.drugService.remove(id, req.user.branchId);
  }
} 