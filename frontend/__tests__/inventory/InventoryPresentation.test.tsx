import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Download } from 'lucide-react';
import { InventoryAction, InventoryDetails } from '@/components/inventory/InventoryPresentation';

it('names an icon action, portals its keyboard tooltip and dismisses with Escape', async () => {
  const user = userEvent.setup();
  const { container } = render(<div style={{ overflow: 'hidden' }}>
    <InventoryAction label="Export matching stock"><Download /></InventoryAction>
  </div>);
  await user.tab();
  expect(screen.getByRole('button', { name: 'Export matching stock' })).toHaveFocus();
  const tooltip = await screen.findByRole('tooltip');
  expect(tooltip).toHaveTextContent('Export matching stock');
  expect(container).not.toContainElement(tooltip);
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
});

it('supports hover help and invokes only its action inside a form', async () => {
  const user = userEvent.setup(), submit = jest.fn(), action = jest.fn();
  render(<form onSubmit={submit}><InventoryAction label="Download CSV template" onClick={action}><Download /></InventoryAction></form>);
  const button = screen.getByRole('button', { name: 'Download CSV template' });
  await user.hover(button);
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Download CSV template');
  await user.click(button);
  expect(action).toHaveBeenCalledTimes(1);
  expect(submit).not.toHaveBeenCalled();
});

it('keeps guidance collapsed until requested, with posting status outside', async () => {
  const user = userEvent.setup();
  render(<><p role="status">Stock not added</p><InventoryDetails summary="CSV format"><p>Repeat the bill header on each row.</p></InventoryDetails></>);
  expect(screen.getByRole('status')).toBeVisible();
  expect(screen.getByText('Repeat the bill header on each row.')).not.toBeVisible();
  await user.click(screen.getByText('CSV format'));
  expect(screen.getByText('Repeat the bill header on each row.')).toBeVisible();
  expect(screen.getByRole('status')).toBeVisible();
});
