import { Type } from 'class-transformer';
import { ArrayMaxSize, IsObject, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

export class PhotoDto {
  @IsString()
  @MaxLength(64)
  itemKey!: string;

  @IsString()
  @Matches(/^data:image\//)
  dataUrl!: string;
}

export class SubmitDto {
  @IsString()
  @MaxLength(64)
  checkInId!: string;

  @IsObject()
  answers!: Record<string, number | string | string[]>;

  @IsOptional()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => PhotoDto)
  photos?: PhotoDto[];
}
