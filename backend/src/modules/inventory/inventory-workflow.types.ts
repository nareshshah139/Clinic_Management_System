import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const WORKFLOW_KINDS = ['OPENING_STOCK', 'SUPPLIER_RETURN', 'SALES_RETURN', 'LOSS', 'HOLD', 'COUNT', 'CORRECTION', 'SHORTBOOK', 'PURCHASE_ORDER', 'INWARD_CHALLAN', 'GATE_PASS', 'QUOTATION', 'COUNTER_SALE', 'CREDIT_NOTE', 'TARGET_REVIEW'] as const;
export type WorkflowKind = typeof WORKFLOW_KINDS[number];
export type WorkflowActor = { id: string; branchId: string; role: string; permissions?: string | string[] };
export type WorkflowLine = {
  id: string; inventoryId: string; name?: string; batchNumber?: string; expiryDate?: string;
  unit?: string; quantity: number; freeQuantity?: number; unitPrice?: number; mrp?: number;
  discountPercent?: number; schemeAmount?: number; gstRate?: number; sourceLineId?: string;
  physicalStock?: number; systemStock?: number; disposition?: 'RESTOCK' | 'QUARANTINE' | 'LOSS';
  minStockLevel?: number; maxStockLevel?: number; beforeMin?: number | null; beforeMax?: number | null;
  originalTerms?: Record<string,any>; fefoOverrideReason?:string;
  manual?: boolean; location?: string; taxable?: number; tax?: number; total?: number;
};
export class SaveWorkflowDocumentDto {
  @IsIn(WORKFLOW_KINDS) kind: WorkflowKind;
  @IsString() @MaxLength(160) reference: string;
  @IsString() @MaxLength(150) requestKey: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() sourceId?: string;
  @IsOptional() @IsString() purchaseInvoiceId?: string;
  @IsOptional() @IsString() salesInvoiceId?: string;
  @IsOptional() @IsInt() @Min(1) version?: number;
  @IsObject() payload: Record<string, any>;
}
export class TransitionWorkflowDto {
  @IsInt() @Min(1) version: number;
  @IsIn(['SUBMIT', 'APPROVE', 'REJECT', 'CHALLAN', 'POST', 'CANCEL', 'RELEASE', 'REVERSE', 'ACCEPT', 'CREATE_PO', 'CONVERT_SALE']) action: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) lineIds?: string[];
}
export const DEFAULT_INVENTORY_SETTINGS = {
  auditEnabled: false, auditDailyCount: 10, auditAdjustmentMode: 'APPROVAL',
  approvalValue: 5000, negativeCountNeedsApproval: true,
  autoMinMaxEnabled: false, lookbackDays: 60, minimumOrders: 1,
  minCoverDays: 10, maxCoverDays: 60, refreshDays: 7,
  includeBounce: false, includeRefill: true, excludedItemIds: [] as string[],
  autoPoEnabled: false, ownerId: '', priceFormula: 'stock-unit-tax-exclusive-v1',
};
