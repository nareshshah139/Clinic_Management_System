import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePharmacyAgentSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}

export class SendPharmacyAgentMessageDto {
  @IsString()
  @MaxLength(8000)
  message: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentIds?: string[];
}

export class RejectPharmacyAgentProposalDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
