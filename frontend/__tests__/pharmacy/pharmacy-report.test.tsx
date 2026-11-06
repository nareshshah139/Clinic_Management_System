import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PharmacyReportPage from '@/app/dashboard/pharmacy-report/page';
import { reportCsv, reportExportMatrix, downloadReportPdf } from '@/app/dashboard/pharmacy-report/report-export';
import { apiClient } from '@/lib/api';
import * as xlsx from 'xlsx';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('@/app/dashboard/pharmacy-report/report-export', () => ({
  ...jest.requireActual('@/app/dashboard/pharmacy-report/report-export'),
  reportCsv: jest.fn(jest.requireActual('@/app/dashboard/pharmacy-report/report-export').reportCsv),
  downloadReportPdf: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('xlsx', () => ({ utils: { book_new: jest.fn(() => ({})), aoa_to_sheet: jest.fn(matrix => matrix), book_append_sheet: jest.fn() }, writeFile: jest.fn() }));

const sale = (number: string, party: string, total: number) => ({ kind: 'Sale', date: '2026-11-05', entry: '2026-11-05T09:00:00Z', number, party, phone: '123', gross: total, discount: 0, taxable: total, tax: 0, cgst: null, sgst: null, igst: null, total, lines: [{ itemId: number, name: `${party} medicine`, quantity: 1, rate: 0, taxable: total, tax: 0, total, cost: null }] });
const response = { sales: [sale('S-1', 'Alice', 112), sale('S-2', 'Bob', 56)], purchases: [], payments: [], paymentGaps: ['S-1'], reversedDocuments: ['R-1'], items: [] };

it('keeps unknowns and totals in the exported matrix and protects CSV from formulas', () => {
  const matrix = reportExportMatrix(['Name', 'Amount', 'Tax'], [{ Name: '=cmd()', Amount: 10, Tax: null }], { Name: 'Total', Amount: 10, Tax: null });
  expect(matrix).toEqual([['Name', 'Amount', 'Tax'], ['Total', 10, 'Unknown'], ['=cmd()', 10, 'Unknown']]);
  expect(reportCsv('Partial', '2026-11-05', matrix)).toContain('"\'=cmd()","10","Unknown"');
  expect(reportCsv('Partial', '2026-11-05', matrix)).toContain('"Total","10","Unknown"');
});

it('filters the register and sends the same rows and totals to PDF', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue(response);
  render(<PharmacyReportPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Go' }));
  await screen.findByText(/Checked invoices with paid amounts/);
  fireEvent.click(screen.getByRole('button', { name: 'Sales Register' }));
  expect(screen.getByText('Alice')).toBeInTheDocument();
  expect(screen.getByText('Bob')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search rows'), { target: { value: 'Alice' } });
  expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  const table = screen.getByRole('table');
  expect(within(table).getAllByText('112.00').length).toBeGreaterThan(1);
  (reportCsv as jest.Mock).mockClear();
  URL.createObjectURL = jest.fn(() => 'blob:report'); URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
  fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  await waitFor(() => expect(downloadReportPdf).toHaveBeenCalledTimes(1));
  const [, , notice, matrix] = (downloadReportPdf as jest.Mock).mock.calls[0];
  expect(notice).toContain('PARTIAL AND UNVERIFIED');
  expect(notice).toContain('R-1');
  expect(matrix).toHaveLength(3);
  expect(matrix[2]).toContain('Alice');
  expect(matrix[2]).not.toContain('Bob');
  expect(matrix[1][0]).toBe('Total');
  expect(matrix[1][matrix[0].indexOf('Total')]).toBe(112);
  expect((reportCsv as jest.Mock).mock.calls[0][2]).toEqual(matrix);
  await waitFor(() => expect(xlsx.writeFile).toHaveBeenCalled());
  const excelRows = (xlsx.utils.aoa_to_sheet as jest.Mock).mock.calls[0][0];
  expect(excelRows.slice(2)).toEqual(matrix);
  click.mockRestore();
});

it('filters bill type and GST, and exports only visible columns', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({ ...response, sales: [sale('S-1', 'Alice', 112)], purchases: [{ ...sale('P-1', 'Supplier', 50), kind: 'Purchase', tax: 0, lines: [{ ...sale('P-1', 'Supplier', 50).lines[0], rate: 0 }] }] });
  render(<PharmacyReportPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Go' }));
  await screen.findByText(/Checked invoices with paid amounts/);
  fireEvent.click(screen.getByRole('button', { name: 'Purchase Bills' }));
  expect(screen.getByRole('cell', { name: 'Supplier' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('GST filter'), { target: { value: 'with' } });
  expect(screen.getByText('No matching records for this range.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('GST filter'), { target: { value: 'without' } });
  expect(screen.getByRole('cell', { name: 'Supplier' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), { target: { value: 'sales' } });
  expect(screen.getByText('Alice')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Show columns'));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Supplier' }));
  expect(screen.queryByRole('columnheader', { name: 'Supplier' })).not.toBeInTheDocument();
  (downloadReportPdf as jest.Mock).mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  await waitFor(() => expect(downloadReportPdf).toHaveBeenCalled());
  expect((downloadReportPdf as jest.Mock).mock.calls[0][3][0]).not.toContain('Supplier');
});

it('filters margin rows by tags and manufacturer and links to the inventory item', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({ ...response, items: [
    { id: 'S-1', category: 'Cream', manufacturer: 'Maker A', unit: 'PIECE', packSize: 1, packUnit: 'piece', currentStock: 3, mrp: 200, tags: '["skin"]' },
    { id: 'S-2', category: 'Cream', manufacturer: 'Maker B', unit: 'PIECE', packSize: 1, packUnit: 'piece', currentStock: 4, mrp: 80, tags: '["other"]' },
  ] });
  render(<PharmacyReportPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Go' }));
  await screen.findByText(/Checked invoices with paid amounts/);
  fireEvent.click(screen.getByRole('button', { name: 'Item Wise Margin' }));
  const link = screen.getByRole('link', { name: 'Alice medicine' });
  expect(link).toHaveAttribute('href', '/dashboard/inventory?area=stock&view=list&item=S-1');
  fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'skin' } });
  expect(screen.queryByRole('link', { name: 'Bob medicine' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('More filters (0)'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Manufacturer' }), { target: { value: 'Maker B' } });
  expect(screen.getByText('No matching records for this range.')).toBeInTheDocument();
  expect(screen.getByText('More filters (1)')).toBeInTheDocument();
});
