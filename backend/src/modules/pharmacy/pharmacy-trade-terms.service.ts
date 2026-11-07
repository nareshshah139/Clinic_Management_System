import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { SaveTradeTermsDto, TradeTermLookupDto } from './dto/pharmacy-trade-terms.dto';
import { matchTradeTerm, tradeTermAccess, tradeTermIssue, tradeTermProductKey } from './pharmacy-trade-terms';

const RECENT_DISTRIBUTORS = 5;
const distributorSelect = { id: true, name: true, gstNumber: true, _count: { select: { tradeTerms: true } } } as const;
const actor = { select: { id: true, firstName: true, lastName: true } } as const;
const termInclude = { createdBy: actor, updatedBy: actor } as const;

type DistributorRow = { id: string; name: string; gstNumber: string | null; _count: { tradeTerms: number } };
type ActorRow = { id: string; firstName: string; lastName: string };

const distributorView = (row: DistributorRow) => ({ id: row.id, name: row.name, gstNumber: row.gstNumber, termCount: row._count.tradeTerms });
const actorView = (row: ActorRow) => ({ id: row.id, name: `${row.firstName} ${row.lastName}`.trim() });

function termView<T extends { createdBy: ActorRow; updatedBy: ActorRow }>(row: T) {
  return { ...row, createdBy: actorView(row.createdBy), updatedBy: actorView(row.updatedBy) };
}

@Injectable()
export class PharmacyTradeTermsService {
  constructor(private readonly prisma: PrismaService) {}

  async distributors(branchId: string, role: string, search?: string) {
    const where = { branchId, isActive: true };
    const results = await this.prisma.supplier.findMany({
      where: search
        ? { ...where, OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { gstNumber: { contains: search, mode: 'insensitive' as const } }] }
        : where,
      select: distributorSelect,
      orderBy: { name: 'asc' },
      take: 50,
    });
    return { access: tradeTermAccess(role), results: results.map(distributorView), recent: await this.recentDistributors(branchId) };
  }

  private async recentDistributors(branchId: string) {
    const [terms, invoices] = await Promise.all([
      this.prisma.pharmacyTradeTerm.findMany({
        where: { branchId }, select: { supplierId: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' }, distinct: ['supplierId'], take: RECENT_DISTRIBUTORS,
      }),
      this.prisma.pharmacyPurchaseInvoice.findMany({
        where: { branchId, supplierId: { not: null } }, select: { supplierId: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, distinct: ['supplierId'], take: RECENT_DISTRIBUTORS,
      }),
    ]);
    const latest = new Map<string, number>();
    for (const [id, at] of [...terms.map(t => [t.supplierId, t.updatedAt] as const), ...invoices.map(i => [i.supplierId!, i.createdAt] as const)]) {
      latest.set(id, Math.max(latest.get(id) ?? 0, at.getTime()));
    }
    const ids = [...latest.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, RECENT_DISTRIBUTORS);
    if (!ids.length) return [];
    const suppliers = await this.prisma.supplier.findMany({ where: { branchId, isActive: true, id: { in: ids } }, select: distributorSelect });
    const byId = new Map(suppliers.map(s => [s.id, s]));
    return ids.flatMap(id => (byId.has(id) ? [distributorView(byId.get(id)!)] : []));
  }

  async list(branchId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, branchId }, select: distributorSelect });
    if (!supplier) throw new NotFoundException('Distributor not found in this branch.');
    const terms = await this.prisma.pharmacyTradeTerm.findMany({
      where: { branchId, supplierId }, include: termInclude, orderBy: { productName: 'asc' },
    });
    return { supplier: distributorView(supplier), terms: terms.map(termView) };
  }

  async save(branchId: string, userId: string, dto: SaveTradeTermsDto) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: dto.supplierId, branchId, isActive: true }, select: { id: true } });
    if (!supplier) throw new NotFoundException('Distributor not found in this branch.');
    const rows = dto.items.map(item => {
      const issue = tradeTermIssue(item);
      if (issue) throw new BadRequestException(`${item.productName}: ${issue}`);
      return { item, productKey: tradeTermProductKey(item) };
    });
    const keys = rows.map(row => row.productKey);
    if (new Set(keys).size !== keys.length) throw new BadRequestException('Each product can appear only once.');
    const drugIds = [...new Set(dto.items.flatMap(item => (item.drugId ? [item.drugId] : [])))];
    if (drugIds.length) {
      const found = await this.prisma.drug.count({ where: { branchId, id: { in: drugIds } } });
      if (found !== drugIds.length) throw new BadRequestException('A selected product is not in this branch catalogue.');
    }
    await this.prisma.$transaction(rows.map(({ item, productKey }) => {
      const values = {
        drugId: item.drugId ?? null,
        productName: item.productName,
        discountPercent: item.discountPercent ?? null,
        schemeBuy: item.schemeBuy ?? null,
        schemeFree: item.schemeFree ?? null,
        minExpiryMonths: item.minExpiryMonths ?? null,
        marginPercent: item.marginPercent ?? null,
        ptr: item.ptr ?? null,
        ptrRule: item.ptrRule ?? null,
        note: item.note ?? null,
        updatedById: userId,
      };
      return this.prisma.pharmacyTradeTerm.upsert({
        where: { branchId_supplierId_productKey: { branchId, supplierId: supplier.id, productKey } },
        create: { ...values, branchId, supplierId: supplier.id, productKey, createdById: userId },
        update: values,
      });
    }));
    return this.list(branchId, supplier.id);
  }

  async remove(branchId: string, id: string) {
    const { count } = await this.prisma.pharmacyTradeTerm.deleteMany({ where: { id, branchId } });
    if (!count) throw new NotFoundException('Trade term not found in this branch.');
    return { id };
  }

  async lookup(branchId: string, dto: TradeTermLookupDto) {
    const gstin = dto.gstin?.toUpperCase();
    if (!dto.supplierId && !gstin) return { supplier: null, terms: [], matches: dto.products.map(() => null) };
    const supplier = await this.prisma.supplier.findFirst({
      where: { branchId, isActive: true, ...(dto.supplierId ? { id: dto.supplierId } : { gstNumber: { equals: gstin, mode: 'insensitive' as const } }) },
      select: distributorSelect,
    });
    if (!supplier) return { supplier: null, terms: [], matches: dto.products.map(() => null) };
    const terms = (await this.prisma.pharmacyTradeTerm.findMany({
      where: { branchId, supplierId: supplier.id }, include: termInclude, orderBy: { productName: 'asc' },
    })).map(termView);
    return {
      supplier: distributorView(supplier),
      terms,
      matches: dto.products.map(product => matchTradeTerm(terms, product)?.id ?? null),
    };
  }
}
