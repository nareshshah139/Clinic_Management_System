'use client';

import { Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RowAction } from '@/components/register/RowAction';
import { documentHref, type PurchaseDocument } from './purchase-register-model';

export function BillDocuments({ billNo, documents }: { billNo: string; documents: readonly PurchaseDocument[] }) {
  const label = `Open original bill ${billNo}`;
  if (documents.length === 0) return null;
  if (documents.length === 1) {
    return <RowAction label={label} hint={`Open ${documents[0].fileName}`} icon={Paperclip} href={documentHref(documents[0].id)} />;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} className="size-9 gap-0.5 lg:size-8 w-auto px-1.5">
          <Paperclip aria-hidden="true" className="size-5" />
          <span aria-hidden="true" className="text-xs font-semibold">{documents.length}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {documents.map((document) => (
          <DropdownMenuItem key={document.id} asChild>
            <a href={documentHref(document.id)} target="_blank" rel="noopener noreferrer">{document.fileName}</a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
