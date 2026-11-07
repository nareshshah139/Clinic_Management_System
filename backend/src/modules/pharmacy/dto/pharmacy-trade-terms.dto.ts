import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value === 'string') return value.trim() || null;
  return value === '' ? null : value;
};

export class TradeTermItemDto {
  @ApiPropertyOptional({
    description: 'Master drug id when the product is in the catalogue',
  })
  @IsOptional()
  @IsString()
  drugId?: string;

  @ApiProperty({ example: 'Dolo 650 Tablet' })
  @Transform(trimmed)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  productName: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number | null;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  schemeBuy?: number | null;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  schemeFree?: number | null;

  @ApiPropertyOptional({ example: 18 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  minExpiryMonths?: number | null;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  marginPercent?: number | null;

  @ApiPropertyOptional({ example: 42.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ptr?: number | null;

  @ApiPropertyOptional({ example: 'PTR = MRP less 20%' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(300)
  ptrRule?: string | null;

  @ApiPropertyOptional({ example: 'Agreed with the rep on 3 Nov' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class SaveTradeTermsDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  supplierId: string;

  @ApiProperty({ type: [TradeTermItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TradeTermItemDto)
  items: TradeTermItemDto[];
}

export class QueryTradeTermDistributorsDto {
  @ApiPropertyOptional({ description: 'Distributor name or GSTIN fragment' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class QueryTradeTermsDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  supplierId: string;
}

export class TradeTermLookupProductDto {
  @IsOptional()
  @IsString()
  drugId?: string;

  @IsString()
  @MaxLength(200)
  productName: string;
}

export class TradeTermLookupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ example: '36ABCDE1234F1Z5' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(20)
  gstin?: string;

  @ApiProperty({ type: [TradeTermLookupProductDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TradeTermLookupProductDto)
  products: TradeTermLookupProductDto[];
}
