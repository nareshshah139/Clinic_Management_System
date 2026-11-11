import { Body, Controller, Get, Param, ParseEnumPipe, Put, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClinicBillType, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { ClinicFeesService, FeeActor } from './clinic-fees.service';
import { SetClinicFeeDto } from './dto/clinic-fee.dto';

@ApiTags('Billing')
@Controller('billing/fees')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ClinicFeesController {
  constructor(private readonly fees: ClinicFeesService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  list(@Request() req: { user: FeeActor }) {
    return this.fees.list(req.user);
  }

  @Put(':billType')
  @Roles(UserRole.ADMIN)
  set(
    @Param('billType', new ParseEnumPipe(ClinicBillType)) billType: ClinicBillType,
    @Body() dto: SetClinicFeeDto,
    @Request() req: { user: FeeActor },
  ) {
    return this.fees.set(req.user, billType, dto.amount, dto.version);
  }
}
