import {
  Controller,
  Get,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import { ClinicBillRegisterService } from './clinic-bill-register.service';
import { QueryClinicBillRegisterDto } from './dto/clinic-bill-register.dto';

type Viewer = { user: { id: string; role: string; branchId: string } };

@ApiTags('Billing')
@Controller('billing')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ClinicBillRegisterController {
  constructor(private readonly register: ClinicBillRegisterService) {}

  @Get('register')
  @Roles(UserRole.ADMIN, UserRole.RECEPTION, UserRole.DOCTOR)
  @Permissions('billing:invoice:read')
  @ApiOperation({
    summary:
      'Clinic bills in a date range, with totals and the row actions the viewer may use',
  })
  list(@Query() query: QueryClinicBillRegisterDto, @Request() req: Viewer) {
    return this.register.list(query, req.user, req.user.branchId);
  }

  @Get('invoices/:id/receipt')
  @Roles(UserRole.ADMIN, UserRole.RECEPTION, UserRole.DOCTOR)
  @Permissions('billing:invoice:read')
  @ApiOperation({
    summary:
      'A clinic bill as its receipt prints it: clinic, patient, doctor, lines, payments and balance',
  })
  receipt(@Param('id') id: string, @Request() req: Viewer) {
    return this.register.receipt(id, req.user.branchId);
  }
}
