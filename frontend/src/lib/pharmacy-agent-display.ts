const labels = {
  risk: { LOW: 'Low risk', MEDIUM: 'Moderate risk', HIGH: 'High risk' },
  status: { PENDING_REVIEW: 'Awaiting review', APPLIED: 'Applied', REJECTED: 'Rejected', FAILED: 'Failed', EXPIRED: 'Expired' },
  action: {
    create_drug: 'Add medicine', update_drug: 'Update medicine',
    create_inventory_item: 'Add stock item', update_inventory_item: 'Update stock item',
    adjust_stock: 'Correct stock quantity', create_purchase_invoice_draft: 'Draft purchase invoice',
    review_purchase_invoice: 'Review purchase invoice', commit_purchase_invoice_stock: 'Add purchased stock',
  },
  target: { drug: 'Medicine', inventory_item: 'Stock item', pharmacy_purchase_invoice: 'Purchase invoice' },
  permission: {
    'pharmacy:drug:create': 'Permission to add medicines',
    'pharmacy:drug:update': 'Permission to update medicines',
    'inventory:item:create': 'Permission to add stock items',
    'inventory:item:update': 'Permission to update stock items',
    'inventory:adjustment:create': 'Permission to correct stock quantities',
    'pharmacy:purchase-invoice:create': 'Permission to create purchase invoices',
    'pharmacy:purchase-invoice:review': 'Permission to review purchase invoices',
    'pharmacy:purchase-invoice:commit-stock': 'Permission to add purchased stock',
    'pharmacy:agent:use': 'Permission to use the pharmacy assistant',
    'pharmacy:agent:proposal:apply': 'Permission to apply reviewed suggestions',
  },
};
const unknown = {
  risk: 'Risk not specified', status: 'Status unavailable', action: 'Other action',
  target: 'Other record', permission: 'Additional permission required',
};

/**
 * @cc [owner:nareshshah139,label:product] pharmacy-chat-title-display
 * Only the exact legacy default Agentic Pharmacy and missing or blank titles MUST display as
 * Pharmacy assistant. Custom titles MUST remain unchanged; stored titles and messages are not mutated.
 */
export function pharmacyChatTitle(title: string | null | undefined): string {
  return !title?.trim() || title === 'Agentic Pharmacy' ? 'Pharmacy assistant' : title;
}

/**
 * @cc [owner:nareshshah139,label:product] pharmacy-proposal-labels
 * Known proposal codes MUST display their fixed readable labels. Unknown codes MUST display
 * a category-specific fallback without changing permission keys or exposing them as primary copy.
 */
export function pharmacyProposalLabel(kind: keyof typeof labels, value: string): string {
  const map: Record<string, string> = labels[kind];
  return Object.prototype.hasOwnProperty.call(map, value) ? map[value] : unknown[kind];
}
