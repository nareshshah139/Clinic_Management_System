/** The wording each count carries next to its number, matching the server's one definition of it. */
export const LOW_STOCK_DEFINITION = 'at or below minimum stock';
export const UPCOMING_DEFINITION = 'rest of today and later days';
export const LOW_STOCK_HREF = '/dashboard/inventory?area=stock&view=list&stock=LOW';
export const OVERDUE_BILLS_DEFINITION = 'unpaid past their due date';
/** The register has no due-date filter, so overdue bills open the outstanding bills, which hold every one of them. */
export const OVERDUE_BILLS_HREF = '/dashboard/billing?status=outstanding';
