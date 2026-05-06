import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export enum PharmacyPurchasePaymentModeDto {
  CASH = 'CASH',
  CHEQUE = 'CHEQUE',
  NEFT = 'NEFT',
  UPI = 'UPI',
  CARD = 'CARD',
}

const toNumber = ({ value }: { value: unknown }) => {
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
};

export class PharmacyPurchasePaymentAllocationDto {
  @ApiProperty({ example: 'cm2purchaseinvoiceid' })
  @IsString()
  purchaseInvoiceId: string;

  @ApiProperty({ example: 12500 })
  @Transform(toNumber)
  @IsNumber()
  @Min(0.01)
  amount: number;
}

export class CreatePharmacyPurchasePaymentDto {
  @ApiProperty({ example: '36ABCDE1234F1Z5' })
  @IsString()
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/)
  distributorGstin: string;

  @ApiProperty({ example: 'Linae Distributors' })
  @IsString()
  distributorName: string;

  @ApiProperty({ example: '2026-05-06' })
  @IsDateString()
  paymentDate: string;

  @ApiProperty({ enum: PharmacyPurchasePaymentModeDto })
  @IsEnum(PharmacyPurchasePaymentModeDto)
  mode: PharmacyPurchasePaymentModeDto;

  @ApiPropertyOptional({ example: 'user-1' })
  @IsOptional()
  @IsString()
  paidBy?: string;

  @ApiProperty({ example: 25000 })
  @Transform(toNumber)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'UTR123456789' })
  @IsOptional()
  @IsString()
  referenceNo?: string;

  @ApiPropertyOptional({ example: 'Allocated against March credit bills' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [PharmacyPurchasePaymentAllocationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PharmacyPurchasePaymentAllocationDto)
  allocations: PharmacyPurchasePaymentAllocationDto[];
}

export class QueryPharmacyPurchaseLedgerDto {
  @ApiPropertyOptional({ example: '2026-05-06' })
  @IsOptional()
  @IsDateString()
  asOfDate?: string;
}
