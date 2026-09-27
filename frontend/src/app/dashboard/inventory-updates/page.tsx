'use client';

import "@/components/inventory/inventory-readability.css";

import { InventoryUpdates } from '@/components/inventory/InventoryUpdates';

export default function InventoryUpdatesPage() {
  return (
    <main className="inventory-surface min-w-0 flex-1 space-y-6 py-4 sm:py-6">
      <InventoryUpdates />
    </main>
  );
}
