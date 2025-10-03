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
  BadRequestException,
  ServiceUnavailableException,
  HttpException,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { VisitsService } from './visits.service';
import { CreateVisitDto, UpdateVisitDto, CompleteVisitDto } from './dto/create-visit.dto';
import { QueryVisitsDto, PatientVisitHistoryDto, DoctorVisitsDto } from './dto/query-visit.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { join } from 'path';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import type { Express, Response } from 'express';
import { Logger } from '@nestjs/common';

const fsPromises = fs.promises;

interface AuthenticatedRequest {
  user: {
    id: string;
    branchId: string;
    role: string;
  };
}

async function ensureUploadsDir() {
  const dir = join(process.cwd(), 'uploads', 'visits');
  await fsPromises.mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

async function writeVisitFile(targetDir: string, buffer: Buffer, preferredExt: string) {
  const ext = preferredExt.startsWith('.') ? preferredExt.toLowerCase() : `.${preferredExt.toLowerCase()}`;
  const unique = randomBytes(8).toString('hex');
  const filename = `${Date.now()}_${unique}${ext}`;
  await fsPromises.writeFile(join(targetDir, filename), buffer, { mode: 0o600 });
  return filename;
}

async function processImageUpload(file: Express.Multer.File) {
  if (!file || !file.buffer || file.size <= 0) {
    throw new BadRequestException('Empty file upload');
  }

  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || !detected.mime.startsWith('image/')) {
    throw new BadRequestException('Unsupported image type');
  }

  // Normalize unknown/HEIC-like formats to jpeg
  const normalizedExt = !detected.ext || ['heic', 'heif', 'tif', 'tiff'].includes(detected.ext) ? 'jpeg' : (detected.ext === 'jpg' ? 'jpeg' : detected.ext);
  const format = normalizedExt;

  try {
    const pipeline = sharp(file.buffer, { failOn: 'error' }).rotate().withMetadata({ exif: undefined });
    const { width = 0, height = 0 } = await pipeline.metadata();
    if (width * height > 40_000_000) {
      throw new BadRequestException('Image resolution too large');
    }
    const sanitizedBuffer = await pipeline.toFormat(format as keyof sharp.FormatEnum).toBuffer();

    return {
      buffer: sanitizedBuffer,
      ext: format,
    };
  } catch (error) {
    if (error instanceof HttpException) {
      throw error;
    }
    throw new BadRequestException('Failed to process image upload');
  }
}

async function ensurePatientDraftDir(patientId: string) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const dir = join(process.cwd(), 'uploads', 'patients', patientId, dateStr);
  await fsPromises.mkdir(dir, { recursive: true, mode: 0o700 });
  return { absPath: dir, dateStr };
}

function imageFileFilter(_req: any, file: any, cb: any) {
  if (!file || !file.mimetype) return cb(new BadRequestException('Invalid file'), false);
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
  if (!allowed.includes(file.mimetype)) {
    return cb(new BadRequestException('Only image files are allowed'), false);
  }
  return cb(null, true);
}

const VISIT_UPLOAD_LIMIT_BYTES = (() => {
  const mb = Number(process.env.UPLOAD_MAX_FILE_MB || 25);
  const safeMb = Number.isFinite(mb) && mb > 0 ? mb : 25;
  return safeMb * 1024 * 1024;
})();

const TRANSCRIBE_UPLOAD_LIMIT_BYTES = (() => {
  const mb = Number(process.env.TRANSCRIBE_MAX_FILE_MB || 10);
  const safeMb = Number.isFinite(mb) && mb > 0 ? mb : 10;
  return safeMb * 1024 * 1024;
})();

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
  @UseInterceptors(FilesInterceptor('files', 6, {
    storage: memoryStorage(),
    limits: {
      fileSize: VISIT_UPLOAD_LIMIT_BYTES,
      files: 6,
    },
    fileFilter: imageFileFilter,
  }))
  async uploadDraftPhotos(
    @Param('patientId') patientId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const { dateStr } = await ensurePatientDraftDir(patientId);
    let processedCount = 0;
    for (const file of files || []) {
      const { buffer, ext } = await processImageUpload(file);
      await this.visitsService.createDraftAttachment(patientId, dateStr, {
        preferredExt: ext,
        contentType: file.mimetype || 'image/jpeg',
        buffer,
      });
      processedCount += 1;
    }
    if (processedCount === 0) {
      throw new BadRequestException('No valid images uploaded');
    }
    this.logger.debug(`uploadDraftPhotos: processed ${processedCount}/${files?.length ?? 0} files for patient=${patientId}`);
    return this.visitsService.listDraftAttachments(patientId, dateStr);
  }

  @Get('photos/draft/:patientId')
  async listDraftPhotos(@Param('patientId') patientId: string) {
    const { dateStr } = await ensurePatientDraftDir(patientId);
    return this.visitsService.listDraftAttachments(patientId, dateStr);
  }

  @Get('photos/draft/:patientId/:dateStr/:attachmentId')
  async getDraftPhoto(
    @Param('patientId') patientId: string,
    @Param('dateStr') dateStr: string,
    @Param('attachmentId') attachmentId: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const { data, contentType } = await this.visitsService.getDraftAttachmentBinary(patientId, dateStr, attachmentId);
    if (res) {
      res.set({ 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' });
    }
    return new StreamableFile(data);
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

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.visitsService.remove(id, req.user.branchId);
  }

  @Post(':id/photos')
  @UseInterceptors(FilesInterceptor('files', 6, {
    storage: memoryStorage(),
    limits: {
      fileSize: VISIT_UPLOAD_LIMIT_BYTES,
      files: 6,
    },
    fileFilter: imageFileFilter,
  }))
  async uploadPhotos(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: AuthenticatedRequest,
  ) {
    let processedCount = 0;
    for (const file of files || []) {
      const { buffer, ext } = await processImageUpload(file);
      await this.visitsService.createVisitAttachment(id, req.user.branchId, {
        preferredExt: ext,
        contentType: file.mimetype || 'image/jpeg',
        buffer,
      });
      processedCount += 1;
    }
    if (processedCount === 0) {
      throw new BadRequestException('No valid images uploaded');
    }
    this.logger.debug(`uploadPhotos: processed ${processedCount}/${files?.length ?? 0} files for visit=${id}`);
    return this.visitsService.listAttachments(id, req.user.branchId);
  }

  @Get(':id/photos')
  listPhotos(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.visitsService.listAttachments(id, req.user.branchId);
  }

  @Get(':id/photos/:attachmentId')
  async getVisitPhoto(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const { data, contentType } = await this.visitsService.getVisitAttachmentBinary(id, attachmentId, req.user.branchId);
    if (res) {
      res.set({ 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' });
    }
    return new StreamableFile(data);
  }

  // Speech-to-text proxy to OpenAI Whisper
  @Post('transcribe')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: {
      fileSize: TRANSCRIBE_UPLOAD_LIMIT_BYTES,
      files: 1,
    },
  }))
  async transcribeAudio(
    @UploadedFile() file: Express.Multer.File,
    @Request() _req: AuthenticatedRequest,
  ) {
    if (!file || !file.buffer) {
      this.logger.warn('transcribeAudio: no file buffer provided');
      return { text: '' };
    }
    if ((file.size || 0) <= 0) {
      throw new BadRequestException('Empty audio upload');
    }
    const allowedAudioTypes = ['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg'];
    if (!file.mimetype || !allowedAudioTypes.includes(file.mimetype)) {
      throw new BadRequestException('Unsupported audio type');
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn('transcribeAudio skipped: OPENAI_API_KEY is not configured');
      throw new ServiceUnavailableException('Speech transcription is unavailable. Contact an administrator to configure OPENAI_API_KEY.');
    }
    try {
      // Build multipart form-data for OpenAI Whisper using native undici FormData/Blob
      const form = new FormData();
      const arrayBuffer = await (file.buffer as Buffer).buffer.slice(0);
      const blob = new Blob([arrayBuffer], { type: file.mimetype || 'audio/webm' });
      form.append('file', blob, file.originalname || 'audio.webm');
      form.append('model', 'whisper-1');

      this.logger.debug('transcribeAudio: sending audio to OpenAI Whisper');
      const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        } as any,
        body: form as any,
      });
      this.logger.debug(`transcribeAudio: OpenAI responded status=${resp.status}`);
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
        this.logger.debug(`transcribeAudio: transcript length=${text.length}`);
      }
      return { text };
    } catch (e: any) {
      this.logger.error(`transcribeAudio failed: ${e?.stack || e?.message || e}`);
      return { text: '' };
    }
  }

  @Post('translate')
  async translateTexts(
    @Body()
    body: {
      target: 'HI' | 'TE';
      texts: string[];
    },
  ) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn('translateTexts skipped: OPENAI_API_KEY is not configured');
      throw new ServiceUnavailableException('Translation is unavailable. Configure OPENAI_API_KEY.');
    }

    const target = body?.target;
    const texts = Array.isArray(body?.texts) ? body.texts : [];
    if (!target || !['HI', 'TE'].includes(target) || texts.length === 0) {
      throw new BadRequestException('Invalid request. Provide target (HI|TE) and non-empty texts array.');
    }

    // Limit payload size defensively
    const MAX_ITEMS = 200;
    const MAX_TOTAL_CHARS = 8000;
    const limited = texts.slice(0, MAX_ITEMS);
    const totalChars = limited.reduce((sum, s) => sum + (typeof s === 'string' ? s.length : 0), 0);
    if (totalChars > MAX_TOTAL_CHARS) {
      throw new BadRequestException('Total text too large for translation. Reduce content.');
    }

    const langName = target === 'HI' ? 'Hindi' : 'Telugu';
    try {
      const messages = [
        {
          role: 'system',
          content:
            'You are a medical translation assistant. Translate patient-facing clinical free-form text clearly and simply. Preserve medication names, numbers, units, and formatting. Return strict JSON with a translations string array in the same order as input. No extra commentary.',
        },
        {
          role: 'user',
          content: JSON.stringify({ target: langName, texts: limited }),
        },
      ];

      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_TRANSLATION_MODEL || 'gpt-4o-mini',
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        this.logger.error(`translateTexts OpenAI error: ${resp.status} ${errText}`);
        throw new ServiceUnavailableException('Translation service error');
      }
      const data = (await resp.json()) as any;
      const content = data?.choices?.[0]?.message?.content || '';
      let parsed: any = null;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        this.logger.error('translateTexts: failed to parse JSON response from OpenAI');
        throw new ServiceUnavailableException('Failed to parse translation response');
      }
      const translations = Array.isArray(parsed?.translations)
        ? (parsed.translations as string[]).map((s) => (typeof s === 'string' ? s : ''))
        : [];
      if (translations.length !== limited.length) {
        this.logger.warn(
          `translateTexts: mismatched translations count. expected=${limited.length} got=${translations.length}`,
        );
      }
      return { translations };
    } catch (e: any) {
      this.logger.error(`translateTexts failed: ${e?.stack || e?.message || e}`);
      throw new ServiceUnavailableException('Translation failed');
    }
  }
}
