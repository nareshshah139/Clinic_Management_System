import {
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
