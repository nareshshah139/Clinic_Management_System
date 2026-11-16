// Repo path: backend/src/modules/voice/voice.dto.ts
// One body for every parse route. The per-intent length limit is checked in VoiceService against
// VOICE_TEXT_LIMITS, because the DTO is shared; MaxLength here is the largest limit, a cheap
// early stop before the service.

import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { ParseRequest } from '@cms/shared-types/voice';

export class ParseRequestDto implements ParseRequest {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @MaxLength(8000)
  text!: string;
}
