import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { ParseRequest } from '@cms/shared-types/voice';

// MaxLength is the largest per-intent limit; VoiceService applies the exact one.
export class ParseRequestDto implements ParseRequest {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @MaxLength(8000)
  text!: string;
}
