import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PharmacyPurchaseLedgerService } from '../pharmacy/pharmacy-purchase-ledger.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { InventoryWorkflowService } from './inventory-workflow.service';
import { WorkflowActor } from './inventory-workflow.types';
import { jsonObject, money, movementDelta, stockStatus, writeStockMovement } from './inventory-stock';
import { inventoryNameAliases, inventoryProductName, retainPreviousInventoryName } from './inventory-names';

@Injectable()
export class InventoryWorkspaceService {
  constructor(private readonly prisma: PrismaService, private readonly workflow: InventoryWorkflowService) {}
  async require(actor: WorkflowActor, permission: string) {
    const p = await this.workflow.permissions(actor);
    if (!p.has('*') && !p.has(permission)) throw new ForbiddenException(`This action requires ${permission}`);
  }
  private present(item: any) {
    const metadata = jsonObject(item.metadata), priceBasis = metadata.purchaseInvoice?.priceBasis || metadata.priceBasis;
    const productName = inventoryProductName(item, metadata);
    const packLabel = metadata.nameNormalization?.sourcePackLabel || metadata.sourcePackLabel || metadata.packLabel || (item.packSize && item.packUnit ? `${item.packSize} ${item.packUnit}` : null);
    const baseFactor = ['STRIPS','PACKS','BOXES'].includes(item.unit) ? item.packSize || null : 1;
    const available = item.currentStock - item.heldStock;
    const packUnits = ['STRIPS','PACKS','BOXES'].includes(item.unit);
    const unitsPerPack = Number(metadata.baseUnitsPerPack || (['TABLETS','CAPSULES'].includes(item.unit) || item.unit==='PIECES' && /strip|pack|box|tablet|capsule|piece/i.test(item.packUnit||'') ? item.packSize : 0));
    const packQuantity = packUnits ? item.currentStock : Number.isSafeInteger(unitsPerPack) && unitsPerPack > 0 ? item.currentStock / unitsPerPack : null;
    const packEquivalentUnit = packUnits ? item.unit : packQuantity != null ? metadata.packLabel || (/strip/i.test(item.packUnit||'')?'STRIPS':`packs of ${unitsPerPack} ${item.unit}`) : null;
    const mappingStatus = metadata.mappingStatus === 'PENDING' || metadata.mappingPending ? 'PENDING' : (item._count?.drugs || item.drugs?.length) ? 'MAPPED' : 'UNMAPPED';
    return { ...item, metadata, productName, packLabel, available, mappingStatus, packQuantity, packEquivalentUnit, unitsPerPack:packUnits?baseFactor:unitsPerPack||null, baseFactor, baseQuantity: baseFactor ? item.currentStock * baseFactor : null,
      margin: item.mrp > 0 ? money((item.mrp - item.costPrice) / item.mrp * 100) : null,
      priceBasis: priceBasis || 'Historical purchase cost per stock unit; landing-cost allocation unknown',
      issues: [!item.category && 'Category missing', !item.hsnCode && 'HSN missing', item.gstRate == null && 'GST missing', !item.storageLocation && 'Location missing',
        item.minStockLevel == null && 'Minimum missing', item.maxStockLevel == null && 'Maximum missing',
        !item.packSize && 'Pack size missing', !item.batchNumber && 'Batch missing', !item.expiryDate && 'Expiry missing',
        !item.costPrice && 'Purchase price missing', !item.mrp && 'MRP missing'].filter(Boolean),
    };
  }
  /**
   * @cc [owner:nareshshah139,label:product] workspace-filter-complete-population
   * Stock filters and counts MUST use every batch in the authenticated branch before pagination;
   * an absent value MUST remain distinguishable from zero, and holds MUST reduce available stock.
   */
/**
 * @cc [owner:nareshshah139,label:product;target] inventory-quality-complete-scope
 * Location and data-quality queues MUST include every eligible inventory category and page in
 * their stated scope; separately scoped mapping counters MUST NOT be added together as one
 * backlog.
 * Acceptance: INV-05. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
/**
   * @cc [owner:nareshshah139,label:product;target] inventory-valuation-basis
   * Stock valuation MUST state its price and quantity basis and separate current from expired
   * stock; quantities in packs MUST NOT be multiplied by prices per base unit without conversion.
   * Acceptance: INV-07. Validation and open gaps:
   * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
   */
/**
   * @cc [owner:nareshshah139,label:product;target] inventory-expiry-complete-windows
   * Expiry queues MUST support expired and the next 1, 2, 3 and 6 months across all eligible
   * batches; any result cap MUST be visible and navigable rather than presented as a complete
   * total.
   * Acceptance: INV-30. Validation and open gaps:
   * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
   */
  /**
   * @cc [owner:nareshshah139,label:product] inventory-batch-view-scope
   * ON_HAND MUST include every positive physical balance, including held or expired stock;
   * EMPTY MUST include only zero physical balances. An omitted view MUST retain all batches
   * for existing API consumers. View filters MUST apply before pagination and valuation.
   */
  /**
   * @cc [owner:nareshshah139,label:product] inventory-search-not-identity
   * Stock lookup MUST search retained aliases, source and linked product names and source codes with all query
   * words in any order. Lookup MUST NOT merge records or infer product identity. An inventory:
   * code MUST resolve only the exact branch item ID.
   */
  async stock(actor: WorkflowActor, q: Record<string, any> = {}) {
    await this.require(actor, 'inventory:item:read');
    const batchView = q.batchView || 'ALL';
    if (!['ALL','ON_HAND','EMPTY'].includes(batchView)) throw new BadRequestException('Unknown batch view');
    const all = (await this.prisma.inventoryItem.findMany({where:{branchId:actor.branchId},include:{drugs:{select:{id:true,name:true,packSizeLabel:true}},_count:{select:{drugs:true}}},orderBy:[{name:'asc'},{expiryDate:'asc'},{id:'asc'}]})).map(i=>this.present(i));
    const text = (s:any)=>String(s||'').toLowerCase();
    const words = (s:any)=>text(s).replace(/[^\p{L}\p{N}.]+/gu,' ').trim().split(/\s+/).filter(Boolean);
    const search = String(q.search || '').trim(), searchWords = words(search);
    const now = new Date(), expiryStart = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())), future = new Date(expiryStart);
    const months = Number(q.expiryMonths||0); if (![0,1,2,3,6].includes(months)) throw new BadRequestException('Expiry window must be 1, 2, 3 or 6 months');
    const day=future.getUTCDate(); future.setUTCDate(1);future.setUTCMonth(future.getUTCMonth()+months);future.setUTCDate(Math.min(day,new Date(Date.UTC(future.getUTCFullYear(),future.getUTCMonth()+1,0)).getUTCDate())); future.setUTCHours(23,59,59,999);
    const priceBasis = q.priceBasis || 'PTR';
    if (!['PTR','MRP','SELLING','LANDING'].includes(priceBasis)) throw new BadRequestException('Unknown price basis');
    for (const key of ['minPrice','maxPrice','minMargin','maxMargin']) if(q[key]!==undefined && q[key]!=='' && (!Number.isFinite(Number(q[key])) || Number(q[key])<0)) throw new BadRequestException(`${key} must be a nonnegative number`);
    if(q.audit && ['PENDING','COMPLETED','BLOCKED'].includes(q.audit)) {
      const counts = await this.prisma.inventoryWorkflowDocument.findMany({where:{branchId:actor.branchId,kind:'COUNT'},orderBy:[{createdAt:'desc'},{id:'desc'}]});
      const states = new Map<string,string>();
      for(const doc of counts) for(const line of (doc.payload as any).lines||[]) if(!states.has(line.inventoryId)) states.set(line.inventoryId,doc.status==='POSTED'?'COMPLETED':['AWAITING_APPROVAL','REJECTED'].includes(doc.status)?'BLOCKED':['CANCELLED','REVERSED'].includes(doc.status)?'NONE':'PENDING');
      for(const row of all) (row as any).auditState=states.get(row.id)||'NONE';
    }
    const fields = ['category','subCategory','manufacturer','supplier','type','unit','storageLocation','status'];
    const rows = all.filter(i=> {
      if (batchView === 'ON_HAND' && i.currentStock <= 0) return false;
      if (batchView === 'EMPTY' && i.currentStock !== 0) return false;
      if (q.saleEligible==='true' && (i.status!=='ACTIVE'||i.available<=0||!!i.expiryDate&&i.expiryDate<expiryStart)) return false;
      if (search.startsWith('inventory:')) {
        if (i.id !== search.slice('inventory:'.length)) return false;
      } else if (search) {
        const values = [i.id,i.name,i.productName,i.genericName,i.brandName,i.batchNumber,i.barcode,i.sku,i.packLabel,i.metadata.sourceItemCode,...inventoryNameAliases(i.metadata),...(i.drugs||[]).map((d: { name: string })=>d.name)];
        const haystack = values.map(v=>words(v).join(' '));
        if (!values.some(v=>text(v).includes(text(search))) && (!searchWords.length || !searchWords.every(w=>haystack.some(v=>v.includes(w))))) return false;
      }
      if (fields.some(f=>q[f] && text((i as any)[f])!==text(q[f]))) return false;
      if (q.dosageForm && text(i.metadata.dosageForm)!==text(q.dosageForm)) return false;
      if (q.schedule && text(i.metadata.schedule)!==text(q.schedule)) return false;
      if (q.gst && (q.gst==='MISSING' ? i.gstRate!=null : Number(q.gst)!==i.gstRate)) return false;
      if (q.hsn && (q.hsn==='MISSING' ? !!i.hsnCode : !text(i.hsnCode).includes(text(q.hsn)))) return false;
      if (q.stock==='LOW' && !(i.available<=(i.minStockLevel??i.reorderLevel??-1))) return false;
      if (q.stock==='ZERO' && i.currentStock!==0) return false;
      if (q.stock==='AVAILABLE' && i.available<=0) return false;
      if (q.stock==='HIGH' && !(i.maxStockLevel!=null && i.currentStock>i.maxStockLevel)) return false;
      if (q.stock==='POSITIVE' && i.currentStock<=0) return false;
      if (q.stock==='NEGATIVE' && i.currentStock>=0) return false;
      if (q.stock==='HELD' && !i.heldStock) return false;
      if (q.stock==='EXPIRED' && !(i.expiryDate && i.expiryDate<expiryStart)) return false;
      if (q.expiryMonths && !(i.currentStock>0 && i.expiryDate && i.expiryDate>=expiryStart && i.expiryDate<=future)) return false;
      if (q.mapping && i.mappingStatus!==q.mapping) return false;
      if (q.missing && !i.issues.some((v:any)=>text(v).includes(text(q.missing)))) return false;
      const price = priceBasis==='PTR'?i.costPrice:priceBasis==='MRP'?i.mrp:priceBasis==='SELLING'?i.sellingPrice:i.metadata.landingCostPerStockUnit;
      if (q.minPrice!==undefined && q.minPrice!=='' && (price==null || price<Number(q.minPrice))) return false;
      if (q.maxPrice!==undefined && q.maxPrice!=='' && (price==null || price>Number(q.maxPrice))) return false;
      if (q.audit && ['PENDING','COMPLETED','BLOCKED'].includes(q.audit) && (i as any).auditState!==q.audit) return false;
      if (q.minMargin!==undefined && q.minMargin!=='' && (i.margin==null || i.margin<Number(q.minMargin))) return false;
      if (q.maxMargin!==undefined && q.maxMargin!=='' && (i.margin==null || i.margin>Number(q.maxMargin))) return false;
      if (q.audit==='MISSING' && i.metadata.lastCountAt) return false;
      if (q.audit==='COUNTED' && !i.metadata.lastCountAt) return false;
      return true;
    });
    const sortBy=q.sortBy||'name'; const sorts=['name','currentStock','available','costPrice','mrp','expiryDate','storageLocation','updatedAt'];
    if(!sorts.includes(sortBy)|| (q.sortOrder&&!['asc','desc'].includes(q.sortOrder))) throw new BadRequestException('Invalid stock sort');
    rows.sort((a:any,b:any)=>{const av=a[sortBy],bv=b[sortBy]; const cmp=av==null?(bv==null?0:1):bv==null?-1:typeof av==='number'?av-bv:av instanceof Date?av.getTime()-new Date(bv).getTime():String(av).localeCompare(String(bv));return (q.sortOrder==='desc'?-cmp:cmp)||a.id.localeCompare(b.id);});
    const page=Math.max(1,Number(q.page)||1),limit=Math.min(100,Math.max(1,Number(q.limit)||30));
    const totals = (list:any[])=>({batches:list.length,units:list.reduce((n,i)=>n+i.currentStock,0),PTR:money(list.reduce((n,i)=>n+i.currentStock*i.costPrice,0)),MRP:money(list.reduce((n,i)=>n+i.currentStock*(i.mrp??i.sellingPrice),0)),MRPExcludingTax:money(list.reduce((n,i)=>n+(i.gstRate!=null?i.currentStock*(i.mrp??i.sellingPrice)/(1+i.gstRate/100):0),0)),MRPTaxUnknownBatches:list.filter(i=>i.gstRate==null).length,landingKnown:money(list.reduce((n,i)=>n+(i.metadata.landingCostPerStockUnit!=null?i.currentStock*i.metadata.landingCostPerStockUnit:0),0)),landingUnknownBatches:list.filter(i=>i.currentStock>0&&i.metadata.landingCostPerStockUnit==null).length});
    return {filterScope:{batchView,asOf:now.toISOString(),expiryStart:expiryStart.toISOString(),expiryEnd:future.toISOString(),expiryBoundary:'Expiry dates remain valid through the entire UTC calendar day. Expired before expiryStart; upcoming through inclusive expiryEnd using clamped calendar months',priceBasis,sortBy,sortOrder:q.sortOrder||'asc'},rows:rows.slice((page-1)*limit,page*limit),total:rows.length,page,limit,totalPages:Math.ceil(rows.length/limit),
      facets:Object.fromEntries(fields.map(f=>[f,[...new Set(all.map(i=>(i as any)[f]).filter(Boolean))].sort()])),
      valuation:{current:totals(rows.filter(i=>!i.expiryDate||i.expiryDate>=expiryStart)),expired:totals(rows.filter(i=>i.expiryDate&&i.expiryDate<expiryStart))},
      quality:Object.fromEntries([...new Set(all.flatMap(i=>i.issues))].map(key=>[key,all.filter(i=>i.issues.includes(key)).length]))};
  }
/**
   * @cc [owner:nareshshah139,label:product;target] inventory-ledger-closing-balance
   * The item/batch ledger MUST expose each movement’s signed stock effect and running close so that
   * opening plus receipts minus outflows plus signed adjustments equals the stored balance.
   * Acceptance: INV-27. Validation and open gaps:
   * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
   */
  /**
   * @cc [owner:nareshshah139,label:product] inventory-sibling-batch-identity
   * Sibling batches MUST share one unambiguous linked product, branch, stock unit and exact pack.
   * Legacy inventory category differences MUST NOT hide a sibling with that verified identity.
   * Unmapped or multiply mapped records MUST remain isolated; similar names are not identity.
   */
  async item(actor: WorkflowActor,id:string) {
    await this.require(actor,'inventory:item:read');
    const item=await this.prisma.inventoryItem.findFirst({where:{id,branchId:actor.branchId},include:{drugs:{select:{id:true,name:true}}}}); if(!item)throw new NotFoundException('Batch not found');
    const [batches,movements,effects,purchases]=await Promise.all([
      this.prisma.inventoryItem.findMany({where:{branchId:actor.branchId,...(item.drugs.length===1?{drugs:{some:{id:item.drugs[0].id},every:{id:item.drugs[0].id}},unit:item.unit,packSize:item.packSize,packUnit:item.packUnit}:{id:item.id})},include:{drugs:{select:{id:true,name:true}},_count:{select:{drugs:true}}},orderBy:[{expiryDate:'asc'},{id:'asc'}]}),
      this.prisma.stockTransaction.findMany({where:{branchId:actor.branchId,itemId:id},orderBy:[{createdAt:'asc'},{id:'asc'}]}),
      this.prisma.inventoryWorkflowEffect.findMany({where:{branchId:actor.branchId,inventoryId:id},include:{document:true},orderBy:{createdAt:'desc'}}),
      this.prisma.pharmacyPurchaseInvoice.findMany({where:{branchId:actor.branchId,items:{some:{inventoryItemId:id}}},include:{documents:{select:{id:true,fileName:true}},items:true},orderBy:{invoiceDate:'desc'}})
    ]);
    const owners=await this.movementOwners(actor.branchId,movements);
    const legacyPurchaseIds=[...new Set([...owners.values()].filter(o=>o.type==='purchase'&&!purchases.some(p=>p.id===o.id)).map(o=>o.id))];
    if(legacyPurchaseIds.length)purchases.push(...await this.prisma.pharmacyPurchaseInvoice.findMany({where:{branchId:actor.branchId,id:{in:legacyPurchaseIds}},include:{documents:{select:{id:true,fileName:true}},items:true},orderBy:{invoiceDate:'desc'}}));
    const caps=await this.workflow.capabilities(actor);
    const holds=['HOLD','SALES_RETURN'].some(k=>caps.kinds[k]?.read)?await this.holdSources(actor,{itemId:id,history:'true',internalAll:true}):{rows:[],restricted:true};
    const sum=movements.reduce((n,m)=>n+(movementDelta(m)||0),0),unknown=movements.some(m=>movementDelta(m)==null);let closing=item.currentStock-sum;
    return {holds:holds.rows,holdsPagination:{total:(holds as any).total||0,page:(holds as any).page||1,totalPages:(holds as any).totalPages||0},holdsRestricted:'restricted' in holds&&holds.restricted,identityBasis:item.drugs.length===1?'One linked product identity, stock unit and exact pack':item.drugs.length?'Ambiguous linked products; selected batch only until mapping is reviewed':'Unmapped batch only; link a verified product to group sibling batches',item:this.present(item),batches:batches.map(i=>this.present(i)),openingBalance:unknown?null:closing,
      movements:movements.map(m=>{const delta=movementDelta(m);closing+=delta||0;return {...m,owner:owners.get(m.id)||null,correctionAllowed:!owners.has(m.id)&&!/^INV-|^PI-|^PINV-|^PURCHASE-|^WF-/.test(m.reference||''),delta,closing:unknown?null:closing};}),
      history:effects.map(e=>({...e,document:{...e.document,totalAmount:Number(e.document.totalAmount)}})),purchases};
  }
  /**
   * @cc [owner:nareshshah139,label:product] workspace-item-metadata-audit
   * Metadata edits MUST compare the saved revision, reject conflicting SKU/barcode assignments,
   * and commit an actor/reason/before-after audit atomically. Quantity, pack and historic cost
   * cannot change here. Changed manual targets require an explicit reason.
   */
/**
   * @cc [owner:nareshshah139,label:product;target] inventory-master-not-balance
   * Editing item identity, classification, tax, pack or location MUST NOT implicitly change posted
   * batch quantities or rewrite historical purchase prices.
   * Acceptance: INV-04. Validation and open gaps:
   * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
   */
  async saveItem(actor:WorkflowActor,id:string,input:Record<string,any>) {
    await this.require(actor,'inventory:item:update');
    try { return await this.workflow.transaction(async tx=>{
      const item=await tx.inventoryItem.findFirst({where:{id,branchId:actor.branchId}});if(!item)throw new NotFoundException('Batch not found');
      if(input.updatedAt!==item.updatedAt.toISOString())throw new ConflictException('Batch details changed. Reload before saving.');
      const data:any={},meta=jsonObject(item.metadata),reason=String(input.reason||'').trim();
      for(const f of ['name','genericName','brandName','category','subCategory','manufacturer','supplier','hsnCode','storageLocation','storageConditions','barcode','sku'])if(input[f]!==undefined)data[f]=String(input[f]).trim()||null;
      if(input.name!==undefined&&!data.name)throw new BadRequestException('Product name is required');
      if(data.name && data.name!==item.name)retainPreviousInventoryName(meta,item.name);
      for(const f of ['barcode','sku']) if(data[f] && data[f]!==item[f] && await tx.inventoryItem.findFirst({where:{[f]:data[f],id:{not:id}},select:{id:true}})) throw new ConflictException(`This ${f.toUpperCase()} is already assigned. Choose a unique code.`);
      for(const f of ['gstRate','minStockLevel','maxStockLevel','reorderLevel','reorderQuantity'])if(input[f]!==undefined){data[f]=input[f]===''||input[f]===null?null:Number(input[f]);if(data[f]!=null&&(!Number.isFinite(data[f])||data[f]<0||(f!=='gstRate'&&!Number.isSafeInteger(data[f]))))throw new BadRequestException(`${f} must be nonnegative`);}
      const value=(f:string)=>Object.prototype.hasOwnProperty.call(data,f)?data[f]:item[f];
      if(value('minStockLevel')!=null&&value('maxStockLevel')!=null&&value('minStockLevel')>value('maxStockLevel'))throw new BadRequestException('Minimum cannot exceed maximum');
      const targetsChanged=['minStockLevel','maxStockLevel','reorderLevel','reorderQuantity'].some(f=>input[f]!==undefined&&data[f]!==item[f]);
      if(targetsChanged&&!reason)throw new BadRequestException('Enter a reason for changing manual replenishment targets');
      if(targetsChanged)meta.manualTargets=true;
      for(const f of ['dosageForm','schedule','composition'])if(input[f]!==undefined)meta[f]=String(input[f]).trim();
      if(input.status!==undefined){if(!['ACTIVE','INACTIVE','DISCONTINUED'].includes(input.status))throw new BadRequestException('Invalid item status');if(input.status!=='ACTIVE'&&(item.currentStock||item.heldStock))throw new BadRequestException('Dispose or return remaining stock before archiving the batch');data.status=input.status;}
      data.metadata=JSON.stringify(meta);data.stockStatus=stockStatus({...item,...data});
      const saved=await tx.inventoryItem.update({where:{id,branchId:actor.branchId,updatedAt:item.updatedAt},data});
      const before=Object.fromEntries(Object.keys(data).map(k=>[k,item[k]]));
      await tx.auditLog.create({data:{userId:actor.id,action:'INVENTORY_METADATA_UPDATED',entity:'InventoryItem',entityId:id,oldValues:JSON.stringify({branchId:actor.branchId,...before}),newValues:JSON.stringify({branchId:actor.branchId,...data,reason:reason||'Item metadata update'})}});
      return saved;
    }); } catch(error:any){if(error?.code==='P2002')throw new ConflictException('This SKU or barcode is already assigned. Choose a unique code.');if(error?.code==='P2025')throw new ConflictException('Batch details changed. Reload before saving.');throw error;}
  }
  /**
   * @cc [owner:nareshshah139,label:product] bulk-location-atomic-audit
   * Bulk location changes MUST compare every selected branch batch revision and commit all
   * changes and their reason/actor audit entries together; quantities and costs remain unchanged.
   */
  async bulkLocations(actor:WorkflowActor,input:Record<string,any>) {
    await this.require(actor,'inventory:item:update');
    const location=String(input.location||'').trim(),reason=String(input.reason||'').trim();
    if(!location||!reason||!Array.isArray(input.items)||!input.items.length||input.items.length>1000)throw new BadRequestException('Choose up to 1,000 batches, a location and a reason');
    if(new Set(input.items.map((i:any)=>i.id)).size!==input.items.length)throw new BadRequestException('Choose each batch once');
    return this.workflow.transaction(async tx=>{
      const rows=await tx.inventoryItem.findMany({where:{branchId:actor.branchId,id:{in:input.items.map((i:any)=>i.id)}}});
      if(rows.length!==input.items.length)throw new BadRequestException('A selected batch is not in this branch');
      for(const row of rows){const selected=input.items.find((i:any)=>i.id===row.id);if(selected.updatedAt!==row.updatedAt.toISOString())throw new ConflictException('A selected batch changed. Refresh the selection');}
      for(const row of rows){await tx.inventoryItem.update({where:{id:row.id,branchId:actor.branchId,updatedAt:row.updatedAt},data:{storageLocation:location}});await tx.auditLog.create({data:{userId:actor.id,action:'INVENTORY_BULK_LOCATION',entity:'InventoryItem',entityId:row.id,oldValues:JSON.stringify({branchId:actor.branchId,storageLocation:row.storageLocation}),newValues:JSON.stringify({branchId:actor.branchId,storageLocation:location,reason})}});}
      return {updated:rows.length,location};
    });
  }
  async overview(actor:WorkflowActor) {
    const caps=await this.workflow.capabilities(actor),p=await this.workflow.permissions(actor),has=(x:string)=>p.has('*')||p.has(x);
    const stock=has('inventory:item:read')?await this.stock(actor):null;
    const docs=(await this.workflow.documents(actor,{limit:100}));
    const active=await this.prisma.inventoryWorkflowDocument.groupBy({by:['kind','status'],where:{branchId:actor.branchId,kind:{in:Object.keys(caps.kinds).filter(k=>caps.kinds[k].read)}},_count:true});
    const purchases=has('inventory:po:read')?await this.prisma.pharmacyPurchaseInvoice.groupBy({by:['status'],where:{branchId:actor.branchId},_count:true}):[];
    const unlinked=has('inventory:po:read')?await this.prisma.pharmacyPurchaseInvoiceDocument.count({where:{branchId:actor.branchId,purchaseInvoiceId:null}}):0;
    const low=stock?await this.stock(actor,{stock:'LOW'}):null,expiring=stock?await this.stock(actor,{expiryMonths:'3'}):null;
    const supplierAlerts=has('pharmacy:purchase-ledger:read')?await new PharmacyPurchaseLedgerService(this.prisma).getAlerts(actor.branchId):null;
    const supplierOverdue=supplierAlerts?{count:supplierAlerts.overdue.length,amount:money(supplierAlerts.overdue.reduce((n:number,r:any)=>n+r.outstanding,0)),asOf:supplierAlerts.asOfDate}:null;
    const pendingPurchase=purchases.filter((g:any)=>!['STOCK_COMMITTED','CANCELLED'].includes(g.status)).reduce((n:number,g:any)=>n+g._count,0);
    return {pendingPurchase,supplierOverdue,branchId:actor.branchId,asOf:new Date().toISOString(),lowStock:low?.total,expiring:expiring?.total,capabilities:caps,stock:stock?{total:stock.total,quality:stock.quality,valuation:stock.valuation}:null,queues:active,purchases,unlinked,recent:docs.rows.slice(0,8)};
  }
  async suppliers(actor:WorkflowActor){await this.require(actor,'inventory:item:read');return this.prisma.supplier.findMany({where:{branchId:actor.branchId},orderBy:{name:'asc'}});}
  async owners(actor:WorkflowActor){await this.workflow.permissions(actor);return this.prisma.user.findMany({where:{branchId:actor.branchId,isActive:true},select:{id:true,firstName:true,lastName:true,role:true},orderBy:{firstName:'asc'}});}

  /**
   * @cc [owner:nareshshah139,label:product] partial-intake-recovery
   * Incomplete invoice fields MUST be savable independently of posting validation. Source links
   * MUST refer to this branch's retained files; saving intake MUST NOT affect stock or payables.
   */
  async intake(actor:WorkflowActor,input?:Record<string,any>) {
    await this.require(actor,input?'inventory:po:create':'inventory:po:read');
    if(!input)return this.prisma.inventoryIntakeDraft.findMany({where:{branchId:actor.branchId,invoiceId:null},orderBy:{updatedAt:'desc'}});
    if(!input.requestKey||JSON.stringify(input.payload).length>1000000)throw new BadRequestException('A draft key and payload under 1 MB are required');
    const ids=[...new Set<string>(input.documentIds||[])];
    if((await this.prisma.pharmacyPurchaseInvoiceDocument.count({where:{branchId:actor.branchId,id:{in:ids}}}))!==ids.length)throw new BadRequestException('Original file does not belong to this branch');
    if(input.invoiceId&&!await this.prisma.pharmacyPurchaseInvoice.findFirst({where:{id:input.invoiceId,branchId:actor.branchId}}))throw new BadRequestException('Invoice does not belong to this branch');
    return this.workflow.transaction(async tx=>{
      const old=await tx.inventoryIntakeDraft.findUnique({where:{branchId_requestKey:{branchId:actor.branchId,requestKey:input.requestKey}}});
      if(old&&old.version!==input.version)throw new ConflictException('The recovered intake draft changed in another tab. Reload before saving.');
      const data={payload:input.payload,documentIds:ids,channel:['MANUAL','OCR','CSV','GMAIL'].includes(input.channel)?input.channel:'MANUAL',invoiceId:input.invoiceId||null};
      return old?tx.inventoryIntakeDraft.update({where:{id:old.id,version:old.version},data:{...data,version:{increment:1}}}):tx.inventoryIntakeDraft.create({data:{...data,branchId:actor.branchId,requestKey:input.requestKey,createdBy:actor.id}});
    });
  }
  async credits(actor:WorkflowActor) {
    await this.require(actor,'pharmacy:purchase-ledger:read');
    const [credits,invoices]=await Promise.all([this.prisma.inventorySupplierCredit.findMany({where:{branchId:actor.branchId},include:{allocations:true},orderBy:{createdAt:'desc'}}),this.prisma.pharmacyPurchaseInvoice.findMany({where:{branchId:actor.branchId,status:'STOCK_COMMITTED'},include:{paymentAllocations:true},orderBy:{invoiceDate:'desc'}})]);
    return {credits:credits.map(c=>({...c,amount:Number(c.amount),applied:Number(c.applied),available:c.reversedAt?0:money(Number(c.amount)-Number(c.applied)),allocations:c.allocations.map(a=>({...a,amount:Number(a.amount)}))})),invoices:invoices.map(i=>({id:i.id,invoiceNumber:i.invoiceNumber,distributorGstin:i.distributorGstin,distributorName:i.distributorName,dueDate:i.dueDate,netPayable:i.netPayable,creditApplied:i.creditApplied,outstanding:money(i.netPayable-i.creditApplied-i.paymentAllocations.reduce((n,a)=>n+a.amount,0))}))};
  }
  /**
   * @cc [owner:nareshshah139,label:product] credit-allocation-atomic
   * Credit allocation MUST atomically reduce one same-supplier posted bill and one available credit;
   * duplicate request keys, over-allocation and cross-branch records cannot create extra credit.
   */
  async allocateCredit(actor:WorkflowActor,input:Record<string,any>) {
    await this.require(actor,'pharmacy:purchase-ledger:write');
    const value=money(Number(input.amount));if(!input.requestKey||!Number.isFinite(value)||value<=0)throw new BadRequestException('A positive amount and request key are required');
    return this.workflow.transaction(async tx=>{
      const exists=await tx.inventoryCreditAllocation.findUnique({where:{branchId_requestKey:{branchId:actor.branchId,requestKey:input.requestKey}}});if(exists)return exists;
      const credit=await tx.inventorySupplierCredit.findFirst({where:{id:input.creditId,branchId:actor.branchId,reversedAt:null}});
      const invoice=await tx.pharmacyPurchaseInvoice.findFirst({where:{id:input.purchaseInvoiceId,branchId:actor.branchId,status:'STOCK_COMMITTED'},include:{paymentAllocations:true}});
      if(!credit||!invoice||credit.supplierGstin!==invoice.distributorGstin)throw new BadRequestException('Select a posted bill for the same supplier GSTIN');
      const outstanding=money(invoice.netPayable-invoice.creditApplied-invoice.paymentAllocations.reduce((n:number,a:any)=>n+a.amount,0));
      if(value>money(Number(credit.amount)-Number(credit.applied))||value>outstanding)throw new BadRequestException('Amount exceeds available credit or bill balance');
      await tx.inventorySupplierCredit.update({where:{id:credit.id,applied:credit.applied},data:{applied:{increment:value}}});
      await tx.pharmacyPurchaseInvoice.update({where:{id:invoice.id,updatedAt:invoice.updatedAt},data:{creditApplied:{increment:value}}});
      return tx.inventoryCreditAllocation.create({data:{branchId:actor.branchId,creditId:credit.id,purchaseInvoiceId:invoice.id,amount:value,requestKey:input.requestKey,createdBy:actor.id}});
    });
  }
  async reverseAllocation(actor:WorkflowActor,id:string,reason:string) {
    await this.require(actor,'pharmacy:purchase-ledger:write');if(!reason?.trim())throw new BadRequestException('Enter a reversal reason');
    return this.workflow.transaction(async tx=>{const a=await tx.inventoryCreditAllocation.findFirst({where:{id,branchId:actor.branchId}});if(!a)throw new NotFoundException('Allocation not found');if(a.reversedAt)return a;
      await tx.inventorySupplierCredit.update({where:{id:a.creditId},data:{applied:{decrement:a.amount}}});
      await tx.pharmacyPurchaseInvoice.update({where:{id:a.purchaseInvoiceId,branchId:actor.branchId},data:{creditApplied:{decrement:Number(a.amount)}}});
      return tx.inventoryCreditAllocation.update({where:{id,reversedAt:null},data:{reversedAt:new Date(),reversedBy:actor.id,reversalReason:reason.trim()}});
    });
  }
  async createCount(actor:WorkflowActor,input:Record<string,any>) {
    await this.workflow.authorize(actor,'COUNT',true);
    const query=await this.stock(actor,{...input.filters,limit:100,page:1});let items=[...query.rows];
    for(let page=2;page<=query.totalPages;page++)items.push(...(await this.stock(actor,{...input.filters,limit:100,page})).rows);
    if(input.itemIds?.length)items=items.filter(i=>input.itemIds.includes(i.id));
    const settings=await this.workflow.settings(actor);if(input.daily)items=items.filter(i=>!i.metadata.lastCountAt||new Date(i.metadata.lastCountAt).toISOString().slice(0,10)!==new Date().toISOString().slice(0,10)).slice(0,settings.auditDailyCount);
    if(!items.length)throw new BadRequestException('No matching batches to count');
    return this.workflow.saveDocument(actor,{kind:'COUNT',reference:input.reference||`COUNT-${new Date().toISOString().slice(0,10)}`,requestKey:input.requestKey||randomUUID(),payload:{reason:'Physical stock verification',lines:items.map(i=>({inventoryId:i.id,quantity:0}))}});
  }
  async recommendTargets(actor:WorkflowActor,input:Record<string,any>={}) {
    await this.workflow.authorize(actor,'TARGET_REVIEW',true);const settings=await this.workflow.settings(actor);
    const since=new Date(Date.now()-settings.lookbackDays*86400000);
    const items=await this.prisma.inventoryItem.findMany({where:{branchId:actor.branchId,status:'ACTIVE'}});
    const sales=await this.prisma.stockTransaction.findMany({where:{branchId:actor.branchId,type:'SALE',createdAt:{gte:since}}});
    const demand=new Map<string,{quantity:number;orders:Set<string>}>();
    for(const s of sales){const d=demand.get(s.itemId)||{quantity:0,orders:new Set<string>()};d.quantity+=Math.max(0,-(movementDelta(s)||0));d.orders.add(s.reference||s.id);demand.set(s.itemId,d);}
    if(settings.includeBounce || settings.includeRefill){
      const requests=await this.prisma.inventoryWorkflowDocument.findMany({where:{branchId:actor.branchId,kind:'QUOTATION',status:'DRAFT',createdAt:{gte:since}}});
      for(const request of requests){const p=request.payload as any;if(!((settings.includeBounce&&p.source==='BOUNCE')||(settings.includeRefill&&p.source==='REFILL')))continue;for(const l of p.lines){const d=demand.get(l.inventoryId)||{quantity:0,orders:new Set<string>()};d.quantity+=l.quantity;d.orders.add(request.id);demand.set(l.inventoryId,d);}}
    }
    const lines=items.filter(i=>!settings.excludedItemIds.includes(i.id)&&!jsonObject(i.metadata).manualTargets).map(i=>{const d=demand.get(i.id),qualified=(d?.orders.size||0)>=settings.minimumOrders;return {inventoryId:i.id,quantity:1,minStockLevel:qualified?Math.ceil(d!.quantity/settings.lookbackDays*settings.minCoverDays):(i.minStockLevel||0),maxStockLevel:qualified?Math.ceil(d!.quantity/settings.lookbackDays*settings.maxCoverDays):(i.maxStockLevel||0)};});
    if(!lines.length)throw new BadRequestException('No eligible batches. Check manual overrides and excluded items.');
    return this.workflow.saveDocument(actor,{kind:'TARGET_REVIEW',reference:`TARGET-${new Date().toISOString().slice(0,10)}`,requestKey:input.requestKey||randomUUID(),payload:{lines,reason:'Demand-based target proposal',calculation:{lookbackDays:settings.lookbackDays,minCoverDays:settings.minCoverDays,maxCoverDays:settings.maxCoverDays,minimumOrders:settings.minimumOrders,coldStart:'Retain saved targets until minimum order history exists',sales:sales.length}}});
  }
  async replenish(actor:WorkflowActor,input:Record<string,any>={}) {
    await this.workflow.authorize(actor,'SHORTBOOK',true);
    const items=await this.prisma.inventoryItem.findMany({where:{branchId:actor.branchId,status:'ACTIVE'}});
    const active=await this.prisma.inventoryWorkflowDocument.findMany({where:{branchId:actor.branchId,kind:'SHORTBOOK',status:{in:['DRAFT','AWAITING_APPROVAL','APPROVED','ORDERED']}}});
    const present=new Set(active.flatMap(d=>(d.payload as any).lines.map((l:any)=>l.inventoryId)));
    const eligible=items.filter(i=>!present.has(i.id)&&i.currentStock-i.heldStock<=(i.minStockLevel??i.reorderLevel??-1)&&(i.maxStockLevel||0)>i.currentStock-i.heldStock);
    if(!eligible.length)return {created:[],message:'No new shortages. Existing Shortbook entries are retained.'};
    const suppliers=await this.prisma.supplier.findMany({where:{branchId:actor.branchId,isActive:true}});
    const bySupplier=new Map<string,any[]>();for(const i of eligible){const supplier=suppliers.find(s=>s.name.toLowerCase()===i.supplier?.toLowerCase());const key=supplier?.id||'';bySupplier.set(key,[...(bySupplier.get(key)||[]),{inventoryId:i.id,quantity:(i.maxStockLevel||0)-(i.currentStock-i.heldStock)}]);}
    const created:any[]=[];for(const [supplierId,lines]of bySupplier)created.push(await this.workflow.saveDocument(actor,{kind:'SHORTBOOK',reference:`NEED-${new Date().toISOString().slice(0,10)}-${created.length+1}`,supplierId:supplierId||undefined,requestKey:`replenish:${input.requestKey||randomUUID()}:${supplierId}`,payload:{lines,source:'LOW_STOCK',reason:'Below minimum; replenish to maximum'}}));
    return {created};
  }
  /**
   * @cc [owner:nareshshah139,label:product] return-source-complete-history
   * Sale-source lookup MUST search the authenticated branch's complete eligible history before
   * paging, preserve original terms and remaining return capacity, and exclude reversed sales.
   */
  async salesMovements(actor:WorkflowActor,q:Record<string,any>={}) {
    await this.require(actor,'pharmacy:invoice:read');
    const search=String(q.search||'').trim(),where:any={branchId:actor.branchId,type:'SALE',...(q.itemId?{itemId:q.itemId}:{})};
    if(search)where.OR=[{reference:{contains:search,mode:'insensitive'}},{item:{name:{contains:search,mode:'insensitive'}}},{item:{barcode:search}},{item:{sku:search}}];
    const rows=await this.prisma.stockTransaction.findMany({where,include:{item:true},orderBy:[{createdAt:'desc'},{id:'asc'}]});
    const [used,reversed]=await Promise.all([
      this.prisma.inventoryWorkflowEffect.groupBy({by:['sourceLineId'],where:{branchId:actor.branchId,sourceLineId:{in:rows.map(r=>r.id)}},_sum:{sourceQuantity:true}}),
      this.prisma.inventoryWorkflowDocument.findMany({where:{branchId:actor.branchId,kind:'COUNTER_SALE',status:'REVERSED'},select:{id:true}}),
    ]);
    const owners=await this.movementOwners(actor.branchId,rows),reversedIds=new Set(reversed.map(d=>d.id));
    const eligible=rows.map(r=>{const metadata=jsonObject(r.notes),terms=metadata.saleTerms||null;return {...r,item:this.present(r.item),owner:owners.get(r.id)||null,saleTerms:terms,priceBasis:terms?'Recorded original sale terms':'Legacy sale price; tax/discount terms not recorded',availableReturn:r.quantity-(used.find(e=>e.sourceLineId===r.id)?._sum.sourceQuantity||0),reversed:reversedIds.has(metadata.workflowDocumentId)};}).filter(r=>r.availableReturn>0&&!r.reversed&&r.owner?.status!=='CANCELLED');
    if(q.page===undefined)return eligible;
    const page=Math.max(1,Number(q.page)||1),limit=Math.min(100,Math.max(1,Number(q.limit)||30));
    return {rows:eligible.slice((page-1)*limit,page*limit),total:eligible.length,page,limit,totalPages:Math.ceil(eligible.length/limit)};
  }
  private async movementOwners(branchId:string,movements:any[]) {
    const [effects,purchases,sales]=await Promise.all([
      this.prisma.inventoryWorkflowEffect.findMany({where:{branchId,transactionId:{in:movements.map(m=>m.id)}},include:{document:{select:{id:true,kind:true,status:true}}}}),
      this.prisma.pharmacyPurchaseInvoice.findMany({where:{branchId,OR:[{stockCommitReference:{in:movements.map(m=>m.reference).filter(Boolean)}},{invoiceNumber:{in:movements.map(m=>m.reference).filter(Boolean)}}]},select:{id:true,invoiceNumber:true,stockCommitReference:true,status:true}}),
      this.prisma.pharmacyInvoice.findMany({where:{branchId,invoiceNumber:{in:movements.filter(m=>m.reference?.startsWith('INV-')).map(m=>m.reference.slice(4))}},select:{id:true,invoiceNumber:true,status:true}}),
    ]);
    const owners=new Map<string,any>();for(const m of movements){const e=effects.find(e=>e.transactionId===m.id),p=purchases.find(p=>p.stockCommitReference===m.reference||p.invoiceNumber===m.reference),sale=sales.find(s=>`INV-${s.invoiceNumber}`===m.reference);if(e)owners.set(m.id,{type:'workflow',...e.document});else if(p)owners.set(m.id,{type:'purchase',kind:'PURCHASE_INVOICE',id:p.id,status:p.status});else if(sale)owners.set(m.id,{type:'sale',kind:'PHARMACY_INVOICE',id:sale.id,status:sale.status});}return owners;
  }
  /**
   * @cc [owner:nareshshah139,label:product] eligible-hold-source-balances
   * Hold selection MUST show source-specific remaining held units after active disposals/returns,
   * not the batch's pooled held balance. Released sources remain visible only in history mode.
   */
/**
 * @cc [owner:nareshshah139,label:product;target] inventory-hold-availability-visible
 * Blocked or quarantined quantities MUST be visible separately from on-hand and available-to-sell
 * quantities; releasing a hold MUST NOT manufacture a receipt or erase its reason.
 * Acceptance: INV-33. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
  async holdSources(actor:WorkflowActor,q:Record<string,any>={}) {
    const capabilities=await this.workflow.capabilities(actor),kinds=['HOLD','SALES_RETURN'].filter(k=>capabilities.kinds[k]?.read);
    if(!kinds.length)throw new ForbiddenException('This action requires access to held-stock documents');
    const docs=await this.prisma.inventoryWorkflowDocument.findMany({where:{branchId:actor.branchId,kind:{in:kinds},status:{in:q.history==='true'?['POSTED','RELEASED','REVERSED']:['POSTED']}},include:{effects:true},orderBy:[{createdAt:'desc'},{id:'asc'}]});
    const [consumers,users]=await Promise.all([
      this.prisma.inventoryWorkflowDocument.findMany({where:{branchId:actor.branchId,kind:{in:['LOSS','SUPPLIER_RETURN']},status:{in:['POSTED','CHALLAN']}},include:{effects:true}}),
      this.prisma.user.findMany({where:{branchId:actor.branchId,id:{in:docs.map(d=>d.createdBy)}},select:{id:true,firstName:true,lastName:true}}),
    ]);
    const rows=docs.map(doc=>{const payload:any=doc.payload;const balances=new Map<string,number>();for(const e of doc.effects)if(e.inventoryId)balances.set(e.inventoryId,(balances.get(e.inventoryId)||0)+e.heldDelta);for(const c of consumers)if((c.payload as any).sourceHoldId===doc.id)for(const e of c.effects)if(e.inventoryId)balances.set(e.inventoryId,(balances.get(e.inventoryId)||0)+e.heldDelta);const owner=users.find(u=>u.id===doc.createdBy);const uniqueLines=[...new Map<string,any>((payload.lines||[]).map((l:any)=>[l.inventoryId,l])).values()];const lines=uniqueLines.filter((l:any)=>(!q.itemId||l.inventoryId===q.itemId)&&doc.effects.some(e=>e.inventoryId===l.inventoryId&&e.heldDelta!==0)).map((l:any)=>({...l,remainingHeld:['RELEASED','REVERSED'].includes(doc.status)?0:Math.max(0,balances.get(l.inventoryId)||0)}));return {...doc,payload:{...payload,lines},ownerName:owner?`${owner.firstName} ${owner.lastName}`:doc.createdBy,reason:payload.reason,remainingHeld:lines.reduce((n:number,l:any)=>n+l.remainingHeld,0)};}).filter(doc=>(q.history==='true'?doc.payload.lines.length>0:doc.remainingHeld>0)&&(!q.search||`${doc.reference} ${doc.payload.lines.map((l:any)=>l.name).join(' ')}`.toLowerCase().includes(String(q.search).toLowerCase())));
    const page=q.internalAll===true?1:Math.max(1,Number(q.page)||1),limit=q.internalAll===true?Math.max(1,rows.length):Math.min(100,Math.max(1,Number(q.limit)||30));return {rows:rows.slice((page-1)*limit,page*limit),total:rows.length,page,limit,totalPages:Math.ceil(rows.length/limit)};
  }
  /**
   * @cc [owner:nareshshah139,label:product] correction-respects-document-owner
   * Generic movement correction MUST reject workflow, purchase and sales invoice movements;
   * their owning document must retain control of stock, source limits and monetary effects.
   */
/**
   * @cc [owner:nareshshah139,label:product;target] inventory-adjustment-direction
   * A stock adjustment MUST persist an unambiguous signed delta equal to its stock-balance change;
   * an absolute quantity with type ADJUSTMENT and no direction is insufficient.
   * Acceptance: INV-32. Validation and open gaps:
   * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
   */
  async correctMovement(actor:WorkflowActor,input:Record<string,any>) {
    await this.require(actor,'inventory:adjustment:create');if(!['OWNER','ADMIN','MANAGER'].includes(actor.role))throw new ForbiddenException('A manager must correct a posted movement');
    if(!input.reason?.trim()||!input.requestKey)throw new BadRequestException('Reason and request key are required');
    return this.workflow.transaction(async tx=>{
      const duplicate=await tx.inventoryWorkflowDocument.findUnique({where:{branchId_requestKey:{branchId:actor.branchId,requestKey:input.requestKey}}});if(duplicate)return duplicate;
      const source=await tx.stockTransaction.findFirst({where:{id:input.transactionId,branchId:actor.branchId}});if(!source)throw new NotFoundException('Movement not found');
      const info=jsonObject(source.notes);
      if (info.workflowDocumentId || /^INV-|^PI-|^PINV-|^PURCHASE-/.test(source.reference||'') || await tx.inventoryWorkflowEffect.count({where:{branchId:actor.branchId,transactionId:source.id}})) throw new BadRequestException('Correct the source workflow or invoice; direct movement correction would bypass its stock and accounting history');
      const original=movementDelta(source);if(original==null)throw new BadRequestException('Historical direction is unknown; record an approved physical count instead');
      if(!Number.isSafeInteger(input.correctDelta))throw new BadRequestException('Correct quantity must be a signed whole number');
      const prior=await tx.inventoryWorkflowEffect.findMany({where:{branchId:actor.branchId,sourceLineId:source.id}});
      const delta=input.correctDelta-original-prior.reduce((n:number,e:any)=>n+e.quantityDelta,0);if(!delta)throw new BadRequestException('This movement already has the requested corrected quantity');
      const doc=await tx.inventoryWorkflowDocument.create({data:{branchId:actor.branchId,kind:'CORRECTION',status:'POSTED',reference:`COR-${source.reference||source.id}`,requestKey:input.requestKey,createdBy:actor.id,postedBy:actor.id,postedAt:new Date(),payload:{reason:input.reason,lines:[],originalMovementId:source.id,correctDelta:input.correctDelta}}});
      const movement=await writeStockMovement(tx,{branchId:actor.branchId,userId:actor.id,itemId:source.itemId,delta,type:'ADJUSTMENT',unitPrice:source.unitPrice,reason:input.reason,reference:`WF-${doc.reference}`,metadata:{workflowDocumentId:doc.id,originalMovementId:source.id}});
      await tx.inventoryWorkflowEffect.create({data:{documentId:doc.id,branchId:actor.branchId,effectKey:doc.id,lineId:source.id,inventoryId:source.itemId,transactionId:movement.id,sourceLineId:source.id,quantityDelta:delta}});
      await this.workflow.event(tx,doc,actor,'POST',null,{originalMovementId:source.id,delta,reason:input.reason});return doc;
    });
  }
}
