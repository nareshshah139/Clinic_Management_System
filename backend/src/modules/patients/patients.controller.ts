import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { LinkPatientUserDto } from './dto/link-patient-user.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    branchId: string;
    role: string;
  };
}

@Controller('patients')
@UseGuards(JwtAuthGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  create(@Body() createPatientDto: CreatePatientDto, @Request() req: AuthenticatedRequest) {
    return this.patientsService.create(createPatientDto, req.user.branchId);
  }

  @Get()
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
    @Query('gender') gender?: string,
    @Request() req: AuthenticatedRequest,
  ) {
    // Validate and sanitize inputs
    const pageNum = Math.max(1, +page || 1);
    const limitNum = Math.min(100, Math.max(1, +limit || 10)); // Cap at 100 for performance
    const searchTerm = search?.trim() || undefined;
    const genderFilter = gender?.trim() || undefined;

    return this.patientsService.findAll(
      { 
        page: pageNum, 
        limit: limitNum, 
        search: searchTerm, 
        gender: genderFilter 
      },
      req.user.branchId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.patientsService.findOne(id, req.user.branchId);
  }

  @Get(':id/next-appointment')
  getNextAppointment(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.patientsService.getNextAppointment(id, req.user.branchId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto, @Request() req: AuthenticatedRequest) {
    return this.patientsService.update(id, dto, req.user.branchId);
  }

  @Post(':id/link-user')
  linkUser(@Param('id') id: string, @Body() dto: LinkPatientUserDto, @Request() req: AuthenticatedRequest) {
    return this.patientsService.linkUser(id, dto, req.user.branchId);
  }

  @Post(':id/unlink-user')
  unlinkUser(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.patientsService.unlinkUser(id, req.user.branchId);
  }

  @Get(':id/portal-user')
  getPortalUser(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.patientsService.getPortalUser(id, req.user.branchId);
  }

  @Post(':id/send-appointment-reminder')
  sendAppointmentReminder(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.patientsService.sendAppointmentReminder(id, req.user.branchId);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.patientsService.archive(id, req.user.branchId);
  }

  @Post(':id/unarchive')
  unarchive(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.patientsService.unarchive(id, req.user.branchId);
  }
}
