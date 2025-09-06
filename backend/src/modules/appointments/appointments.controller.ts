import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import {
  CreateAppointmentDto,
  RescheduleAppointmentDto,
} from './dto/create-appointment.dto';
import {
  UpdateAppointmentDto,
  BulkUpdateAppointmentsDto,
} from './dto/update-appointment.dto';
import {
  QueryAppointmentsDto,
  AvailableSlotsDto,
} from './dto/query-appointment.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

interface AuthenticatedRequest {
  user: {
    id: string;
    branchId: string;
    role: string;
  };
}

@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  create(
    @Body() createAppointmentDto: CreateAppointmentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.appointmentsService.create(
      createAppointmentDto,
      req.user.branchId,
    );
  }

  @Get()
  findAll(
    @Query() query: QueryAppointmentsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.appointmentsService.findAll(query, req.user.branchId);
  }

  @Get('available-slots')
  getAvailableSlots(
    @Query() query: AvailableSlotsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.appointmentsService.getAvailableSlots(query, req.user.branchId);
  }

  @Get('doctor/:doctorId/schedule')
  getDoctorSchedule(
    @Param('doctorId') doctorId: string,
    @Query('date') date: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.appointmentsService.getDoctorSchedule(
      doctorId,
      date,
      req.user.branchId,
    );
  }

  @Get('room/:roomId/schedule')
  getRoomSchedule(
    @Param('roomId') roomId: string,
    @Query('date') date: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.appointmentsService.getRoomSchedule(
      roomId,
      date,
      req.user.branchId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.appointmentsService.findOne(id, req.user.branchId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateAppointmentDto: UpdateAppointmentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.appointmentsService.update(
      id,
      updateAppointmentDto,
      req.user.branchId,
    );
  }

  @Post(':id/reschedule')
  reschedule(
    @Param('id') id: string,
    @Body() rescheduleDto: RescheduleAppointmentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.appointmentsService.reschedule(
      id,
      rescheduleDto,
      req.user.branchId,
    );
  }

  @Post('bulk-update')
  bulkUpdate(
    @Body() bulkUpdateDto: BulkUpdateAppointmentsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.appointmentsService.bulkUpdate(
      bulkUpdateDto,
      req.user.branchId,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.appointmentsService.remove(id, req.user.branchId);
  }
}
