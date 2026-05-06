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
import { PharmacyPartnerSalesService } from './pharmacy-partner-sales.service';
import {
  CreatePartnerDailySaleDto,
  QueryPartnerDailySalesDto,
  QueryPartnerMissingSalesDto,
} from './dto/pharmacy-partner-sales.dto';

@ApiTags('Pharmacy Partner Daily Sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pharmacy/partner-sales')
export class PharmacyPartnerSalesController {
  constructor(
    private readonly partnerSalesService: PharmacyPartnerSalesService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Submit a manual or CSV-sourced partner pharmacy daily sale',
  })
  @ApiResponse({ status: 201, description: 'Partner sale submitted' })
  create(@Body() dto: CreatePartnerDailySaleDto, @Request() req: any) {
    return this.partnerSalesService.create(dto, req.user);
  }

  @Get()
  @ApiOperation({
    summary:
      'List partner daily sales filtered by date, organization, or status',
  })
  @ApiResponse({ status: 200, description: 'Partner sales retrieved' })
  findAll(@Query() query: QueryPartnerDailySalesDto, @Request() req: any) {
    return this.partnerSalesService.findAll(query, req.user);
  }

  @Get('today-summary')
  @ApiOperation({ summary: "Get today's partner sync submission summary" })
  @ApiResponse({ status: 200, description: 'Partner sales summary retrieved' })
  todaySummary(@Request() req: any) {
    return this.partnerSalesService.todaySummary(req.user);
  }

  @Get('missing')
  @ApiOperation({
    summary: 'List partner organizations missing entries by cutoff hour',
  })
  @ApiResponse({
    status: 200,
    description: 'Missing partner entries retrieved',
  })
  missing(@Query() query: QueryPartnerMissingSalesDto, @Request() req: any) {
    return this.partnerSalesService.missing(query, req.user);
  }

  @Post(':id/commit-stock')
  @ApiOperation({
    summary:
      'Commit available stock for a partner sale and flag unmatched or excess quantities',
  })
  @ApiResponse({
    status: 200,
    description: 'Partner sale stock commit complete',
  })
  commitStock(@Param('id') id: string, @Request() req: any) {
    return this.partnerSalesService.commitStock(id, req.user);
  }
}
