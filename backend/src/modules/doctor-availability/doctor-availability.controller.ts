import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import { Actor, DoctorAvailabilityService } from './doctor-availability.service';
import {
  AvailabilityDayDto,
  AvailabilityRangeDto,
  CreateTimeOffDto,
  ReplaceWorkingHoursDto,
} from './dto/doctor-availability.dto';

const READ_ROLES = [
  UserRole.ADMIN,
  UserRole.DOCTOR,
  UserRole.NURSE,
  UserRole.RECEPTION,
];

/**
 * @cc [owner:nareshshah139,label:security] doctor-availability-route-access
 * Reading availability and holidays MUST be open to OWNER, ADMIN, DOCTOR and, when they hold
 * appointments:read, NURSE and RECEPTION; any other role MUST get 403. Changing working hours or
 * time off MUST be open to OWNER, ADMIN and DOCTOR at the route and MUST be refused to every other
 * role with 403; the service then limits a DOCTOR to their own hours and time off.
 */
@ApiTags('Doctor availability')
@Controller('doctor-availability')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DoctorAvailabilityController {
  constructor(private readonly service: DoctorAvailabilityService) {}

  @Get('holidays')
  @Roles(...READ_ROLES)
  @Permissions('appointments:read')
  listHolidays(
    @Query() range: AvailabilityRangeDto,
    @Request() req: { user: Actor },
  ) {
    return this.service.listHolidays(req.user.branchId, range);
  }

  @Post('time-off')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.DOCTOR)
  createTimeOff(@Body() dto: CreateTimeOffDto, @Request() req: { user: Actor }) {
    return this.service.createTimeOff(dto, req.user);
  }

  @Delete('time-off/:id')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.DOCTOR)
  deleteTimeOff(@Param('id') id: string, @Request() req: { user: Actor }) {
    return this.service.deleteTimeOff(id, req.user);
  }

  @Get(':doctorId')
  @Roles(...READ_ROLES)
  @Permissions('appointments:read')
  getAvailability(
    @Param('doctorId') doctorId: string,
    @Query() range: AvailabilityRangeDto,
    @Request() req: { user: Actor },
  ) {
    return this.service.getAvailability(doctorId, req.user.branchId, range);
  }

  @Get(':doctorId/day')
  @Roles(...READ_ROLES)
  @Permissions('appointments:read')
  getDay(
    @Param('doctorId') doctorId: string,
    @Query() query: AvailabilityDayDto,
    @Request() req: { user: Actor },
  ) {
    return this.service.getDay(doctorId, req.user.branchId, query.date);
  }

  @Put(':doctorId/hours')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.DOCTOR)
  replaceHours(
    @Param('doctorId') doctorId: string,
    @Body() dto: ReplaceWorkingHoursDto,
    @Request() req: { user: Actor },
  ) {
    return this.service.replaceHours(doctorId, dto, req.user);
  }
}
