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

@Controller('patients')
@UseGuards(JwtAuthGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  create(@Body() createPatientDto: CreatePatientDto, @Request() req) {
    return this.patientsService.create(createPatientDto, req.user.branchId);
  }

  @Get()
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
    @Query('gender') gender?: string,
    @Request() req,
  ) {
    return this.patientsService.findAll(
      { page: +page, limit: +limit, search, gender },
      req.user.branchId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.patientsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patientsService.update(id, dto);
  }

  @Post(':id/link-user')
  linkUser(@Param('id') id: string, @Body() dto: LinkPatientUserDto, @Request() req) {
    return this.patientsService.linkUser(id, dto, req.user.branchId);
  }

  @Post(':id/unlink-user')
  unlinkUser(@Param('id') id: string, @Request() req) {
    return this.patientsService.unlinkUser(id, req.user.branchId);
  }

  @Get(':id/portal-user')
  getPortalUser(@Param('id') id: string, @Request() req) {
    return this.patientsService.getPortalUser(id, req.user.branchId);
  }
}
