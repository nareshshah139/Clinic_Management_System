import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PharmacyService } from './pharmacy.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

@ApiTags('Pharmacy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pharmacy')
export class PharmacyController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get pharmacy dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully' })
  async getDashboard(@Request() req: any) {
    return this.pharmacyService.getDashboard(req.user.branchId);
  }

  @Get('dashboard/sales')
  @ApiOperation({ summary: 'Get pharmacy sales statistics' })
  @ApiResponse({ status: 200, description: 'Sales data retrieved successfully' })
  async getSalesStats(@Request() req: any) {
    return this.pharmacyService.getSalesStats(req.user.branchId);
  }

  @Get('dashboard/top-selling')
  @ApiOperation({ summary: 'Get top selling drugs' })
  @ApiResponse({ status: 200, description: 'Top selling drugs retrieved successfully' })
  async getTopSellingDrugs(@Request() req: any, @Query('limit') limit?: string) {
    return this.pharmacyService.getTopSellingDrugs(req.user.branchId, limit ? parseInt(limit) : 10);
  }

  @Get('dashboard/recent-invoices')
  @ApiOperation({ summary: 'Get recent pharmacy invoices' })
  @ApiResponse({ status: 200, description: 'Recent invoices retrieved successfully' })
  async getRecentInvoices(@Request() req: any, @Query('limit') limit?: string) {
    return this.pharmacyService.getRecentInvoices(req.user.branchId, limit ? parseInt(limit) : 10);
  }

  @Get('dashboard/alerts')
  @ApiOperation({ summary: 'Get pharmacy alerts (low stock, expired drugs)' })
  @ApiResponse({ status: 200, description: 'Alerts retrieved successfully' })
  async getAlerts(@Request() req: any) {
    return this.pharmacyService.getAlerts(req.user.branchId);
  }
} 