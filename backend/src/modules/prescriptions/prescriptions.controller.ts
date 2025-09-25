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
import { PrescriptionsService } from './prescriptions.service';
import { 
  CreatePrescriptionDto, 
  UpdatePrescriptionDto, 
  RefillPrescriptionDto, 
  ApproveRefillDto,
  PrescriptionTemplateDto,
  CreatePrescriptionPadDto,
  } from './dto/prescription.dto';
import { 
  QueryPrescriptionsDto, 
  QueryRefillsDto, 
  PrescriptionHistoryDto, 
  DrugSearchDto,
  PrescriptionStatisticsDto,
  ExpiringPrescriptionsDto,
  PrescriptionTemplateQueryDto,
} from './dto/query-prescription.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

interface AuthenticatedRequest {
  user: {
    id: string;
    branchId: string;
    role: string;
  };
}

@Controller('prescriptions')
@UseGuards(JwtAuthGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  // Prescription endpoints
  @Post()
  createPrescription(
    @Body() createPrescriptionDto: CreatePrescriptionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.createPrescription(createPrescriptionDto, req.user.branchId);
  }

  @Post('pad')
  createPrescriptionPad(
    @Body() createPrescriptionDto: CreatePrescriptionPadDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.createPrescriptionPad(createPrescriptionDto, req.user.branchId);
  }

  @Get()
  findAllPrescriptions(
    @Query() query: QueryPrescriptionsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.findAllPrescriptions(query, req.user.branchId);
  }

  // Specific routes must come before generic :id route
  @Get('history')
  getPrescriptionHistory(
    @Query() query: PrescriptionHistoryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.getPrescriptionHistory(query, req.user.branchId);
  }

  @Get('expiring')
  getExpiringPrescriptions(
    @Query() query: ExpiringPrescriptionsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.getExpiringPrescriptions(query, req.user.branchId);
  }

  @Get('statistics')
  getPrescriptionStatistics(
    @Query() query: PrescriptionStatisticsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.getPrescriptionStatistics(query, req.user.branchId);
  }

  // Refill endpoints
  @Post('refills')
  requestRefill(
    @Body() refillDto: RefillPrescriptionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.requestRefill(refillDto, req.user.branchId);
  }

  @Post('refills/:id/approve')
  approveRefill(
    @Param('id') id: string,
    @Body() approveDto: ApproveRefillDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.approveRefill(approveDto, req.user.branchId, req.user.id);
  }

  @Post('refills/:id/reject')
  rejectRefill(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.rejectRefill(id, req.user.branchId, body.reason, req.user.id);
  }

  @Get('refills')
  findAllRefills(
    @Query() query: QueryRefillsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.findAllRefills(query, req.user.branchId);
  }

  // Drug search endpoint
  @Get('drugs/search')
  searchDrugs(@Query() query: DrugSearchDto) {
    return this.prescriptionsService.searchDrugs(query);
  }

  // Drug import (admin-only ideally; guarded by JWT here)
  @Post('drugs/import')
  importDrugs(
    @Body() body: { drugs: Array<Record<string, any>> },
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.importDrugs(body?.drugs || [], req.user.branchId);
  }

  // Drug autocomplete optimized for UI
  @Get('drugs/autocomplete')
  autocompleteDrugs(
    @Query('q') q: string,
    @Query('limit') limit?: number,
  ) {
    return this.prescriptionsService.autocompleteDrugs(q || '', Number(limit) || 15);
  }

  // Clinical field autocomplete (DB-backed)
  @Get('fields/autocomplete')
  autocompleteField(
    @Query('field') field: string,
    @Query('patientId') patientId: string,
    @Request() req: AuthenticatedRequest,
    @Query('visitId') visitId?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: number,
  ) {
    return this.prescriptionsService.autocompleteClinicalField(
      field,
      patientId,
      q || '',
      Number(limit) || 10,
      req.user.branchId,
      visitId,
    );
  }

  // Template endpoints
  @Post('templates')
  createPrescriptionTemplate(
    @Body() templateDto: PrescriptionTemplateDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.createPrescriptionTemplate(templateDto, req.user.branchId, req.user.id);
  }

  @Get('templates')
  findAllPrescriptionTemplates(
    @Query() query: PrescriptionTemplateQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.findAllPrescriptionTemplates(query, req.user.branchId);
  }

  // Patient-specific endpoints
  @Get('patient/:patientId')
  getPatientPrescriptions(
    @Param('patientId') patientId: string,
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: number,
  ) {
    return this.prescriptionsService.findAllPrescriptions(
      { patientId, limit: limit || 20 },
      req.user.branchId,
    );
  }

  @Get('patient/:patientId/history')
  getPatientPrescriptionHistory(
    @Param('patientId') patientId: string,
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: number,
  ) {
    return this.prescriptionsService.getPrescriptionHistory(
      { patientId, limit: limit || 50 },
      req.user.branchId,
    );
  }

  // Doctor-specific endpoints
  @Get('doctor/:doctorId')
  getDoctorPrescriptions(
    @Param('doctorId') doctorId: string,
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: number,
  ) {
    return this.prescriptionsService.findAllPrescriptions(
      { doctorId, limit: limit || 20 },
      req.user.branchId,
    );
  }

  @Get('doctor/:doctorId/statistics')
  getDoctorPrescriptionStatistics(
    @Param('doctorId') doctorId: string,
    @Query() query: PrescriptionStatisticsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.getPrescriptionStatistics(
      { ...query, doctorId },
      req.user.branchId,
    );
  }

  // Generic routes must come last
  @Get(':id')
  findPrescriptionById(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.prescriptionsService.findPrescriptionById(id, req.user.branchId);
  }

  @Patch(':id')
  updatePrescription(
    @Param('id') id: string,
    @Body() updatePrescriptionDto: UpdatePrescriptionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.updatePrescription(id, updatePrescriptionDto, req.user.branchId);
  }

  @Delete(':id')
  cancelPrescription(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Query('reason') reason?: string,
  ) {
    return this.prescriptionsService.cancelPrescription(id, req.user.branchId, reason);
  }
}
