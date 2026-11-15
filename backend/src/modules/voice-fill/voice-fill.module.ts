import { Module } from '@nestjs/common';
import { VoiceFillController } from './voice-fill.controller';
import { VoiceFillService } from './voice-fill.service';

@Module({
  controllers: [VoiceFillController],
  providers: [VoiceFillService],
})
export class VoiceFillModule {}
