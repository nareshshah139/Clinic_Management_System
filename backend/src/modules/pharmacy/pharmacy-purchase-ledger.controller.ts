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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { PharmacyPurchaseLedgerService } from './pharmacy-purchase-ledger.service';
import {
  CreatePharmacyPurchasePaymentDto,
  QueryPharmacyPurchaseLedgerDto,
} from './dto/pharmacy-purchase-ledger.dto';

@ApiTags('Pharmacy Purchase Ledger')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pharmacy/purchase-ledger')
export class PharmacyPurchaseLedgerController {
  constructor(private readonly ledgerService: PharmacyPurchaseLedgerService) {}

  @Post('payments')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.ACCOUNTANT)
  @Permissions('pharmacy:purchase-ledger:write')
  @ApiOperation({
    summary: 'Record a distributor purchase payment with invoice allocations',
  })
  createPayment(
    @Body() dto: CreatePharmacyPurchasePaymentDto,
    @Request() req: any,
  ) {
    return this.ledgerService.createPayment(
      dto,
      req.user.branchId,
      req.user.id,
    );
  }

  @Get('distributors')
  @Roles(
    UserRole.ADMIN,
    UserRole.PHARMACIST,
    UserRole.ACCOUNTANT,
    UserRole.DOCTOR,
  )
  @Permissions('pharmacy:purchase-ledger:read')
  @ApiOperation({
    summary: 'Summarize purchase ledger balances by distributor',
  })
  getDistributors(
    @Query() query: QueryPharmacyPurchaseLedgerDto,
    @Request() req: any,
  ) {
    return this.ledgerService.getDistributorSummaries(
      req.user.branchId,
      this.asOfDate(query.asOfDate),
    );
  }

  @Get('distributors/:gstin')
  @Roles(
    UserRole.ADMIN,
    UserRole.PHARMACIST,
    UserRole.ACCOUNTANT,
    UserRole.DOCTOR,
  )
  @Permissions('pharmacy:purchase-ledger:read')
  @ApiOperation({
    summary: 'Get distributor purchase invoice ledger rows and payments',
  })
  getDistributorLedger(
    @Param('gstin') gstin: string,
    @Query() query: QueryPharmacyPurchaseLedgerDto,
    @Request() req: any,
  ) {
    return this.ledgerService.getDistributorLedger(
      req.user.branchId,
      gstin,
      this.asOfDate(query.asOfDate),
    );
  }

  @Get('aging')
  @Roles(
    UserRole.ADMIN,
    UserRole.PHARMACIST,
    UserRole.ACCOUNTANT,
    UserRole.DOCTOR,
  )
  @Permissions('pharmacy:purchase-ledger:read')
  @ApiOperation({
    summary: 'Get outstanding purchase invoice aging buckets',
  })
  getAging(
    @Query() query: QueryPharmacyPurchaseLedgerDto,
    @Request() req: any,
  ) {
    return this.ledgerService.getAging(
      req.user.branchId,
      this.asOfDate(query.asOfDate),
    );
  }

  @Get('alerts')
  @Roles(
    UserRole.ADMIN,
    UserRole.PHARMACIST,
    UserRole.ACCOUNTANT,
    UserRole.DOCTOR,
  )
  @Permissions('pharmacy:purchase-ledger:read')
  @ApiOperation({
    summary: 'Get distributor due-date and TCS threshold alerts',
  })
  getAlerts(
    @Query() query: QueryPharmacyPurchaseLedgerDto,
    @Request() req: any,
  ) {
    return this.ledgerService.getAlerts(
      req.user.branchId,
      this.asOfDate(query.asOfDate),
    );
  }

  private asOfDate(value?: string) {
    return value ? new Date(value) : new Date();
  }
}
