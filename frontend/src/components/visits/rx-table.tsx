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

const cell = 'block align-top before:mb-1 before:block before:text-xs before:font-medium before:text-gray-500 before:content-[attr(data-label)] @6xl:table-cell @6xl:w-auto @6xl:py-2 @6xl:before:hidden';
const roomy = `${cell} @6xl:px-3`;
const snug = `${cell} @6xl:px-2`;

/**
 * Below a 72rem container each medicine is a short stack (name, regimen, instructions) so nothing
 * hides behind a sideways scroll; from 72rem up the same markup is a fixed-layout table.
 */
export const rxLayout = {
  wrapper: '@container overflow-x-auto',
  table: 'block w-full text-sm @6xl:table @6xl:table-fixed',
  columns: 'hidden @6xl:table-column-group',
  head: 'block sr-only bg-gray-50 text-gray-700 @6xl:not-sr-only @6xl:table-header-group',
  body: 'block @6xl:table-row-group',
  row: 'flex flex-wrap items-start gap-x-2 gap-y-2 border-t px-3 py-3 @6xl:table-row @6xl:p-0',
  empty: 'block w-full px-3 py-3 text-center text-gray-500 @6xl:table-cell',
  medicine: `${roomy} w-full`,
  frequency: `${roomy} min-w-[8.5rem] flex-1`,
  when: `${roomy} min-w-[7.5rem] flex-1`,
  duration: `${snug} flex-none`,
  instructions: `${roomy} relative min-w-[12rem] flex-1 @6xl:min-w-0`,
  actions: `${snug} ml-auto flex-none`,
} as const;

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
