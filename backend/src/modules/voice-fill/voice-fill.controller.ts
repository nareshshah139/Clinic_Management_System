import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CLINIC_STAFF_ROLES } from '../../shared/decorators/clinic-staff-roles';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { VoiceFillTextDto } from './voice-fill-text.dto';
import { findVoiceFillForm, VOICE_FILL_ROUTE_ROLES, type VoiceFillForm } from './voice-fill.registry';
import { VoiceFillService, type VoiceFillAudioExtension } from './voice-fill.service';

const AUDIO_EXTENSIONS: Record<string, VoiceFillAudioExtension> = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

const audioExtension = (mimetype: string): VoiceFillAudioExtension | undefined =>
  Object.hasOwn(AUDIO_EXTENSIONS, mimetype) ? AUDIO_EXTENSIONS[mimetype] : undefined;

const configuredMaxMb = Number(process.env.VOICE_FILL_MAX_AUDIO_MB);
const MAX_AUDIO_BYTES = (Number.isFinite(configuredMaxMb) && configuredMaxMb > 0 ? configuredMaxMb : 25) * 1024 * 1024;

function authorizedForm(formId: string, role: string): VoiceFillForm {
  const form = findVoiceFillForm(formId);
  if (!form) throw new NotFoundException('Unknown form');
  if (!(form.roles as readonly string[]).includes(role)) {
    throw new ForbiddenException('Your role cannot use voice fill on this form');
  }
  return form;
}

@ApiTags('Voice Fill')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('voice-fill')
export class VoiceFillController {
  constructor(private readonly voiceFill: VoiceFillService) {}

  @Get('status')
  @Roles(...CLINIC_STAFF_ROLES)
  async status() {
    return { available: await this.voiceFill.isAvailable() };
  }

  @Post(':form')
  @HttpCode(200)
  @Roles(...VOICE_FILL_ROUTE_ROLES)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
      fileFilter: (_req, file, accept) =>
        audioExtension(file.mimetype)
          ? accept(null, true)
          : accept(new BadRequestException('Upload a webm, ogg, m4a, mp3 or wav audio recording.'), false),
    }),
  )
  async fill(
    @Param('form') formId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Request() req: { user: { role: string } },
  ) {
    const form = authorizedForm(formId, req.user.role);
    const extension = file && file.size > 0 ? audioExtension(file.mimetype) : undefined;
    if (!file || !extension) throw new BadRequestException('Attach a non-empty audio recording as "file".');
    return this.voiceFill.fill(formId, form, { bytes: file.buffer, extension });
  }

  /**
   * @cc [owner:nareshshah139,label:security] voice-fill-text-same-policy
   * The typed route MUST enforce the same unknown-form 404 and per-form role 403 as the audio route before any model call. It MUST NOT log the submitted text.
   */
  @Post(':form/text')
  @HttpCode(200)
  @Roles(...VOICE_FILL_ROUTE_ROLES)
  async fillText(
    @Param('form') formId: string,
    @Body() body: VoiceFillTextDto,
    @Request() req: { user: { role: string } },
  ) {
    const form = authorizedForm(formId, req.user.role);
    return this.voiceFill.fillText(formId, form, body.text);
  }
}
