import { Controller, Get, Header, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { QueryPurchaseReturnsDto } from './dto/pharmacy-purchase-returns-register.dto';
import { PharmacyPurchaseReturnsRegisterService } from './pharmacy-purchase-returns-register.service';
import { MAX_REGISTER_RANGE_DAYS } from './register-utils';

@ApiTags('Pharmacy Purchase Register')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pharmacy/purchase-returns-register')
export class PharmacyPurchaseReturnsRegisterController {
  constructor(private readonly returns: PharmacyPurchaseReturnsRegisterService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR, UserRole.RECEPTION)
  @Permissions(['pharmacy:purchase-invoice:read', 'inventory:po:read'])
  @ApiOperation({ summary: 'List supplier returns and credit notes with their credit-note state and totals' })
  @ApiResponse({ status: 200, description: 'Returns page with credit held and awaited totals for every filtered row' })
  @ApiResponse({
    status: 400,
    description: `Invalid filters, or a date range that ends before it starts or spans more than ${MAX_REGISTER_RANGE_DAYS} days`,
  })
  list(@Query() query: QueryPurchaseReturnsDto, @Request() req: any) {
    return this.returns.list(query, { branchId: req.user.branchId });
  }
}
