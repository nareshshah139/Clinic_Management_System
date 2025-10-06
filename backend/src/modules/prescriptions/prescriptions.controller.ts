// @ts-nocheck
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

  // Template versioning & approvals
  @Get('templates/:templateId/versions')
  listTemplateVersions(
    @Param('templateId') templateId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.listTemplateVersions(templateId, req.user.branchId);
  }

  @Post('templates/:templateId/versions')
  createTemplateVersion(
    @Param('templateId') templateId: string,
    @Body() body: { language?: string; content: any; changeNotes?: string },
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.createTemplateVersion(templateId, body, req.user.branchId, req.user.id);
  }

  @Post('templates/:templateId/versions/:versionId/submit')
  submitTemplateVersion(
    @Param('templateId') templateId: string,
    @Param('versionId') versionId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.submitTemplateVersion(templateId, versionId, req.user.branchId, req.user.id);
  }

  @Post('templates/:templateId/versions/:versionId/approve')
  approveTemplateVersion(
    @Param('templateId') templateId: string,
    @Param('versionId') versionId: string,
    @Body() body: { note?: string },
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.approveTemplateVersion(templateId, versionId, req.user.branchId, req.user.id, body?.note);
  }

  @Post('templates/:templateId/versions/:versionId/reject')
  rejectTemplateVersion(
    @Param('templateId') templateId: string,
    @Param('versionId') versionId: string,
    @Body() body: { note?: string },
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.rejectTemplateVersion(templateId, versionId, req.user.branchId, req.user.id, body?.note);
  }

  // Asset library
  @Get('assets')
  listAssets(
    @Query('type') type: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.listClinicAssets(req.user.branchId, type);
  }

  @Post('assets')
  upsertAsset(
    @Body() body: { id?: string; type: 'LOGO'|'STAMP'|'SIGNATURE'; name: string; url: string; opacity?: number; scale?: number; rotationDeg?: number; crop?: any; placement?: any; isActive?: boolean },
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.upsertClinicAsset(req.user.branchId, req.user.id, body);
  }

  @Delete('assets/:id')
  deleteAsset(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.deleteClinicAsset(req.user.branchId, id);
  }

  // Printer profiles
  @Get('printer-profiles')
  listPrinterProfiles(
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.listPrinterProfiles(req.user.branchId, req.user.id);
  }

  @Post('printer-profiles')
  upsertPrinterProfile(
    @Body() body: { id?: string; name: string; paperPreset?: string; topMarginPx?: number; leftMarginPx?: number; rightMarginPx?: number; bottomMarginPx?: number; contentOffsetXPx?: number; contentOffsetYPx?: number; grayscale?: boolean; bleedSafeMm?: number; metadata?: any; isDefault?: boolean },
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.upsertPrinterProfile(req.user.branchId, req.user.id, body);
  }

  @Post('printer-profiles/:id/default')
  setDefaultPrinterProfile(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.setDefaultPrinterProfile(req.user.branchId, req.user.id, id);
  }

  @Delete('printer-profiles/:id')
  deletePrinterProfile(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.deletePrinterProfile(req.user.branchId, req.user.id, id);
  }

  // Server-side PDF rendering and sharing
  @Post(':id/pdf')
  generatePdf(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Body() body: { profileId?: string; includeAssets?: boolean; grayscale?: boolean },
  ) {
    return this.prescriptionsService.generatePrescriptionPdf(id, req.user.branchId, body);
  }

  @Post(':id/share')
  sharePrescription(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Body() body: { channel: 'EMAIL'|'WHATSAPP'; to: string; message?: string },
  ) {
    return this.prescriptionsService.sharePrescription(id, req.user.branchId, req.user.id, body);
  }

  // Print/Share tracking event
  @Post(':id/print-events')
  recordPrintEvent(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Body() body: { eventType: string; channel?: string; count?: number; metadata?: any },
  ) {
    return this.prescriptionsService.recordPrintEvent(id, req.user.branchId, body);
  }

  @Get(':id/print-events')
  getPrintEvents(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.getPrintEvents(id, req.user.branchId);
  }

  // Translation memory
  @Get('translations')
  listTranslations(
    @Request() req: AuthenticatedRequest,
    @Query('fieldKey') fieldKey?: string,
    @Query('q') q?: string,
    @Query('targetLanguage') targetLanguage?: string,
  ) {
    return this.prescriptionsService.listTranslationMemory(req.user.branchId, { fieldKey, q, targetLanguage });
  }

  @Post('translations')
  upsertTranslation(
    @Request() req: AuthenticatedRequest,
    @Body() body: { fieldKey: string; sourceText: string; targetLanguage: string; targetText: string; confidence?: number },
  ) {
    return this.prescriptionsService.upsertTranslationMemory(req.user.branchId, body);
  }

  // Drug interactions preview (no persistence)
  @Post('interactions/preview')
  previewInteractions(
    @Body() body: { items: any[] },
  ) {
    return this.prescriptionsService.previewDrugInteractions(Array.isArray(body?.items) ? body.items : []);
  }

  // Template usage analytics
  @Post('templates/:templateId/usage')
  recordTemplateUsage(
    @Param('templateId') templateId: string,
    @Body() body: { prescriptionId?: string; variant?: string; alignmentDx?: any },
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.recordTemplateUsage(templateId, req.user.branchId, req.user.id, body);
  }

  // A/B experiments
  @Get('experiments')
  listExperiments(@Request() req: AuthenticatedRequest) {
    return this.prescriptionsService.listLayoutExperiments(req.user.branchId);
  }

  @Post('experiments/:experimentKey/assign')
  assignExperimentVariant(
    @Param('experimentKey') experimentKey: string,
    @Body() body: { patientId?: string },
    @Request() req: AuthenticatedRequest,
  ) {
    return this.prescriptionsService.assignLayoutVariant(req.user.branchId, experimentKey, req.user.id, body?.patientId);
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
