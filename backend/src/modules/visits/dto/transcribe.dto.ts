import { IsString, Matches, MaxLength } from 'class-validator';

export class LiveTranscriptionDto {
  @IsString()
  @MaxLength(20000)
  @Matches(/^v=0\r?\n/)
  sdp!: string;
}

export class SpeakerSplitDto {
  @IsString()
  @MaxLength(50000)
  text!: string;
}
