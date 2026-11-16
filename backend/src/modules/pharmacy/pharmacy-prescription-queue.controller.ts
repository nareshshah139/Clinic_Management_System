import { Permissions } from '../../shared/decorators/permissions.decorator';
import { IsInt, IsString, Min, MaxLength } from 'class-validator';

class LinkPrescriptionInventoryDto {
  @IsString() @MaxLength(100) prescriptionVersion: string;
  @IsInt() @Min(0) lineIndex: number;
  @IsString() @MaxLength(100) inventoryItemId: string;
}
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { PharmacyPrescriptionQueueService } from './pharmacy-prescription-queue.service';
import { QueryPrescriptionQueueDto } from './dto/pharmacy-prescription-queue.dto';

@ApiTags('Pharmacy Prescription Queue')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pharmacy/prescription-queue')
export class PharmacyPrescriptionQueueController {
  constructor(
    private readonly queueService: PharmacyPrescriptionQueueService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List prescriptions waiting for pharmacy dispensing',
  })
  @ApiResponse({ status: 200, description: 'Queue entries retrieved' })
  async findAll(
    @Query() query: QueryPrescriptionQueueDto,
    @Request() req: any,
  ) {
    return this.queueService.findAll(query, req.user.branchId);
  }

  @Get('inventory-stock/:id')
  @Permissions([
    'pharmacy:invoice:read',
    'inventory:item:read',
    'pharmacy:drug:autocomplete',
  ])
  async inventoryStock(@Param('id') id: string, @Request() req: any) {
    return this.queueService.inventoryStock(id, req.user.branchId);
  }

  @Get('inventory-suggestions')
  @Permissions([
    'pharmacy:invoice:read',
    'inventory:item:read',
    'pharmacy:drug:autocomplete',
  ])
  async suggestions(@Query('q') q: string, @Request() req: any) {
    return this.queueService.inventorySuggestions(q, req.user.branchId);
  }

  @Post(':prescriptionId/link-inventory')
  @Permissions('pharmacy:invoice:create')
  async link(
    @Param('prescriptionId') id: string,
    @Body() body: LinkPrescriptionInventoryDto,
    @Request() req: any,
  ) {
    return this.queueService.linkInventory(
      id,
      body.lineIndex,
      body.inventoryItemId,
      req.user.branchId,
      req.user.id,
      body.prescriptionVersion,
    );
  }

  @Get(':prescriptionId')
  @ApiOperation({ summary: 'Get one prescription queue entry' })
  @ApiResponse({ status: 200, description: 'Queue entry retrieved' })
  @ApiResponse({ status: 404, description: 'Prescription not found' })
  async findOne(
    @Param('prescriptionId') prescriptionId: string,
    @Request() req: any,
  ) {
    return this.queueService.findOne(prescriptionId, req.user.branchId);
  }

  @Post(':prescriptionId/pull')
  @ApiOperation({ summary: 'Recompute a prescription queue entry' })
  @ApiResponse({ status: 201, description: 'Queue entry recomputed' })
  async pull(
    @Param('prescriptionId') prescriptionId: string,
    @Request() req: any,
  ) {
    return this.queueService.pull(prescriptionId, req.user.branchId);
  }

  @Get(':prescriptionId/stock-check')
  @ApiOperation({ summary: 'Check branch stock for prescription medications' })
  @ApiResponse({ status: 200, description: 'Stock check retrieved' })
  async stockCheck(
    @Param('prescriptionId') prescriptionId: string,
    @Request() req: any,
  ) {
    return this.queueService.stockCheck(prescriptionId, req.user.branchId);
  }
}
