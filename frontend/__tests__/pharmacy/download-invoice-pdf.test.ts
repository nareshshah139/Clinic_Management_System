import { downloadInvoicePdf } from '@/lib/download-invoice-pdf';

const mockSave = jest.fn();
const mockFrom = jest.fn();
const mockSet = jest.fn();
jest.mock('html2pdf.js', () => ({ __esModule: true, default: () => ({ set: mockSet }) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockSave.mockResolvedValue(undefined);
  mockFrom.mockReturnValue({ save: mockSave });
  mockSet.mockReturnValue({ from: mockFrom });
});

it('renders printable invoice content without copying the off-screen host', async () => {
  const source = new DOMParser().parseFromString('<style>body { color: black }</style><body><p>Invoice line</p><button class="no-print">Print</button><img onerror="alert(1)"></body>', 'text/html');
  await downloadInvoicePdf(source, 'INV/1');

  const wrapper = mockFrom.mock.calls[0][0] as HTMLElement;
  expect(wrapper.textContent).toContain('Invoice line');
  expect(wrapper.querySelector('.no-print')).toBeNull();
  expect(wrapper.querySelector('img')).not.toHaveAttribute('onerror');
  expect(wrapper.style.left).toBe('');
  expect(wrapper.parentElement?.style.left).toBe('-10000px');
  expect(wrapper.isConnected).toBe(false);
  expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ filename: 'pharmacy-invoice-INV_1.pdf' }));
});

it('removes temporary content if rendering fails', async () => {
  mockSave.mockRejectedValue(new Error('render failed'));
  const source = new DOMParser().parseFromString('<body><p>Invoice line</p></body>', 'text/html');
  await expect(downloadInvoicePdf(source, 'INV-1')).rejects.toThrow('render failed');
  expect((mockFrom.mock.calls[0][0] as HTMLElement).isConnected).toBe(false);
});
