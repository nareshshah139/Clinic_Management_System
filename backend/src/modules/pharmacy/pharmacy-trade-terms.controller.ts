import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { PharmacyTradeTermsService } from './pharmacy-trade-terms.service';
import { TRADE_TERM_EDITORS, TRADE_TERM_READERS } from './pharmacy-trade-terms';
import {
  QueryTradeTermDistributorsDto,
  QueryTradeTermsDto,
  SaveTradeTermsDto,
  TradeTermLookupDto,
} from './dto/pharmacy-trade-terms.dto';

@ApiTags('Pharmacy Trade Terms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pharmacy/trade-terms')
export class PharmacyTradeTermsController {
  constructor(private readonly tradeTerms: PharmacyTradeTermsService) {}

  @Get('distributors')
  @Roles(...TRADE_TERM_READERS)
  @ApiOperation({
    summary: 'Search distributors by name or GSTIN, with a recent shortlist',
  })
  distributors(
    @Query() query: QueryTradeTermDistributorsDto,
    @Request() req: any,
  ) {
    return this.tradeTerms.distributors(
      req.user.branchId,
      req.user.role,
      query.search,
    );
  }

  @Get()
  @Roles(...TRADE_TERM_READERS)
  @ApiOperation({ summary: 'List the agreed terms for one distributor' })
  list(@Query() query: QueryTradeTermsDto, @Request() req: any) {
    return this.tradeTerms.list(req.user.branchId, query.supplierId);
  }

  @Post('lookup')
  @HttpCode(200)
  @Roles(...TRADE_TERM_READERS)
  @ApiOperation({
    summary: 'Agreed terms for a distributor, matched to invoice products',
  })
  lookup(@Body() dto: TradeTermLookupDto, @Request() req: any) {
    return this.tradeTerms.lookup(req.user.branchId, dto);
  }

  @Put()
  @Roles(...TRADE_TERM_EDITORS)
  @ApiOperation({
    summary:
      'Save terms for one distributor; saving a product again replaces its terms',
  })
  save(@Body() dto: SaveTradeTermsDto, @Request() req: any) {
    return this.tradeTerms.save(req.user.branchId, req.user.id, dto);
  }

  @Delete(':id')
  @Roles(...TRADE_TERM_EDITORS)
  @ApiOperation({ summary: 'Delete one agreed term' })
  remove(@Param('id') id: string, @Request() req: any) {
    return this.tradeTerms.remove(req.user.branchId, id);
  }
}
