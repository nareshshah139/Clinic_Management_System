import type { ComponentProps } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface RowInsertion<T> {
  rows: T[];
  focusIndex: number;
}

/**
 * Places a blank row directly under `index`. A blank row already sitting there is
 * reused, so asking twice leaves one row and the doctor still lands on it.
 */
export function insertBlankBelow<T>(rows: readonly T[], index: number, makeBlank: () => T, isBlank: (row: T) => boolean): RowInsertion<T> {
  const at = Math.min(Math.max(index, -1), rows.length - 1) + 1;
  if (at < rows.length && isBlank(rows[at])) return { rows: [...rows], focusIndex: at };
  return { rows: [...rows.slice(0, at), makeBlank(), ...rows.slice(at)], focusIndex: at };
}

export function rowDescription(medicineName: string | undefined, index: number): string {
  return medicineName?.trim() || `row ${index + 1}`;
}

export function AddRowBelowButton({ medicineName, index, onClick }: { medicineName?: string; index: number; onClick: () => void }) {
  const label = `Add a medicine below ${rowDescription(medicineName, index)}`;
  return (
    <Button type="button" size="icon" variant="outline" aria-label={label} title={label} onClick={onClick}>
      <Plus aria-hidden="true" />
    </Button>
  );
}

const FIELD_TEXT = 'px-3 py-1.5 text-base md:text-sm [overflow-wrap:anywhere]';

/**
 * A single logical line that wraps instead of clipping. The hidden mirror gives the grid cell the
 * height of the wrapped text, so the field grows with its content in every browser.
 */
export function WrappingTextField({ value, onValueChange, className, onKeyDown, ...props }: Omit<ComponentProps<'textarea'>, 'value' | 'onChange'> & { value: string; onValueChange: (value: string) => void }) {
  return (
    <div className="grid">
      <div aria-hidden="true" className={cn('invisible col-start-1 row-start-1 min-h-9 whitespace-pre-wrap rounded-md border', FIELD_TEXT)}>{`${value}\n`}</div>
      <Textarea
        {...props}
        rows={1}
        value={value}
        className={cn('col-start-1 row-start-1 min-h-9 resize-none overflow-hidden', FIELD_TEXT, className)}
        onChange={(event) => onValueChange(event.target.value.replace(/\s*\n\s*/g, ' '))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault();
          onKeyDown?.(event);
        }}
      />
    </div>
  );
}
