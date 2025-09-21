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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import { UserRole } from '@prisma/client';

interface AuthenticatedRequest {
  user: {
    id: string;
    branchId: string;
    role: string;
  };
}

@ApiTags('Appointments')
@Controller('appointments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTION)
  @Permissions('appointments:create')
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
  @Roles(UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTION)
  @Permissions('appointments:read')
  findAll(
    @Query() query: QueryAppointmentsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.appointmentsService.findAll(query, req.user.branchId);
  }

  @Get('available-slots')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTION)
  @Permissions('appointments:read')
  getAvailableSlots(
    @Query() query: AvailableSlotsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.appointmentsService.getAvailableSlots(query, req.user.branchId);
  }

  @Get('doctor/:doctorId/schedule')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTION)
  @Permissions('appointments:read')
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
  @Roles(UserRole.ADMIN, UserRole.RECEPTION)
  @Permissions('appointments:read')
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

  @Get('rooms')
  @Roles(UserRole.ADMIN, UserRole.RECEPTION)
  @Permissions('rooms:read')
  getRooms(@Request() req: AuthenticatedRequest) {
    return this.appointmentsService.getRooms(req.user.branchId);
  }

  @Get('rooms/all')
  @Roles(UserRole.ADMIN)
  @Permissions('rooms:read')
  getAllRooms(@Request() req: AuthenticatedRequest) {
    return this.appointmentsService.getAllRooms(req.user.branchId);
  }

  @Post('rooms')
  @Roles(UserRole.ADMIN)
  @Permissions('rooms:manage')
  createRoom(
    @Body() roomData: { name: string; type: string; capacity: number; isActive: boolean },
    @Request() req: AuthenticatedRequest
  ) {
    return this.appointmentsService.createRoom(roomData, req.user.branchId);
  }

  @Patch('rooms/:roomId')
  @Roles(UserRole.ADMIN)
  @Permissions('rooms:manage')
  updateRoom(
    @Param('roomId') roomId: string,
    @Body() roomData: { name: string; type: string; capacity: number; isActive: boolean },
    @Request() req: AuthenticatedRequest
  ) {
    return this.appointmentsService.updateRoom(roomId, roomData, req.user.branchId);
  }

  @Delete('rooms/:roomId')
  @Roles(UserRole.ADMIN)
  @Permissions('rooms:manage')
  deleteRoom(
    @Param('roomId') roomId: string,
    @Request() req: AuthenticatedRequest
  ) {
    return this.appointmentsService.deleteRoom(roomId, req.user.branchId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTION)
  @Permissions('appointments:read')
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.appointmentsService.findOne(id, req.user.branchId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTION)
  @Permissions('appointments:update')
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
  @Roles(UserRole.ADMIN, UserRole.RECEPTION)
  @Permissions('appointments:reschedule')
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
  @Roles(UserRole.ADMIN)
  @Permissions('appointments:bulkUpdate')
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
  @Roles(UserRole.ADMIN, UserRole.RECEPTION)
  @Permissions('appointments:delete')
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.appointmentsService.remove(id, req.user.branchId);
  }
}
