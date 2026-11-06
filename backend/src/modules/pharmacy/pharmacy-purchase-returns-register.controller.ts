import { Controller, Get, Header, Query, Request, StreamableFile, UseGuards } from '@nestjs/common';
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
  @ApiOperation({ summary: 'List supplier returns and credit notes with their credit-note state and totals, or download them as Excel' })
  @ApiResponse({
    status: 200,
    description: 'Returns page; credit held and awaited cover all dates for the distributor filter. With format=xlsx, every filtered row as an Excel file',
  })
  @ApiResponse({
    status: 400,
    description: `Invalid filters, or a date range that ends before it starts or spans more than ${MAX_REGISTER_RANGE_DAYS} days`,
  })
  async list(@Query() query: QueryPurchaseReturnsDto, @Request() req: any) {
    const actor = { branchId: req.user.branchId };
    if (query.format !== 'xlsx') return this.returns.list(query, actor);
    const file = await this.returns.export(query, actor);
    return new StreamableFile(file.data, { type: file.mimeType, disposition: `attachment; filename="${file.fileName}"` });
  }
}
