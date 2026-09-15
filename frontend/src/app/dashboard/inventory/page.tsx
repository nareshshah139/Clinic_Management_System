'use client';
import { Suspense } from 'react';
import { InventoryWorkspace } from '@/components/inventory/InventoryWorkspace';









export default function InventoryPage(){return <Suspense fallback={<p role="status">Loading inventory…</p>}><InventoryWorkspace/></Suspense>;}
