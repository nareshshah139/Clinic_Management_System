import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { QueryPurchaseRegisterDto } from './dto/pharmacy-purchase-register.dto';
import { PharmacyPurchaseRegisterService } from './pharmacy-purchase-register.service';
import { MAX_REGISTER_RANGE_DAYS } from './register-utils';

@ApiTags('Pharmacy Purchase Register')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pharmacy/purchase-register')
export class PharmacyPurchaseRegisterController {
  constructor(private readonly purchaseRegister: PharmacyPurchaseRegisterService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR, UserRole.RECEPTION)
  @Permissions(['pharmacy:purchase-invoice:read', 'inventory:po:read'])
  @ApiOperation({
    summary: 'List purchase bills with payment state, totals and settle access',
  })
  @ApiResponse({
    status: 200,
    description: 'Register page with totals for every filtered bill',
  })
  @ApiResponse({
    status: 400,
    description: `Invalid filters, or a date range that ends before it starts or spans more than ${MAX_REGISTER_RANGE_DAYS} days`,
  })
  async list(@Query() query: QueryPurchaseRegisterDto, @Request() req: any) {
    return this.purchaseRegister.list(query, {
      id: req.user.id,
      role: req.user.role,
      branchId: req.user.branchId,
    });
  }
}
