import {
  Controller,
  Get,
  Header,
  Query,
  Request,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
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
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR, UserRole.RECEPTION)
  @Permissions(['pharmacy:purchase-invoice:read', 'inventory:po:read'])
  @ApiOperation({
    summary: 'List purchase bills with payment state and totals, or download them as Excel',
  })
  @ApiResponse({
    status: 200,
    description:
      'Register page with totals for every filtered bill; with format=xlsx, every filtered bill as an Excel file',
  })
  @ApiResponse({
    status: 400,
    description: `Invalid filters, or a date range that ends before it starts or spans more than ${MAX_REGISTER_RANGE_DAYS} days`,
  })
  async list(@Query() query: QueryPurchaseRegisterDto, @Request() req: any) {
    const actor = { branchId: req.user.branchId };
    if (query.format !== 'xlsx') return this.purchaseRegister.list(query, actor);
    const file = await this.purchaseRegister.export(query, actor);
    return new StreamableFile(file.data, {
      type: file.mimeType,
      disposition: `attachment; filename="${file.fileName}"`,
    });
  }
}
