import { render, screen, within } from '@testing-library/react';
import { AlternateInvoiceIntake } from '@/components/inventory/AlternateInvoiceIntake';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn() } }));

it('lists the purchase CSV columns inside the format disclosure', () => {
  render(<AlternateInvoiceIntake mode="csv" onDraft={jest.fn()} onInvoice={jest.fn()} />);
  const details = screen.getByText('CSV format and required columns').closest('details') as HTMLElement;
  expect(within(details).getByText(/Columns, in this order:/)).toBeInTheDocument();
  expect(within(details).getByText('packUnitType')).toBeInTheDocument();
  expect(within(details).getByText('netPayable')).toBeInTheDocument();
  expect(within(details).getByText(/Start from the template \(Download purchase CSV template\) to get every column\./)).toBeInTheDocument();
});
