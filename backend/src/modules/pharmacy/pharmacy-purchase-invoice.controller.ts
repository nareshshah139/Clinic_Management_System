import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import { PharmacyPurchaseInvoiceService } from './pharmacy-purchase-invoice.service';
import {
  ConfirmPharmacyPurchaseMasterDto,
  CreatePharmacyPurchaseInvoiceDto,
  ImportPharmacyPurchaseInvoiceDto,
  QueryPharmacyPurchaseAnalyticsDto,
  QueryPharmacyPurchaseInvoiceDto,
  ReviewPharmacyPurchaseInvoiceDto,
  SuggestPharmacyPurchaseMasterMatchesDto,
} from './dto/pharmacy-purchase-invoice.dto';

const PURCHASE_OCR_UPLOAD_LIMIT_BYTES = (() => {
  const mb = Number(process.env.PHARMACY_PURCHASE_OCR_MAX_FILE_MB || 25);
  const safeMb = Number.isFinite(mb) && mb > 0 ? mb : 25;
  return safeMb * 1024 * 1024;
})();

function purchaseInvoiceDocumentFilter(_req: any, file: any, cb: any) {
  if (!file || !file.mimetype) {
    return cb(new BadRequestException('Invalid file'), false);
  }
  if (!/^image\//i.test(file.mimetype) && file.mimetype !== 'application/pdf') {
    return cb(
      new BadRequestException('Only image or PDF invoice files are allowed'),
      false,
    );
  }
  return cb(null, true);
}

@ApiTags('Pharmacy Purchase Invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pharmacy/purchase-invoices')
export class PharmacyPurchaseInvoiceController {
  constructor(
    private readonly purchaseInvoiceService: PharmacyPurchaseInvoiceService,
  ) {}

  @Get('capabilities')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR, UserRole.RECEPTION)
  @ApiOperation({ summary: 'Return effective purchase permissions for the signed-in user' })
  capabilities(@Request() req: any) {
    return this.purchaseInvoiceService.capabilities(req.user);
  }

  @Get('suppliers')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR, UserRole.RECEPTION)
  @Permissions(['pharmacy:purchase-invoice:create', 'inventory:po:create', 'pharmacy:purchase-invoice:read', 'inventory:po:read'])
  @ApiOperation({ summary: 'List active branch suppliers for invoice identity matching' })
  suppliers(@Request() req: any) {
    return this.purchaseInvoiceService.purchaseSuppliers(req.user.branchId);
  }

  @Post('drafts')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.RECEPTION)
  @Permissions(['pharmacy:purchase-invoice:create', 'inventory:po:create'])
  @ApiOperation({
    summary:
      'Create a purchase invoice draft from manual entry or reviewed OCR output',
  })
  @ApiResponse({ status: 201, description: 'Purchase invoice draft created' })
  @ApiResponse({
    status: 409,
    description: 'Distributor GSTIN and invoice number already exist',
  })
  createDraft(
    @Body() dto: CreatePharmacyPurchaseInvoiceDto,
    @Request() req: any,
  ) {
    return this.purchaseInvoiceService.createDraft(
      dto,
      req.user.branchId,
      req.user.id,
    );
  }

  @Patch('drafts/:id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.RECEPTION)
  @Permissions(['pharmacy:purchase-invoice:create', 'inventory:po:create'])
  @ApiOperation({ summary: 'Correct an unreviewed purchase invoice draft' })
  updateDraft(@Param('id') id: string, @Body() dto: CreatePharmacyPurchaseInvoiceDto, @Request() req: any) {
    return this.purchaseInvoiceService.updateDraft(id, dto, req.user.branchId);
  }

  @Post('ocr/extract')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.RECEPTION)
  @Permissions(['pharmacy:purchase-invoice:create', 'inventory:po:create'])
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Extract a purchase invoice draft from an uploaded distributor invoice PDF or image',
  })
  @ApiResponse({
    status: 200,
    description:
      'Original upload archived and invoice details extracted; no invoice or stock rows are created',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: purchaseInvoiceDocumentFilter,
      limits: {
        fileSize: PURCHASE_OCR_UPLOAD_LIMIT_BYTES,
        files: 1,
      },
    }),
  )
  extractFromDocument(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    return this.purchaseInvoiceService.extractDraftFromDocument(
      file,
      req.user.branchId,
      req.user.id,
    );
  }

  @Get('documents')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR, UserRole.RECEPTION)
  @Permissions(['pharmacy:purchase-invoice:read', 'inventory:po:read'])
  @ApiOperation({ summary: 'List recent original uploads awaiting invoice linkage' })
  listUnlinkedDocuments(@Request() req: any) {
    return this.purchaseInvoiceService.listUnlinkedDocuments(req.user.branchId);
  }

  @Get('documents/:documentId')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR, UserRole.RECEPTION)
  @Permissions(['pharmacy:purchase-invoice:read', 'inventory:po:read'])
  @ApiOperation({ summary: 'Download the exact original invoice photo or PDF' })
  async getOriginalDocument(@Param('documentId') documentId: string, @Request() req: any, @Res({ passthrough: true }) res: Response) {
    const document = await this.purchaseInvoiceService.getOriginalDocument(documentId, req.user.branchId);
    const fileName = encodeURIComponent(document.fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    res.set({
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    });
    return new StreamableFile(Buffer.from(document.data), {
      type: document.mimeType, length: document.sizeBytes,
      disposition: `attachment; filename="invoice-original"; filename*=UTF-8''${fileName}`,
    });
  }

  @Post('ocr/import')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.RECEPTION)
  @Permissions(
    ['pharmacy:purchase-invoice:create', 'inventory:po:create'],
    ['pharmacy:purchase-invoice:review', 'inventory:po:update'],
    ['pharmacy:purchase-invoice:commit-stock', 'inventory:transaction:create'],
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Extract and save an invoice, then automatically commit stock only when all checks pass' })
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(), fileFilter: purchaseInvoiceDocumentFilter,
    limits: { fileSize: PURCHASE_OCR_UPLOAD_LIMIT_BYTES, files: 1 },
  }))
  importFromDocument(@UploadedFile() file: Express.Multer.File, @Body() dto: ImportPharmacyPurchaseInvoiceDto, @Request() req: any) {
    return this.purchaseInvoiceService.importFromDocument(file, req.user.branchId, req.user.id, dto.goodsReceivedDate);
  }

  @Post(':id/process')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.RECEPTION)
  @Permissions(
    ['pharmacy:purchase-invoice:create', 'inventory:po:create'],
    ['pharmacy:purchase-invoice:review', 'inventory:po:update'],
    ['pharmacy:purchase-invoice:commit-stock', 'inventory:transaction:create'],
  )
  @ApiOperation({ summary: 'Recheck a saved invoice and automatically commit fully validated stock' })
  processInvoice(@Param('id') id: string, @Request() req: any) {
    return this.purchaseInvoiceService.processInvoice(id, req.user.branchId, req.user.id);
  }

  @Post('master-matches')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.RECEPTION)
  @Permissions(['pharmacy:purchase-invoice:create', 'inventory:po:create'])
  @ApiOperation({
    summary:
      'Find nearest drug-master matches for purchase invoice OCR line items',
  })
  suggestMasterMatches(
    @Body() dto: SuggestPharmacyPurchaseMasterMatchesDto,
    @Request() req: any,
  ) {
    return this.purchaseInvoiceService.suggestMasterMatches(
      dto.items,
      req.user.branchId,
    );
  }

  @Post('master-confirmations')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.RECEPTION)
  @Permissions(['pharmacy:purchase-invoice:create', 'inventory:po:create'])
  @ApiOperation({
    summary:
      'Confirm an OCR purchase line against the drug master or create a reviewed drug master record',
  })
  confirmMaster(
    @Body() dto: ConfirmPharmacyPurchaseMasterDto,
    @Request() req: any,
  ) {
    return this.purchaseInvoiceService.confirmMasterRecord(
      dto,
      req.user.branchId,
    );
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR, UserRole.RECEPTION)
  @Permissions(['pharmacy:purchase-invoice:read', 'inventory:po:read'])
  @ApiOperation({ summary: 'List purchase invoice drafts' })
  findAll(
    @Query() query: QueryPharmacyPurchaseInvoiceDto,
    @Request() req: any,
  ) {
    return this.purchaseInvoiceService.findAll(query, req.user.branchId);
  }

  @Get('analytics/distributors')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR, UserRole.RECEPTION)
  @Permissions(['pharmacy:purchase-invoice:read', 'inventory:po:read'])
  @ApiOperation({
    summary: 'Get distributor purchase analytics from reviewed invoices',
  })
  getDistributorAnalytics(
    @Query() query: QueryPharmacyPurchaseAnalyticsDto,
    @Request() req: any,
  ) {
    return this.purchaseInvoiceService.getDistributorAnalytics(
      query,
      req.user.branchId,
    );
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR, UserRole.RECEPTION)
  @Permissions(['pharmacy:purchase-invoice:read', 'inventory:po:read'])
  @ApiOperation({ summary: 'Get a purchase invoice draft by ID' })
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.purchaseInvoiceService.findOne(id, req.user.branchId);
  }

  @Patch(':id/review')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.RECEPTION)
  @Permissions(['pharmacy:purchase-invoice:review', 'inventory:po:update'])
  @ApiOperation({
    summary:
      'Mark a purchase invoice as reviewed once OCR and reconciliation issues are clear',
  })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewPharmacyPurchaseInvoiceDto,
    @Request() req: any,
  ) {
    return this.purchaseInvoiceService.markReviewed(id, dto, req.user.branchId);
  }

  @Post(':id/commit-stock')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.RECEPTION)
  @Permissions(['pharmacy:purchase-invoice:commit-stock', 'inventory:transaction:create'])
  @ApiOperation({
    summary:
      'Commit reviewed purchase invoice lines into pharmacy inventory stock',
  })
  @ApiResponse({
    status: 201,
    description: 'Purchase stock committed or previously committed invoice returned',
  })
  commitStock(@Param('id') id: string, @Request() req: any) {
    return this.purchaseInvoiceService.commitStock(
      id,
      req.user.branchId,
      req.user.id,
    );
  }
}
