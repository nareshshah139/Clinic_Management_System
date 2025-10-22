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
import { Roles } from '../../shared/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage, diskStorage } from 'multer';
import { join } from 'path';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import { tmpdir } from 'os';
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

  // Normalize to performant formats: convert HEIC/HEIF/TIFF/GIF/JPG to JPEG
  const normalizedExt = !detected.ext || ['heic', 'heif', 'tif', 'tiff', 'gif'].includes(detected.ext)
    ? 'jpeg'
    : (detected.ext === 'jpg' ? 'jpeg' : detected.ext);
  const format = normalizedExt;

  try {
    const pipeline = sharp(file.buffer, { failOn: 'error' }).rotate().withMetadata({ exif: undefined });
    const { width = 0, height = 0 } = await pipeline.metadata();
    let working = pipeline;
    // Cap to 40MP and limit max dimension to ~1600px to reduce size/time significantly
    const MAX_PIXELS = 40_000_000;
    const MAX_DIM = 1600;
    const pixelScale = width * height > MAX_PIXELS ? Math.sqrt(MAX_PIXELS / (width * height)) : 1;
    const dimScale = Math.min(
      width > 0 ? MAX_DIM / width : 1,
      height > 0 ? MAX_DIM / height : 1,
      1,
    );
    const scale = Math.min(pixelScale, dimScale, 1);
    if (scale < 1) {
      const targetWidth = Math.max(1, Math.floor((width || 1) * scale));
      const targetHeight = Math.max(1, Math.floor((height || 1) * scale));
      working = working.resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true });
    }

    // Apply sensible compression for faster uploads and smaller storage
    if (format === 'jpeg') {
      working = working.jpeg({ quality: 75, mozjpeg: true });
    } else if (format === 'webp') {
      working = working.webp({ quality: 70 });
    } else if (format === 'png') {
      working = working.png({ compressionLevel: 9 });
    }

    const sanitizedBuffer = await working.toFormat(format as keyof sharp.FormatEnum).toBuffer();

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

async function ensureTranscribeTmpDir() {
  const base = join(process.cwd(), 'uploads', 'tmp', 'transcribe');
  await fsPromises.mkdir(base, { recursive: true, mode: 0o700 });
  return base;
}

async function ensureTranscribeSessionDir() {
  const base = join(process.cwd(), 'uploads', 'tmp', 'transcribe', 'sessions');
  await fsPromises.mkdir(base, { recursive: true, mode: 0o700 });
  return base;
}

async function readJsonSafe(path: string) {
  try {
    const buf = await fsPromises.readFile(path);
    return JSON.parse(buf.toString('utf8'));
  } catch {
    return null;
  }
}

async function writeJsonSafe(path: string, data: unknown) {
  const tmp = `${path}.tmp-${Date.now()}`;
  await fsPromises.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
  await fsPromises.rename(tmp, path);
}

function imageFileFilter(_req: any, file: any, cb: any) {
  if (!file || !file.mimetype) return cb(new BadRequestException('Invalid file'), false);
  if (!/^image\//i.test(file.mimetype)) return cb(new BadRequestException('Only image files are allowed'), false);
  return cb(null, true);
}

const VISIT_UPLOAD_LIMIT_BYTES = (() => {
  const mb = Number(process.env.UPLOAD_MAX_FILE_MB || 25);
  const safeMb = Number.isFinite(mb) && mb > 0 ? mb : 25;
  return safeMb * 1024 * 1024;
})();

const TRANSCRIBE_UPLOAD_LIMIT_BYTES = (() => {
  const mb = Number(process.env.TRANSCRIBE_MAX_FILE_MB || 100);
  const safeMb = Number.isFinite(mb) && mb > 0 ? mb : 100;
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
  @Roles(UserRole.DOCTOR, UserRole.ADMIN, UserRole.OWNER)
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
    @Body() body?: any,
  ) {
    const { dateStr } = await ensurePatientDraftDir(patientId);
    const parsePositions = (): string[] => {
      const allowed = new Set(['FRONT','LEFT_PROFILE','RIGHT_PROFILE','BACK','CLOSE_UP','OTHER']);
      let positions: unknown = body?.positions ?? body?.['positions[]'] ?? body?.position ?? body?.['position[]'];
      if (typeof positions === 'string') {
        try {
          const parsed = JSON.parse(positions);
          positions = parsed;
        } catch {
          positions = (positions as string).split(',').map((s: string) => s.trim());
        }
      }
      const fileCount = files?.length || 0;
      let arr: string[] = Array.isArray(positions) ? (positions as any[]).map(v => typeof v === 'string' ? v.toUpperCase() : '') : [];
      if (arr.length < fileCount) arr = arr.concat(Array(fileCount - arr.length).fill(''));
      if (arr.length > fileCount) arr = arr.slice(0, fileCount);
      const normalized = arr.map(p => (allowed.has(p) ? p : 'OTHER')) as string[];
      return normalized;
    };

    if (!files || files.length === 0) throw new BadRequestException('No files provided');
    const positions = parsePositions();

    const results = await Promise.allSettled(
      files.map(async (file, idx) => {
        const position = positions[idx] as any;
        const { buffer, ext } = await processImageUpload(file);
        const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        await this.visitsService.createDraftAttachment(patientId, dateStr, {
          preferredExt: ext,
          contentType,
          buffer,
          position,
          displayOrder: this.positionOrderValue(position),
        });
      }),
    );
    const processedCount = results.filter(r => r.status === 'fulfilled').length;
    results.forEach((r, idx) => {
      if (r.status === 'rejected') {
        const file = files[idx];
        this.logger?.warn?.(`uploadDraftPhotos: skipping file idx=${idx} name=${file?.originalname || 'n/a'} reason=${(r.reason as any)?.message || r.reason}`);
      }
    });
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

  @Delete('photos/draft/:patientId/:dateStr/:attachmentId')
  async deleteDraftPhoto(
    @Param('patientId') patientId: string,
    @Param('dateStr') dateStr: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    await this.visitsService.deleteDraftAttachment(patientId, dateStr, attachmentId);
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
  @Roles(UserRole.DOCTOR, UserRole.ADMIN, UserRole.OWNER)
  update(
    @Param('id') id: string,
    @Body() updateVisitDto: UpdateVisitDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.visitsService.update(id, updateVisitDto, req.user.branchId);
  }

  @Post(':id/complete')
  @Roles(UserRole.DOCTOR, UserRole.ADMIN, UserRole.OWNER)
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
    @Body() body?: any,
  ) {
    const parsePositions = (): string[] => {
      const allowed = new Set(['FRONT','LEFT_PROFILE','RIGHT_PROFILE','BACK','CLOSE_UP','OTHER']);
      let positions: unknown = body?.positions ?? body?.['positions[]'] ?? body?.position ?? body?.['position[]'];
      if (typeof positions === 'string') {
        try {
          const parsed = JSON.parse(positions);
          positions = parsed;
        } catch {
          positions = (positions as string).split(',').map((s: string) => s.trim());
        }
      }
      const fileCount = files?.length || 0;
      let arr: string[] = Array.isArray(positions) ? (positions as any[]).map(v => typeof v === 'string' ? v.toUpperCase() : '') : [];
      if (arr.length < fileCount) arr = arr.concat(Array(fileCount - arr.length).fill(''));
      if (arr.length > fileCount) arr = arr.slice(0, fileCount);
      const normalized = arr.map(p => (allowed.has(p) ? p : 'OTHER')) as string[];
      return normalized;
    };

    if (!files || files.length === 0) throw new BadRequestException('No files provided');
    const positions = parsePositions();

    const results = await Promise.allSettled(
      files.map(async (file, idx) => {
        const position = positions[idx] as any;
        const { buffer, ext } = await processImageUpload(file);
        const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        await this.visitsService.createVisitAttachment(id, req.user.branchId, {
          preferredExt: ext,
          contentType,
          buffer,
          position,
          displayOrder: this.positionOrderValue(position),
        });
      }),
    );
    const processedCount = results.filter(r => r.status === 'fulfilled').length;
    results.forEach((r, idx) => {
      if (r.status === 'rejected') {
        const file = files[idx];
        this.logger?.warn?.(`uploadPhotos: skipping file idx=${idx} name=${file?.originalname || 'n/a'} reason=${(r.reason as any)?.message || r.reason}`);
      }
    });
    if (processedCount === 0) {
      throw new BadRequestException('No valid images uploaded');
    }
    this.logger.debug(`uploadPhotos: processed ${processedCount}/${files?.length ?? 0} files for visit=${id}`);
    return this.visitsService.listAttachments(id, req.user.branchId);
  }

  private positionOrderValue(position?: string): number {
    switch ((position || 'OTHER').toUpperCase()) {
      case 'FRONT': return 1;
      case 'LEFT_PROFILE': return 2;
      case 'RIGHT_PROFILE': return 3;
      case 'BACK': return 4;
      case 'CLOSE_UP': return 5;
      default: return 99;
    }
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

  @Delete(':id/photos/:attachmentId')
  @Roles(UserRole.DOCTOR)
  async deleteVisitPhoto(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.visitsService.deleteVisitAttachment(id, attachmentId, req.user.branchId);
    return this.visitsService.listAttachments(id, req.user.branchId);
  }

  @Delete(':id/photos/legacy')
  @Roles(UserRole.DOCTOR)
  async deleteLegacyPhoto(
    @Param('id') id: string,
    @Body() body: { url?: string },
    @Request() req: AuthenticatedRequest,
  ) {
    const url = typeof body?.url === 'string' ? body.url : '';
    if (!url) {
      throw new BadRequestException('Missing url');
    }
    await this.visitsService.deleteLegacyAttachment(id, url, req.user.branchId);
    return this.visitsService.listAttachments(id, req.user.branchId);
  }

  // Speech-to-text proxy to OpenAI Transcription API
  @Post('transcribe')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: async (_req, _file, cb) => {
        try {
          const dir = await ensureTranscribeTmpDir();
          cb(null, dir);
        } catch (e) {
          cb(e as any, undefined as any);
        }
      },
      filename: (_req, file, cb) => {
        const base = file.originalname?.split(/[\/]/).pop() || 'audio';
        const unique = `${Date.now()}_${randomBytes(6).toString('hex')}`;
        const ext = (base.includes('.') ? base.slice(base.lastIndexOf('.')) : '.bin');
        cb(null, `${unique}${ext}`);
      },
    }),
    limits: {
      fileSize: TRANSCRIBE_UPLOAD_LIMIT_BYTES,
      files: 1,
    },
  }))
  async transcribeAudio(
    @UploadedFile() file: Express.Multer.File,
    @Request() _req: AuthenticatedRequest,
  ) {
    if (!file) {
      this.logger.warn('transcribeAudio: no file provided');
      return { text: '' };
    }
    if ((file.size || 0) <= 0) {
      throw new BadRequestException('Empty audio upload');
    }
    const allowedAudioTypes = ['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/x-m4a', 'audio/m4a'];
    if (!file.mimetype || !allowedAudioTypes.includes(file.mimetype)) {
      throw new BadRequestException('Unsupported audio type');
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn('transcribeAudio skipped: OPENAI_API_KEY is not configured');
      throw new ServiceUnavailableException('Speech transcription is unavailable. Contact an administrator to configure OPENAI_API_KEY.');
    }
    let tempFilePath: string | undefined = (file as any)?.path || (file as any)?.filename; // multer diskStorage sets path
    try {
      // Build multipart form-data for OpenAI Transcriptions using native undici FormData/Blob
      const form = new FormData();
      let displayName = file.originalname || 'audio.webm';
      if (typeof displayName !== 'string' || !displayName) displayName = 'audio.webm';
      // Read from disk to avoid keeping upload in memory
      const pathToRead = tempFilePath ? join((file as any).destination || '', (file as any).filename) : undefined;
      const fileBuf = await fsPromises.readFile(pathToRead || (file as any).path || '');
      const uint8 = new Uint8Array(fileBuf);
      const blob = new Blob([uint8], { type: file.mimetype || 'audio/webm' });
      form.append('file', blob, displayName);
      const transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe';
      form.append('model', transcribeModel);
      // Improve accuracy by fixing language and disabling sampling randomness
      // Note: Whisper ignores temperature for most use-cases, but passing 0 is safe
      try { form.append('language', 'en'); } catch {}
      try { form.append('temperature', '0'); } catch {}
      try {
        const transcriptionPrompt =
          'Medical doctor–patient conversation transcription. ' +
          'Preserve punctuation, numbers, and units exactly (e.g., 120/80 mmHg). ' +
          'Use medical spellings; prefer Indian English when applicable. ' +
          'Expand unambiguous abbreviations (BP → blood pressure, HR → heart rate); keep ambiguous ones verbatim. ' +
          'Normalize medication mentions when clearly stated (e.g., azithromycin 500 mg PO OD x3 days). ' +
          'Do not add speaker tags or commentary; output only the transcript text.';
        form.append('prompt', transcriptionPrompt);
      } catch {}
      // Prefer structured output when supported (Whisper supports verbose_json). Safe to ignore if model does not support.
      try { form.append('response_format', 'verbose_json'); } catch {}

      this.logger.debug(`transcribeAudio: sending audio to OpenAI with model=${transcribeModel}`);
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

      // Attempt speaker separation via LLM on transcript or segments
      let diarized: { segments?: Array<{ speaker: 'DOCTOR' | 'PATIENT'; text: string; start_s?: number | null; end_s?: number | null; confidence?: number }>; doctorText?: string; patientText?: string } | null = null;
      try {
        // Build minimal segments if detailed segments are present in response
        const rawSegments: Array<{ text?: string; start?: number; end?: number }> = Array.isArray((data as any)?.segments)
          ? ((data as any).segments as Array<any>)
          : [];
        const input = rawSegments.length > 0
          ? { segments: rawSegments.map(s => ({ text: typeof s?.text === 'string' ? s.text : '', start_s: typeof s?.start === 'number' ? s.start : null, end_s: typeof s?.end === 'number' ? s.end : null })) }
          : { transcript: text };

        const messages = [
          {
            role: 'system',
            content:
              'You are a medical scribe. Given a clinical conversation (full transcript or segments), split into speaker turns labeled DOCTOR or PATIENT only. ' +
              'Cues: questions/instructions/orders/examination → DOCTOR; symptoms/history/concerns → PATIENT. ' +
              'Preserve medical terms, numbers, and units verbatim. ' +
              'Return STRICT JSON with keys: segments (array of {speaker, text, confidence, start_s, end_s}), and speakers ({doctorText, patientText}). ' +
              'Concatenate segments chronologically for doctorText and patientText. If timestamps are provided in input, propagate them; otherwise use null. No extra commentary.',
          },
          { role: 'user', content: JSON.stringify(input) },
        ];

        const diarizeModel = process.env.OPENAI_DIARIZATION_MODEL || 'gpt-4o';

        const diarizationJsonSchema = {
          name: 'DiarizationSchema',
          schema: {
            type: 'object',
            required: ['segments', 'speakers'],
            properties: {
              segments: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['speaker', 'text'],
                  properties: {
                    speaker: { type: 'string', enum: ['DOCTOR', 'PATIENT'] },
                    text: { type: 'string' },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    start_s: { type: ['number', 'null'] },
                    end_s: { type: ['number', 'null'] },
                  },
                },
              },
              speakers: {
                type: 'object',
                required: ['doctorText', 'patientText'],
                properties: {
                  doctorText: { type: 'string' },
                  patientText: { type: 'string' },
                },
              },
            },
          },
          strict: true,
        } as const;
        const diarizeResp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: diarizeModel,
            temperature: 0,
            response_format: { type: 'json_schema', json_schema: diarizationJsonSchema },
            messages,
          }),
        });
        if (!diarizeResp.ok) {
          const errText = await diarizeResp.text();
          this.logger.warn(`transcribeAudio diarization step failed: ${diarizeResp.status} ${errText}`);
        } else {
          const dj = (await diarizeResp.json()) as any;
          const content = dj?.choices?.[0]?.message?.content || '{}';
          try {
            const parsed = JSON.parse(content);
            const segs = Array.isArray(parsed?.segments) ? parsed.segments as Array<any> : [];
            const normalized = segs
              .map(s => ({
                speaker: (typeof s?.speaker === 'string' && s.speaker.toUpperCase().includes('DOC')) ? 'DOCTOR' : (s?.speaker === 'PATIENT' ? 'PATIENT' : 'PATIENT'),
                text: typeof s?.text === 'string' ? s.text : '',
                confidence: typeof s?.confidence === 'number' ? s.confidence : undefined,
                start_s: (typeof s?.start_s === 'number' || s?.start_s === null) ? s.start_s : undefined,
                end_s: (typeof s?.end_s === 'number' || s?.end_s === null) ? s.end_s : undefined,
              }))
              .filter(s => s.text);
            const doctorText = (parsed?.doctorText && typeof parsed.doctorText === 'string')
              ? parsed.doctorText
              : normalized.filter(s => s.speaker === 'DOCTOR').map(s => s.text).join(' ');
            const patientText = (parsed?.patientText && typeof parsed.patientText === 'string')
              ? parsed.patientText
              : normalized.filter(s => s.speaker === 'PATIENT').map(s => s.text).join(' ');
            diarized = { segments: normalized, doctorText, patientText };
          } catch (e) {
            this.logger.warn('transcribeAudio diarization: failed to parse JSON content');
          }
        }
      } catch (e) {
        this.logger.warn(`transcribeAudio diarization step error: ${(e as any)?.message || e}`);
      }

      const result = {
        text,
        segments: diarized?.segments || [],
        speakers: {
          doctorText: diarized?.doctorText || '',
          patientText: diarized?.patientText || '',
        },
      };
      return result;
    } catch (e: any) {
      this.logger.error(`transcribeAudio failed: ${e?.stack || e?.message || e}`);
      return { text: '' };
    }
    finally {
      try {
        if ((file as any)?.path || (file as any)?.filename) {
          const p = (file as any).path || join((file as any).destination || '', (file as any).filename);
          if (p) await fsPromises.unlink(p).catch(() => {});
        }
      } catch {}
    }
  }

  // Start a chunked transcription session
  @Post('transcribe/chunk-start')
  async startTranscriptionSession() {
    const sessionDir = await ensureTranscribeSessionDir();
    const id = `${Date.now()}_${randomBytes(8).toString('hex')}`;
    const path = join(sessionDir, `${id}.json`);
    const payload = { id, createdAt: Date.now(), chunks: [] as any[] };
    await writeJsonSafe(path, payload);
    return { sessionId: id };
  }

  // Upload a chunk for transcription (no diarization; we store raw segments)
  @Post('transcribe/chunk')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: async (_req, _file, cb) => {
        try {
          const dir = await ensureTranscribeTmpDir();
          cb(null, dir);
        } catch (e) {
          cb(e as any, undefined as any);
        }
      },
      filename: (_req, file, cb) => {
        const base = file.originalname?.split(/[\\/]/).pop() || 'audio';
        const unique = `${Date.now()}_${randomBytes(6).toString('hex')}`;
        const ext = (base.includes('.') ? base.slice(base.lastIndexOf('.')) : '.bin');
        cb(null, `${unique}${ext}`);
      },
    }),
    limits: {
      fileSize: TRANSCRIBE_UPLOAD_LIMIT_BYTES,
      files: 1,
    },
  }))
  async uploadTranscriptionChunk(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { sessionId?: string; chunkIndex?: number; startMs?: number; endMs?: number },
  ) {
    if (!file) throw new BadRequestException('No file provided');
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('OPENAI_API_KEY not configured');
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
    if (!sessionId) throw new BadRequestException('Missing sessionId');
    const sessionDir = await ensureTranscribeSessionDir();
    const sessionPath = join(sessionDir, `${sessionId}.json`);
    const current = await readJsonSafe(sessionPath);
    if (!current || !current.id) throw new BadRequestException('Invalid session');

    const transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe';
    const form = new FormData();
    const fileBuf = await fsPromises.readFile((file as any).path || join((file as any).destination || '', (file as any).filename));
    const uint8 = new Uint8Array(fileBuf);
    const blob = new Blob([uint8], { type: file.mimetype || 'audio/webm' });
    form.append('file', blob, file.originalname || 'audio.webm');
    form.append('model', transcribeModel);
    try { form.append('language', 'en'); } catch {}
    try { form.append('temperature', '0'); } catch {}
    try { form.append('response_format', 'verbose_json'); } catch {}

    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` } as any,
      body: form as any,
    });
    if (!resp.ok) {
      const errText = await resp.text();
      this.logger.error(`transcribe/chunk OpenAI error: ${resp.status} ${errText}`);
      throw new ServiceUnavailableException('Transcription chunk failed');
    }
    const data = await resp.json();
    const text = ((data as any)?.text as string) || '';
    const rawSegs = Array.isArray((data as any)?.segments) ? ((data as any).segments as Array<any>) : [];
    const startMs = Number.isFinite(body?.startMs) ? Number(body?.startMs) : 0;
    const endMs = Number.isFinite(body?.endMs) ? Number(body?.endMs) : (startMs || 0);
    const offsetS = Math.max(0, Math.floor(startMs) / 1000);

    const entry = {
      index: Number.isFinite(body?.chunkIndex) ? Number(body?.chunkIndex) : (current.chunks.length || 0),
      start_s_offset: offsetS,
      end_s_offset: Math.max(offsetS, Math.floor(endMs) / 1000),
      text,
      segments: rawSegs.map(s => ({
        text: typeof s?.text === 'string' ? s.text : '',
        start_s: typeof s?.start === 'number' ? s.start : null,
        end_s: typeof s?.end === 'number' ? s.end : null,
      })),
    };
    current.chunks.push(entry);
    await writeJsonSafe(sessionPath, current);
    try { if ((file as any)?.path) await fsPromises.unlink((file as any).path).catch(() => {}); } catch {}
    return { ok: true };
  }

  // Complete the session: merge chunks and run diarization once on combined segments
  @Post('transcribe/chunk-complete')
  async completeTranscriptionSession(
    @Body() body: { sessionId?: string },
  ) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('OPENAI_API_KEY not configured');
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
    if (!sessionId) throw new BadRequestException('Missing sessionId');
    const sessionDir = await ensureTranscribeSessionDir();
    const sessionPath = join(sessionDir, `${sessionId}.json`);
    const current = await readJsonSafe(sessionPath);
    if (!current || !Array.isArray(current?.chunks)) throw new BadRequestException('Invalid session');

    const chunks = [...current.chunks].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const combinedText = chunks.map((c: any) => typeof c.text === 'string' ? c.text : '').filter(Boolean).join(' ');
    const combinedSegments = chunks.flatMap((c: any) => {
      const off = Number(c?.start_s_offset) || 0;
      const segs = Array.isArray(c?.segments) ? c.segments : [];
      return segs.map((s: any) => ({
        text: typeof s?.text === 'string' ? s.text : '',
        start_s: (typeof s?.start_s === 'number' ? s.start_s : null),
        end_s: (typeof s?.end_s === 'number' ? s.end_s : null),
        // adjusted values for downstream use
        adj_start_s: (typeof s?.start_s === 'number' ? s.start_s + off : null),
        adj_end_s: (typeof s?.end_s === 'number' ? s.end_s + off : null),
      }));
    });

    // Build diarization input
    const input = combinedSegments.length > 0
      ? { segments: combinedSegments.map(s => ({ text: s.text, start_s: s.adj_start_s, end_s: s.adj_end_s })) }
      : { transcript: combinedText };

    const messages = [
      {
        role: 'system',
        content:
          'You are a medical scribe. Given a clinical conversation (full transcript or segments), split into speaker turns labeled DOCTOR or PATIENT only. '
          + 'Cues: questions/instructions/orders/examination → DOCTOR; symptoms/history/concerns → PATIENT. '
          + 'Preserve medical terms, numbers, and units verbatim. '
          + 'Return STRICT JSON with keys: segments (array of {speaker, text, confidence, start_s, end_s}), and speakers ({doctorText, patientText}). '
          + 'Concatenate segments chronologically for doctorText and patientText. If timestamps are provided in input, propagate them; otherwise use null. No extra commentary.',
      },
      { role: 'user', content: JSON.stringify(input) },
    ];
    const diarizeModel = process.env.OPENAI_DIARIZATION_MODEL || 'gpt-4o';
    const diarizationJsonSchema = {
      name: 'DiarizationSchema',
      schema: {
        type: 'object',
        required: ['segments', 'speakers'],
        properties: {
          segments: {
            type: 'array',
            items: {
              type: 'object',
              required: ['speaker', 'text'],
              properties: {
                speaker: { type: 'string', enum: ['DOCTOR', 'PATIENT'] },
                text: { type: 'string' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                start_s: { type: ['number', 'null'] },
                end_s: { type: ['number', 'null'] },
              },
            },
          },
          speakers: {
            type: 'object',
            required: ['doctorText', 'patientText'],
            properties: {
              doctorText: { type: 'string' },
              patientText: { type: 'string' },
            },
          },
        },
      },
      strict: true,
    } as const;

    const diarizeResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: diarizeModel,
        temperature: 0,
        response_format: { type: 'json_schema', json_schema: diarizationJsonSchema },
        messages,
      }),
    });
    if (!diarizeResp.ok) {
      const errText = await diarizeResp.text();
      this.logger.warn(`transcribe/chunk-complete diarization failed: ${diarizeResp.status} ${errText}`);
      // fallback: return combined text only
      return { text: combinedText, segments: [], speakers: { doctorText: '', patientText: '' } };
    }
    const dj = (await diarizeResp.json()) as any;
    const content = dj?.choices?.[0]?.message?.content || '{}';
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch {}
    const segs = Array.isArray(parsed?.segments) ? parsed.segments as Array<any> : [];
    const normalized = segs.map(s => ({
      speaker: (typeof s?.speaker === 'string' && s.speaker.toUpperCase().includes('DOC')) ? 'DOCTOR' : 'PATIENT',
      text: typeof s?.text === 'string' ? s.text : '',
      confidence: typeof s?.confidence === 'number' ? s.confidence : undefined,
      start_s: (typeof s?.start_s === 'number' || s?.start_s === null) ? s.start_s : undefined,
      end_s: (typeof s?.end_s === 'number' || s?.end_s === null) ? s.end_s : undefined,
    })).filter((s: any) => s.text);
    const doctorText = (parsed?.speakers?.doctorText && typeof parsed.speakers.doctorText === 'string')
      ? parsed.speakers.doctorText
      : normalized.filter((s: any) => s.speaker === 'DOCTOR').map((s: any) => s.text).join(' ');
    const patientText = (parsed?.speakers?.patientText && typeof parsed.speakers.patientText === 'string')
      ? parsed.speakers.patientText
      : normalized.filter((s: any) => s.speaker === 'PATIENT').map((s: any) => s.text).join(' ');

    // Optionally clean up session file after completion
    try { await fsPromises.unlink(sessionPath).catch(() => {}); } catch {}

    return { text: combinedText, segments: normalized, speakers: { doctorText, patientText } };
  }

  // Extract lab results from an uploaded image using OpenAI Vision
  @Post('labs/autofill')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    fileFilter: imageFileFilter,
    limits: {
      fileSize: VISIT_UPLOAD_LIMIT_BYTES,
      files: 1,
    },
  }))
  async autofillLabsFromImage(
    @UploadedFile() file: Express.Multer.File,
    @Request() _req: AuthenticatedRequest,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('No image provided');
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn('labs/autofill skipped: OPENAI_API_KEY is not configured');
      throw new ServiceUnavailableException('AI autofill is unavailable. Contact an administrator to configure OPENAI_API_KEY.');
    }

    // Normalize image and build data URL for OpenAI Vision
    const processed = await processImageUpload(file);
    const base64 = processed.buffer.toString('base64');
    const mime = `image/${processed.ext || 'jpeg'}`;
    const dataUrl = `data:${mime};base64,${base64}`;

    const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';

    const system =
      'You are a medical lab report extraction assistant. Extract lab test results from the provided report image. ' +
      'Return STRICT JSON with a top-level key "labs". The value must be an object mapping test names to either: ' +
      '(a) a number with unit via {"value": number, "unit": string}, or (b) an object of subtests each with {"value", "unit"}. ' +
      'Prefer standard units: CBC->Hb g/dL, WBC 10^9/L, Platelets 10^9/L; LFT->AST/ALT U/L, Bilirubin mg/dL; ' +
      'RFT->Urea mg/dL, Creatinine mg/dL; Lipid Profile->TC/TG/HDL/LDL mg/dL; Thyroid Profile->TSH µIU/mL, T3/T4 ng/dL; ' +
      'HbA1c %; Vitamin D ng/mL; Vitamin B12 pg/mL; Ferritin ng/mL. ' +
      'Do not include commentary. Use null for missing values. Avoid strings like "N/A".';

    const messages: any[] = [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract structured lab results as per the schema.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ];

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      this.logger.error(`labs/autofill OpenAI error: ${resp.status} ${errText}`);
      throw new ServiceUnavailableException('Failed to extract lab results');
    }

    const data = (await resp.json()) as any;
    const content = data?.choices?.[0]?.message?.content || '{}';
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      this.logger.error('labs/autofill: failed to parse JSON response from OpenAI');
      throw new ServiceUnavailableException('Invalid AI response');
    }

    const labs = parsed?.labs ?? parsed ?? {};
    return { labs };
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
