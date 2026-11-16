import { InventoryIdentityMergeService } from './inventory-identity-merge.service';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { InventoryStocktakeService } from './inventory-stocktake.service';
import { IsBoolean, IsDateString, IsString, MaxLength, MinLength } from 'class-validator';

class ResolveBatchIdentityDto {
  @IsString() @MinLength(1) itemId: string;
  @IsString() @MinLength(1) productId: string;
  @IsDateString() updatedAt: string;
  @IsBoolean() confirmed: boolean;
  @IsString() @MinLength(1) @MaxLength(500) reason: string;
}

class MergeInventoryIdentityDto {
  @IsString() @MinLength(1) @MaxLength(100) targetId: string;
  @IsString() @MinLength(1) @MaxLength(100) sourceId: string;
  @IsString() @MinLength(64) @MaxLength(64) revision: string;
  @IsBoolean() confirmed: boolean;
  @IsString() @MinLength(1) @MaxLength(500) reason: string;
}

@Controller('inventory/workspace/stocktake')
@UseGuards(JwtAuthGuard)
export class InventoryStocktakeController {
  constructor(
    private readonly stocktake: InventoryStocktakeService,
    private readonly identities: InventoryIdentityMergeService,
  ) {}
  @Get('merge-preview') preview(
    @Request() req: any,
    @Query('targetId') targetId: string,
    @Query('sourceId') sourceId: string,
  ) {
    return this.identities.preview(req.user, targetId, sourceId);
  }
  @Post('resolve-identity') resolveIdentity(@Request() req: any, @Body() body: ResolveBatchIdentityDto) {
    return this.identities.resolveBatch(req.user, body);
  }
  @Post('merge') merge(
    @Request() req: any,
    @Body() body: MergeInventoryIdentityDto,
  ) {
    return this.identities.merge(req.user, body);
  }
  @Get('template') template(@Request() req: any) {
    return this.stocktake.template(req.user);
  }
  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  import(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('reason') reason: string,
  ) {
    return this.stocktake.import(req.user, file, reason);
  }
}
