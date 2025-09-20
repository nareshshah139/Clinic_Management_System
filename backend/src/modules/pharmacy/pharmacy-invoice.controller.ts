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
import { PharmacyInvoiceService } from './pharmacy-invoice.service';
import { 
  CreatePharmacyInvoiceDto, 
  UpdatePharmacyInvoiceDto, 
  QueryPharmacyInvoiceDto,
  PharmacyPaymentDto 
} from './dto/pharmacy-invoice.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

@ApiTags('Pharmacy Invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pharmacy/invoices')
export class PharmacyInvoiceController {
  constructor(private readonly pharmacyInvoiceService: PharmacyInvoiceService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new pharmacy invoice' })
  @ApiResponse({ status: 201, description: 'Invoice created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid invoice data' })
  @ApiResponse({ status: 404, description: 'Patient or doctor not found' })
  async create(@Body() createInvoiceDto: CreatePharmacyInvoiceDto, @Request() req: any) {
    return this.pharmacyInvoiceService.create(createInvoiceDto, req.user.branchId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all pharmacy invoices with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Invoices retrieved successfully' })
  async findAll(@Query() query: QueryPharmacyInvoiceDto, @Request() req: any) {
    return this.pharmacyInvoiceService.findAll(query, req.user.branchId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific pharmacy invoice by ID' })
  @ApiResponse({ status: 200, description: 'Invoice retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.pharmacyInvoiceService.findOne(id, req.user.branchId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a pharmacy invoice' })
  @ApiResponse({ status: 200, description: 'Invoice updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid update data or invoice not in draft status' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async update(
    @Param('id') id: string,
    @Body() updateInvoiceDto: UpdatePharmacyInvoiceDto,
    @Request() req: any,
  ) {
    return this.pharmacyInvoiceService.update(id, updateInvoiceDto, req.user.branchId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a pharmacy invoice' })
  @ApiResponse({ status: 200, description: 'Invoice deleted successfully' })
  @ApiResponse({ status: 400, description: 'Invoice not in draft status' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.pharmacyInvoiceService.remove(id, req.user.branchId);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Add a payment to an invoice' })
  @ApiResponse({ status: 201, description: 'Payment added successfully' })
  @ApiResponse({ status: 400, description: 'Invalid payment amount' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async addPayment(
    @Param('id') id: string,
    @Body() paymentDto: PharmacyPaymentDto,
    @Request() req: any,
  ) {
    return this.pharmacyInvoiceService.addPayment(id, paymentDto, req.user.branchId);
  }
} 