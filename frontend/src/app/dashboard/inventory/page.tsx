'use client';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { Suspense } from 'react';
import { InventoryWorkspace } from '@/components/inventory/InventoryWorkspace';









export default function InventoryPage(){return <Suspense fallback={<LoadingSkeleton label="Loading inventory…" />}><InventoryWorkspace/></Suspense>;}
