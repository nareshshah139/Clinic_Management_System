import { Module } from '@nestjs/common';
import { VoiceController } from './voice.controller';
import { VoiceService, VOICE_CHAT, openAiChat } from './voice.service';

// No ThrottlerModule or APP_GUARD here: AuthModule already registers both globally, and a second
// APP_GUARD would run the throttler twice on every route.
@Module({
  controllers: [VoiceController],
  providers: [VoiceService, { provide: VOICE_CHAT, useValue: openAiChat }],
})
export class VoiceModule {}
