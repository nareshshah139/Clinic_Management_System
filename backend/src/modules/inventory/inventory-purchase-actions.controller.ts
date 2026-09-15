import { Body, Controller, Get, Param, Patch, Post, Query, Request, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { QueryPharmacyPurchaseInvoiceDto } from '../pharmacy/dto/pharmacy-purchase-invoice.dto';
import { InventoryPurchaseActionsService } from './inventory-purchase-actions.service';

@Controller('inventory/workspace/purchases')
@UseGuards(JwtAuthGuard)
export class InventoryPurchaseActionsController {
  constructor(private readonly actions: InventoryPurchaseActionsService) {}

  @Get('export')
  async registerExport(@Request() req: any, @Query('format') format: string, @Query() query: QueryPharmacyPurchaseInvoiceDto, @Res() response: Response) {
    const file = await this.actions.export(req.user, format || 'csv', undefined, query);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(file.data);
  }

  @Get(':id/actions')
  detail(@Request() req: any, @Param('id') id: string) { return this.actions.detail(req.user, id); }

  @Get(':id/export')
  async invoiceExport(@Request() req: any, @Param('id') id: string, @Query('format') format: string, @Res() response: Response) {
    const file = await this.actions.export(req.user, format || 'pdf', id);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `${format === 'qr' ? 'inline' : 'attachment'}; filename="${file.fileName}"`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(file.data);
  }

  @Post(':id/originals')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }))
  attach(@Request() req: any, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) { return this.actions.attachOriginal(req.user, id, file); }

  @Patch(':id/metadata')
  metadata(@Request() req: any, @Param('id') id: string, @Body() input: Record<string, any>) { return this.actions.saveMetadata(req.user, id, input); }
}
