import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewInventoryItemRequestDto {
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;
}
