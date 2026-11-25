import fs from 'node:fs';
import path from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Printer } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RowAction } from '@/components/register/RowAction';
import { RegisterGrid, type RegisterColumn } from '@/components/register/RegisterGrid';
import { DateRangeFilter } from '@/components/register/RegisterFilters';
import type { RegisterLoad } from '@/components/register/useRegisterQuery';

describe('RowAction', () => {
  it('lets a keyboard user reach a blocked action and read why it is blocked', async () => {
    const user = userEvent.setup();
    const onPrint = jest.fn();
    render(
      <TooltipProvider delayDuration={0}>
        <button type="button">Open PHI-1</button>
        <RowAction label="Print PHI-1" hint="Print" icon={Printer} reason="Finish this draft bill first" onClick={onPrint} />
      </TooltipProvider>,
    );

    await user.tab();
    await user.tab();
    const print = screen.getByRole('button', { name: 'Print PHI-1' });
    expect(print).toHaveFocus();
    expect(print).toHaveAttribute('aria-disabled', 'true');
    expect(print).toHaveAccessibleDescription('Finish this draft bill first');
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Finish this draft bill first');

    await user.keyboard('{Enter}');
    expect(onPrint).not.toHaveBeenCalled();
  });
});

type Bill = { id: string; billNo: string };
const columns: RegisterColumn<Bill, 'billNo'>[] = [
  { key: 'billNo', label: 'Bill No', cell: (row) => row.billNo },
  { key: 'note', label: 'Note', cell: () => 'Paid in cash' },
];
const loaded: RegisterLoad<unknown> = { status: 'ready', data: {}, error: '' };

const renderGrid = (rows: Bill[], onRowClick = jest.fn()) => {
  render(
    <RegisterGrid
      label="Bills"
      noun="bills"
      columns={columns}
      rows={rows}
      load={loaded}
      sort={{ by: 'billNo', dir: 'asc' }}
      onSort={jest.fn()}
      onRowClick={onRowClick}
      onRetry={jest.fn()}
      empty={<p>No bills in this period</p>}
    />,
  );
  return onRowClick;
};

describe('RegisterGrid', () => {
  afterEach(() => window.getSelection()?.removeAllRanges());

  it('opens a row on a plain click', () => {
    const onRowClick = renderGrid([{ id: 'a', billNo: 'PHI-1' }]);
    fireEvent.click(screen.getByText('PHI-1'));
    expect(onRowClick).toHaveBeenCalledWith({ id: 'a', billNo: 'PHI-1' });
  });

  it('does not open a row when the user drags to select its text', () => {
    const onRowClick = renderGrid([{ id: 'a', billNo: 'PHI-1' }]);
    const cell = screen.getByText('PHI-1');
    const range = document.createRange();
    range.selectNodeContents(cell);
    window.getSelection()!.addRange(range);
    fireEvent.click(cell);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('opens a row when a selection elsewhere on the page is still active', () => {
    const onRowClick = renderGrid([{ id: 'a', billNo: 'PHI-1' }]);
    const outside = document.createElement('p');
    outside.textContent = 'Unrelated text';
    document.body.appendChild(outside);
    const range = document.createRange();
    range.selectNodeContents(outside);
    window.getSelection()!.addRange(range);
    fireEvent.click(screen.getByText('PHI-1'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    outside.remove();
  });
});

describe('DateRangeFilter custom dates', () => {
  const range = { from: '2026-10-01', to: '2026-10-31' };
  const openPanel = async (onChange = jest.fn()) => {
    const user = userEvent.setup();
    render(<DateRangeFilter range={range} today="2026-11-25" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Change dates, 01/10/2026 to 31/10/2026' }));
    const panel = within(screen.getByRole('group', { name: 'Custom dates' }));
    return { user, panel, onChange };
  };

  it('waits for Apply before judging a From date that is past the old To date', async () => {
    const { user, panel, onChange } = await openPanel();
    await user.clear(panel.getByLabelText('From'));
    await user.type(panel.getByLabelText('From'), '01/11/2026');
    await user.tab();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.clear(panel.getByLabelText('To'));
    await user.type(panel.getByLabelText('To'), '15/11/2026');
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();

    await user.click(panel.getByRole('button', { name: 'Apply' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ from: '2026-11-01', to: '2026-11-15' });
    expect(screen.queryByRole('group', { name: 'Custom dates' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Change dates/ })).toHaveFocus();
  });

  it('keeps the panel open with the reason when Apply meets a bad range', async () => {
    const { user, panel, onChange } = await openPanel();
    await user.clear(panel.getByLabelText('To'));
    await user.type(panel.getByLabelText('To'), '01/09/2026');
    await user.click(panel.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The From date is after the To date.');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('discards typed dates on Cancel and shows the applied ones when reopened', async () => {
    const { user, panel, onChange } = await openPanel();
    await user.clear(panel.getByLabelText('From'));
    await user.type(panel.getByLabelText('From'), '05/10/2026');
    await user.click(panel.getByRole('button', { name: 'Cancel' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Custom dates' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Change dates, 01/10/2026 to 31/10/2026' }));
    expect(within(screen.getByRole('group', { name: 'Custom dates' })).getByLabelText('From')).toHaveValue('01/10/2026');
  });
});

describe('globals.css focus styles', () => {
  const css = postcss.parse(fs.readFileSync(path.join(__dirname, '../../src/app/globals.css'), 'utf8'));
  const inLayer = (rule: Rule) => {
    for (let node = rule.parent; node; node = node.parent) {
      if (node.type === 'atrule' && (node as AtRule).name === 'layer') return true;
    }
    return false;
  };

  it('keeps the app-wide focus outline in a cascade layer so a control with its own ring shows only that ring', () => {
    const unlayered: string[] = [];
    css.walkRules((rule) => {
      if (rule.selector.includes(':focus-visible') && !rule.selector.startsWith('.high-contrast') && !inLayer(rule)) unlayered.push(rule.selector);
    });
    expect(unlayered).toEqual([]);
  });
});
