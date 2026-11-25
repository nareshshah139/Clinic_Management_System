import PharmacyInvoicesPage from '@/app/dashboard/pharmacy/invoices/page';

const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({ redirect: (url: string) => mockRedirect(url) }));

const visit = async (search?: string | string[]) => {
  mockRedirect.mockClear();
  await PharmacyInvoicesPage({ searchParams: Promise.resolve(search === undefined ? {} : { search }) });
  return mockRedirect.mock.calls.map(([url]) => url);
};

describe('the retired Pharmacy Invoices address', () => {
  it('opens the Sales register when nothing was searched', async () => {
    expect(await visit()).toEqual(['/dashboard/pharmacy/sales']);
    expect(await visit('   ')).toEqual(['/dashboard/pharmacy/sales']);
  });

  it('carries a patient name into the register as a patient search', async () => {
    expect(await visit('Priya Sharma')).toEqual(['/dashboard/pharmacy/sales?field=patient&q=Priya+Sharma']);
  });

  it('keeps the invoice number the Ledger and Compliance links send as a bill number search', async () => {
    expect(await visit('PHI-2026-014')).toEqual(['/dashboard/pharmacy/sales?field=billNo&q=PHI-2026-014']);
  });

  it('keeps a mobile number as a mobile search', async () => {
    expect(await visit('98765 43210')).toEqual(['/dashboard/pharmacy/sales?field=mobile&q=98765+43210']);
  });

  it('escapes what was typed so it cannot add parameters of its own', async () => {
    expect(await visit('Ravi&pay=CREDIT')).toEqual(['/dashboard/pharmacy/sales?field=patient&q=Ravi%26pay%3DCREDIT']);
  });

  it('ignores a repeated search parameter instead of guessing which one was meant', async () => {
    expect(await visit(['Priya', 'Ravi'])).toEqual(['/dashboard/pharmacy/sales']);
  });
});
