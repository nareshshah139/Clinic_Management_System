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
  UploadedFile,
} from '@nestjs/common';
import { VisitsService } from './visits.service';
import { CreateVisitDto, UpdateVisitDto, CompleteVisitDto } from './dto/create-visit.dto';
import { QueryVisitsDto, PatientVisitHistoryDto, DoctorVisitsDto } from './dto/query-visit.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import type { Express } from 'express';
import { Logger } from '@nestjs/common';

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

function ensurePatientDraftDir(patientId: string) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const dir = join(process.cwd(), 'uploads', 'patients', patientId, dateStr);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return { absPath: dir, dateStr };
}

@ApiTags('Visits')
@Controller('visits')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}
  private readonly logger = new Logger(VisitsController.name);

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

  // Draft photo upload before a visit exists
  @Post('photos/draft/:patientId')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 6, {
    storage: diskStorage({
      destination: (req: any, _file: any, cb: any) => {
        const { absPath } = ensurePatientDraftDir(req.params.patientId);
        cb(null, absPath);
      },
      filename: (_req: any, file: any, cb: any) => {
        const unique = randomBytes(8).toString('hex');
        cb(null, `${Date.now()}_${unique}${extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
  }))
  async uploadDraftPhotos(
    @Param('patientId') patientId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const { dateStr } = ensurePatientDraftDir(patientId);
    const relPaths = (files || []).map(f => `/uploads/patients/${patientId}/${dateStr}/${f.filename}`);
    // Return sanitized/current list for today
    return this.visitsService.listDraftAttachments(patientId, dateStr);
  }

  @Get('photos/draft/:patientId')
  listDraftPhotos(@Param('patientId') patientId: string) {
    // Default to today's folder
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return this.visitsService.listDraftAttachments(patientId, dateStr);
  }

  @Get('statistics')
  getStatistics(
    @Request() req: AuthenticatedRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
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
      destination: (_req: any, _file: any, cb: any) => cb(null, ensureUploadsDir()),
      filename: (_req: any, file: any, cb: any) => {
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

  // Speech-to-text proxy to OpenAI Whisper
  @Post('transcribe')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async transcribeAudio(
    @UploadedFile() file: Express.Multer.File,
    @Request() _req: AuthenticatedRequest,
  ) {
    this.logger.log(
      `transcribeAudio: received file name=${file?.originalname || 'n/a'} size=${file?.size || 0} type=${file?.mimetype || 'n/a'}`,
    );
    if (!file || !file.buffer) {
      this.logger.warn('transcribeAudio: no file buffer provided');
      return { text: '' };
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY is not configured');
      throw new Error('OPENAI_API_KEY is not configured');
    }
    try {
      // Build multipart form-data for OpenAI Whisper using native undici FormData/Blob
      const form = new FormData();
      const blob = new Blob([file.buffer], { type: file.mimetype || 'audio/webm' });
      form.append('file', blob, file.originalname || 'audio.webm');
      form.append('model', 'whisper-1');

      this.logger.log('transcribeAudio: sending audio to OpenAI Whisper');
      const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        } as any,
        body: form as any,
      });
      this.logger.log(`transcribeAudio: OpenAI responded status=${resp.status}`);
      if (!resp.ok) {
        const errText = await resp.text();
        this.logger.error(`OpenAI error response: ${resp.status} ${errText}`);
        throw new Error(`OpenAI error: ${resp.status}`);
      }
      const data = await resp.json();
      const text = ((data as any)?.text as string) || '';
      if (!text) {
        this.logger.warn('transcribeAudio: received empty transcript text');
      } else {
        this.logger.log(`transcribeAudio: transcript length=${text.length}`);
      }
      return { text };
    } catch (e: any) {
      this.logger.error(`transcribeAudio failed: ${e?.stack || e?.message || e}`);
      return { text: '' };
    }
  }
}
