import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseHelp, PurchaseStatusCue } from '@/components/pharmacy/PurchaseHelp';

it('opens help on keyboard focus and dismisses with Escape without hiding the action', async () => {
  const user = userEvent.setup();
  render(<div style={{overflow:'hidden'}}><PurchaseHelp label="Stock units">Pack contents are not multiplied.</PurchaseHelp><button>Confirm review</button></div>);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  await user.tab();
  expect(screen.getByRole('button',{name:'Help: Stock units'})).toHaveFocus();
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Pack contents are not multiplied.');
  expect(screen.getByRole('button',{name:'Confirm review'})).toBeVisible();
  await user.keyboard('{Escape}');
  await waitFor(()=>expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
});

it('opens and closes by tapping without submitting the surrounding form', async () => {
  const submit=jest.fn(event=>event.preventDefault());
  render(<form onSubmit={submit}><PurchaseHelp label="Match">Check the pack against the original.</PurchaseHelp></form>);
  const trigger=screen.getByRole('button',{name:'Help: Match'});
  fireEvent.click(trigger);
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Check the pack');
  expect(trigger).toHaveAttribute('aria-expanded','true');
  fireEvent.click(trigger);
  await waitFor(()=>expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  expect(submit).not.toHaveBeenCalled();
});

it('opens on hover and pairs status colors with readable labels', async()=>{
  const user=userEvent.setup();
  render(<><PurchaseHelp label="Margin">Before selling discounts.</PurchaseHelp><PurchaseStatusCue tone="warning">Stock not added</PurchaseStatusCue></>);
  await user.hover(screen.getByRole('button',{name:'Help: Margin'}));
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Before selling discounts.');
  expect(screen.getByText('Stock not added')).toBeVisible();
});
