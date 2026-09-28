import { redirect } from 'next/navigation';

/**
 * @cc [owner:nareshshah139,label:product] legacy-inventory-updates-destination
 * Existing Inventory Updates bookmarks MUST open the approval queue inside Inventory.
 */
export default function InventoryUpdatesPage() {
  redirect('/dashboard/inventory?area=stock&view=approvals');
}
