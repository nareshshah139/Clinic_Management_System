import {
  BadRequestException,
  Controller,
  Get,
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
import { UserRole } from '@prisma/client';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { QuerySalesRegisterDto } from './dto/pharmacy-sales-register.dto';
import { PharmacySalesRegisterService } from './pharmacy-sales-register.service';

@ApiTags('Pharmacy Sales Register')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pharmacy/sales-register')
export class PharmacySalesRegisterController {
  constructor(private readonly salesRegister: PharmacySalesRegisterService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR)
  @Permissions('pharmacy:invoice:read')
  @ApiOperation({
    summary: 'List pharmacy bills, counter sales or sales returns with totals',
  })
  @ApiResponse({
    status: 200,
    description: 'Register page with totals for every filtered row',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid filters or a date range that ends before it starts',
  })
  async list(@Query() query: QuerySalesRegisterDto, @Request() req: any) {
    if (query.from > query.to)
      throw new BadRequestException(
        'The start date must be on or before the end date',
      );
    return this.salesRegister.list(query, req.user.branchId);
  }
}
