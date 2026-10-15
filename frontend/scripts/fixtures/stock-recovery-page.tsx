"use client";
import { ShelfIntelligence } from '@/components/inventory/ShelfIntelligence';
import { apiClient } from '@/lib/api';
let failed = false;
const items = ['a', 'b'].map(id => ({ id, name: `Synthetic stock ${id}`, currentStock: 10, minStockLevel: 0, costPrice: 1, sellingPrice: 2, mrp: 2, unit: 'PIECES', status: 'ACTIVE', type: 'MEDICINE', batchNumber: `B-${id}` }));
apiClient.getInventoryItems = async () => items as any;
apiClient.adjustStock = async data => {
  if (data.itemId === 'b' && !failed) { failed = true; throw new Error('Synthetic lost response'); }
  return { id: `movement-${data.itemId}`, ...data, quantityDelta: data.adjustmentQuantity };
};
export default function RecoveryQA() { return <main className="p-4"><ShelfIntelligence /></main>; }
