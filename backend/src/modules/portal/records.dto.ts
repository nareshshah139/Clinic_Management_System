import { IsString, IsUUID, Length } from 'class-validator';

export class PortalMessageDto {
  @IsString()
  @Length(1, 2000)
  body!: string;

  /** Chosen once per message on the device, so a repeated submit adds nothing (PP-86). */
  @IsUUID()
  clientKey!: string;
}
