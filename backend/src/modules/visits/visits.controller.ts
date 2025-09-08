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
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { VisitsService } from './visits.service';
import { CreateVisitDto, UpdateVisitDto, CompleteVisitDto } from './dto/create-visit.dto';
import { QueryVisitsDto, PatientVisitHistoryDto, DoctorVisitsDto } from './dto/query-visit.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';
import * as fs from 'fs';

interface AuthenticatedRequest {
  user: {
    id: string;
    branchId: string;
    role: string;
  };
}

function ensureUploadsDir() {
  const dir = join(process.cwd(), 'uploads', 'visits');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

@ApiTags('Visits')
@Controller('visits')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Post()
  create(
    @Body() createVisitDto: CreateVisitDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.visitsService.create(createVisitDto, req.user.branchId);
  }

  @Get()
  findAll(
    @Query() query: QueryVisitsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.visitsService.findAll(query, req.user.branchId);
  }

  @Get('statistics')
  getStatistics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.visitsService.getVisitStatistics(
      req.user.branchId,
      startDate,
      endDate,
    );
  }

  @Get('patient/:patientId/history')
  getPatientVisitHistory(
    @Param('patientId') patientId: string,
    @Query() query: Omit<PatientVisitHistoryDto, 'patientId'>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.visitsService.getPatientVisitHistory(
      { patientId, ...query },
      req.user.branchId,
    );
  }

  @Get('doctor/:doctorId')
  getDoctorVisits(
    @Param('doctorId') doctorId: string,
    @Query() query: Omit<DoctorVisitsDto, 'doctorId'>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.visitsService.getDoctorVisits(
      { doctorId, ...query },
      req.user.branchId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.visitsService.findOne(id, req.user.branchId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateVisitDto: UpdateVisitDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.visitsService.update(id, updateVisitDto, req.user.branchId);
  }

  @Post(':id/complete')
  complete(
    @Param('id') id: string,
    @Body() completeVisitDto: CompleteVisitDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.visitsService.complete(id, completeVisitDto, req.user.branchId);
  }

  @Post(':id/photos')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 6, {
    storage: diskStorage({
      destination: (_req, _file, cb) => cb(null, ensureUploadsDir()),
      filename: (_req, file, cb) => {
        const unique = randomBytes(8).toString('hex');
        cb(null, `${Date.now()}_${unique}${extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
  }))
  uploadPhotos(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: AuthenticatedRequest,
  ) {
    const relPaths = files.map(f => `/uploads/visits/${f.filename}`);
    return this.visitsService.addAttachments(id, relPaths, req.user.branchId);
  }

  @Get(':id/photos')
  listPhotos(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.visitsService.listAttachments(id, req.user.branchId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.visitsService.remove(id, req.user.branchId);
  }
}
