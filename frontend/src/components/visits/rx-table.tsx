import type { ComponentProps, ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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

function RowIconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" size="icon" variant="outline" aria-label={label} title={label} onClick={onClick}>
      {children}
    </Button>
  );
}

export function AddRowBelowButton({ medicineName, index, onClick }: { medicineName?: string; index: number; onClick: () => void }) {
  return <RowIconButton label={`Add a medicine below ${rowDescription(medicineName, index)}`} onClick={onClick}><Plus aria-hidden="true" /></RowIconButton>;
}

export function RemoveRowButton({ medicineName, index, onClick }: { medicineName?: string; index: number; onClick: () => void }) {
  return <RowIconButton label={`Remove ${rowDescription(medicineName, index)}`} onClick={onClick}><Trash2 aria-hidden="true" /></RowIconButton>;
}

const cell = 'min-w-0 align-top @6xl:table-cell @6xl:py-2';
const roomy = `${cell} @6xl:px-3`;
const snug = `${cell} @6xl:px-2`;
const rowBox = 'grid grid-flow-dense items-start gap-x-2 px-2 @6xl:table-row @6xl:p-0';
const tracks = {
  prescription: 'grid-cols-[7.25rem_minmax(0,1fr)_4.75rem] @lg:grid-cols-[9.75rem_minmax(0,1fr)_7.25rem_4.5rem_4.75rem]',
  template: 'grid-cols-[7.25rem_minmax(0,1fr)_4.75rem] @lg:grid-cols-[9.75rem_minmax(0,1fr)_15rem_4.5rem_4.75rem]',
} as const;

/**
 * One medicine per row in three arrangements chosen by the container width, all from the same
 * table markup so the DOM (and focus) order is medicine, frequency, when, duration, instructions,
 * actions everywhere:
 * - under 32rem (phones): medicine; frequency and when; duration with the row buttons; instructions.
 * - 32rem to 72rem (the 1280 laptop): medicine, frequency, when; then duration, instructions and
 *   the row buttons. Column headers show once above the list in the same two-line shape.
 * - 72rem and up: a fixed-layout table.
 */
function layoutFor(variant: keyof typeof tracks) {
  const pair = variant === 'template';
  return {
    wrapper: '@container',
    table: 'block w-full text-sm @6xl:table @6xl:table-fixed',
    columns: 'hidden @6xl:table-column-group',
    head: 'sr-only block bg-muted text-xs text-muted-foreground @lg:not-sr-only @6xl:table-header-group @6xl:text-sm @6xl:text-foreground',
    headRow: `${rowBox} ${tracks[variant]} gap-y-0.5 py-1.5`,
    actionsHead: `${snug} sr-only col-start-3 @lg:col-start-5 @lg:row-start-2 @6xl:not-sr-only`,
    body: 'block @6xl:table-row-group',
    row: `${rowBox} ${tracks[variant]} gap-y-1 border-t py-1 even:bg-muted @lg:gap-y-1.5 @lg:py-1.5 [&_[role=combobox]]:bg-white [&_input]:bg-white [&_textarea]:bg-white`,
    empty: 'block w-full px-3 py-3 text-center text-muted-foreground @6xl:table-cell',
    medicine: `${roomy} col-span-full @lg:col-start-1 @lg:col-end-3 @lg:row-start-1`,
    frequency: pair
      ? `${roomy} col-span-full @lg:col-start-3 @lg:col-end-4 @lg:row-start-1`
      : `${roomy} col-start-1 @lg:col-start-3 @lg:row-start-1`,
    when: pair
      ? `${roomy} col-span-full @lg:col-start-4 @lg:col-end-6 @lg:row-start-1`
      : `${roomy} col-start-2 col-end-4 @lg:col-start-4 @lg:col-end-6 @lg:row-start-1`,
    duration: `${snug} col-start-1 col-end-3 max-w-[9.75rem] @lg:col-end-2 @lg:row-start-2 @6xl:max-w-none`,
    instructions: `${roomy} relative col-span-full @lg:col-start-2 @lg:col-end-5 @lg:row-start-2`,
    actions: `${snug} col-start-3 @lg:col-start-5 @lg:row-start-2`,
  };
}

export const rxLayout = { prescription: layoutFor('prescription'), template: layoutFor('template') } as const;

/** Select triggers sized so a value such as "After Breakfast" or "MONTHS" fits its track on one line. */
export const rxSelect = 'w-full gap-1 px-1.5 py-1.5';

/** The stock hint sits on the medicine field's top border in the compact rows so the name keeps the width. */
export const rxStock = 'pointer-events-none absolute right-2 top-0 -translate-y-1/2 whitespace-nowrap rounded-sm bg-white px-1 text-[11px] leading-none text-muted-foreground @6xl:pointer-events-auto @6xl:static @6xl:translate-y-0 @6xl:bg-transparent @6xl:px-0 @6xl:text-xs';

const FIELD_TEXT = 'px-3 py-1 text-base md:py-1.5 md:text-sm [overflow-wrap:anywhere]';

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
