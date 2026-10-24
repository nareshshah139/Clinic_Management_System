import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDateString, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { InventoryIdentityRecoveryService } from './inventory-identity-recovery.service';

class ResolveBatchIdentityDto {
  @IsString() @MinLength(1) itemId: string;
  @IsString() @MinLength(1) productId: string;
  @IsDateString() updatedAt: string;
  @IsBoolean() confirmed: boolean;
  @IsString() @MinLength(1) @MaxLength(500) reason: string;
}

@Controller('inventory/workspace/stocktake')
@UseGuards(JwtAuthGuard)
export class InventoryStocktakeController {
  constructor(private readonly identities: InventoryIdentityRecoveryService) {}

  @Post('resolve-identity')
  resolveIdentity(@Request() req: any, @Body() body: ResolveBatchIdentityDto) {
    return this.identities.resolveBatch(req.user, body);
  }
}
