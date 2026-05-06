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
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import { PharmacyPurchaseInvoiceService } from './pharmacy-purchase-invoice.service';
import {
  ConfirmPharmacyPurchaseMasterDto,
  CreatePharmacyPurchaseInvoiceDto,
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

  @Post('drafts')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('pharmacy:purchase-invoice:create')
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

  @Post('ocr/extract')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('pharmacy:purchase-invoice:create')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Extract a purchase invoice draft from an uploaded distributor invoice PDF or image',
  })
  @ApiResponse({
    status: 200,
    description:
      'Purchase invoice draft extracted for human review; no database rows are created',
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
    );
  }

  @Post('master-matches')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('pharmacy:purchase-invoice:create')
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
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('pharmacy:purchase-invoice:create')
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
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR)
  @Permissions('pharmacy:purchase-invoice:read')
  @ApiOperation({ summary: 'List purchase invoice drafts' })
  findAll(
    @Query() query: QueryPharmacyPurchaseInvoiceDto,
    @Request() req: any,
  ) {
    return this.purchaseInvoiceService.findAll(query, req.user.branchId);
  }

  @Get('analytics/distributors')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR)
  @Permissions('pharmacy:purchase-invoice:read')
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
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.DOCTOR)
  @Permissions('pharmacy:purchase-invoice:read')
  @ApiOperation({ summary: 'Get a purchase invoice draft by ID' })
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.purchaseInvoiceService.findOne(id, req.user.branchId);
  }

  @Patch(':id/review')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('pharmacy:purchase-invoice:review')
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
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('pharmacy:purchase-invoice:commit-stock')
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
