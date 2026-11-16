// Repo path: backend/src/modules/voice/voice.module.ts
// Registered in app.module.ts `fullFeatureModules` (app.module.ts:52), not in minimalModules (:73).
// Does NOT import ThrottlerModule or provide another APP_GUARD: both are already global through
// AuthModule (auth.module.ts:12-17, :33-36). A second forRoot would compete for the same @Global
// options token and a second APP_GUARD would run the throttler twice on every route in the app.

import { Module } from '@nestjs/common';
import { VoiceController } from './voice.controller';
import { VoiceService, VOICE_CHAT, openAiChat } from './voice.service';

@Module({
  controllers: [VoiceController],
  providers: [VoiceService, { provide: VOICE_CHAT, useValue: openAiChat }],
})
export class VoiceModule {}
