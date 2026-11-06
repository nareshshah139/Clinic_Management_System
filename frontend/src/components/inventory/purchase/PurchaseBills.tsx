'use client';

import { ChevronDown, FileDown, Plus, Truck, Wallet } from 'lucide-react';
import { getISTDateString } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { parseQuery } from '@/components/register/register-query';
import { PurchaseRegister } from './PurchaseRegister';
import { PurchaseReturnsRegister } from './PurchaseReturnsRegister';
import type { ReturnKind } from './purchase-returns-model';
import { PURCHASE_QUERY, PURCHASE_REGISTERS, PURCHASE_REGISTER_COPY, exportHref, type PurchaseRegisterKind } from './purchase-register-model';

const NO_PARAMS = new URLSearchParams();

const tabOf = (params: Pick<URLSearchParams, 'get'>): PurchaseRegisterKind =>
  PURCHASE_REGISTERS.find((register) => register === params.get('tab')) ?? PURCHASE_REGISTERS[0];

export function PurchaseBills({
  searchParams,
  onParamsChange,
  onTabChange = onParamsChange,
  canSettle,
  onOpen,
  onNew,
  onOpenReturn,
  onNewReturn,
  onLedger,
  onSuppliers,
}: {
  searchParams: Pick<URLSearchParams, 'get' | 'toString'>;
  onParamsChange: (params: URLSearchParams) => void;
  onTabChange?: (params: URLSearchParams) => void;
  canSettle: boolean;
  onOpen: (invoiceId: string) => void;
  onNew: () => void;
  onOpenReturn: (kind: ReturnKind, documentId: string) => void;
  onNewReturn: () => void;
  onLedger: ((gstin?: string) => void) | null;
  onSuppliers: () => void;
}) {
  const tab = tabOf(searchParams);
  const withTab = (register: PurchaseRegisterKind, params: URLSearchParams) => {
    const next = new URLSearchParams(params);
    if (register !== PURCHASE_REGISTERS[0]) next.set('tab', register);
    return next;
  };
  const exportUrl = () => exportHref(PURCHASE_REGISTER_COPY[tab].endpoint, parseQuery(PURCHASE_QUERY, searchParams, getISTDateString()));

  return (
    <Tabs value={tab} onValueChange={(value: string) => onTabChange(withTab(value as PurchaseRegisterKind, NO_PARAMS))}>
      <section aria-label="Purchase bills" className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <TabsList aria-label="Purchase registers">
            {PURCHASE_REGISTERS.map((register) => (
              <TabsTrigger key={register} value={register} className="min-h-10 px-4 text-sm">{PURCHASE_REGISTER_COPY[register].tab}</TabsTrigger>
            ))}
          </TabsList>
          <div className="flex items-center gap-2">
            {tab === 'returns' ? (
              <Button className="h-10 text-sm" aria-label="New return" onClick={onNewReturn}>
                <Plus aria-hidden="true" /> New<span className="max-sm:hidden"> return</span>
              </Button>
            ) : (
              <Button className="h-10 text-sm" aria-label="New purchase" onClick={onNew}>
                <Plus aria-hidden="true" /> New<span className="max-sm:hidden"> purchase</span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 text-sm">
                  More <ChevronDown aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {PURCHASE_REGISTER_COPY[tab].exportable && (
                  <>
                    <DropdownMenuItem onSelect={() => window.open(exportUrl(), '_blank')}>
                      <FileDown aria-hidden="true" /> Export to Excel
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {onLedger && (
                  <DropdownMenuItem onSelect={() => onLedger(searchParams.get('gstin') || undefined)}>
                    <Wallet aria-hidden="true" /> Payments &amp; dues
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={onSuppliers}>
                  <Truck aria-hidden="true" /> Suppliers
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {PURCHASE_REGISTERS.map((register) => (
          <TabsContent key={register} value={register} forceMount hidden={register !== tab} className="min-w-0">
            {register === 'returns' ? (
              <PurchaseReturnsRegister
                active={register === tab}
                searchParams={register === tab ? searchParams : NO_PARAMS}
                onParamsChange={(params) => register === tab && onParamsChange(withTab(register, params))}
                canWrite={canSettle}
                onOpen={onOpenReturn}
                onNew={onNewReturn}
              />
            ) : (
              <PurchaseRegister
                active={register === tab}
                searchParams={register === tab ? searchParams : NO_PARAMS}
                onParamsChange={(params) => register === tab && onParamsChange(withTab(register, params))}
                canSettle={canSettle}
                onOpen={onOpen}
                onNew={onNew}
                onLedger={onLedger}
              />
            )}
          </TabsContent>
        ))}
      </section>
    </Tabs>
  );
}
