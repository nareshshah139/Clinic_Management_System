import { downloadReportPdf } from '@/app/dashboard/pharmacy-report/report-export';

const addImage = jest.fn(), addPage = jest.fn(), save = jest.fn(), fillText = jest.fn();
jest.mock('jspdf', () => ({ jsPDF: jest.fn().mockImplementation(() => ({ addImage, addPage, save })) }));

it('renders the notice, filtered values, totals and all column bands into a downloaded PDF', async () => {
  const context = { fillStyle: '', font: '', fillRect: jest.fn(), fillText, measureText: (text: string) => ({ width: text.length * 8 }) };
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,YQ==');
  const matrix = [['A', 'B', 'C', 'D', 'E', 'F'], ['Alice', 1, 2, 3, 4, 5], ['Total', 1, 2, 3, 4, 5]];
  await downloadReportPdf('Sales', '2026-11-05', 'PARTIAL AND UNVERIFIED', matrix, 'report.pdf');
  expect(addImage).toHaveBeenCalledTimes(3);
  expect(addPage).toHaveBeenCalledTimes(2);
  expect(fillText).toHaveBeenCalledWith('PARTIAL AND UNVERIFIED', expect.any(Number), expect.any(Number));
  expect(fillText).toHaveBeenCalledWith('Alice', expect.any(Number), expect.any(Number));
  expect(fillText).toHaveBeenCalledWith('Total', expect.any(Number), expect.any(Number));
  expect(fillText).toHaveBeenCalledWith('F', expect.any(Number), expect.any(Number));
  expect(save).toHaveBeenCalledWith('report.pdf');
});


it('paginates an unbounded list of exception identifiers without dropping any', async () => {
  jest.clearAllMocks();
  const ids = Array.from({ length: 1200 }, (_, index) => `REF-${String(index).padStart(4, '0')}`);
  const context = { fillStyle: '', font: '', fillRect: jest.fn(), fillText, measureText: (text: string) => ({ width: text.length * 8 }) };
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,YQ==');
  await downloadReportPdf('Sales', '2026-11-05', ids.join(' '), [['Bill'], ['A'], ['Total']], 'report.pdf');
  expect(addImage.mock.calls.length).toBeGreaterThan(2);
  for (const id of ids) expect(fillText.mock.calls.some(([text]) => String(text).includes(id))).toBe(true);
  expect(save).toHaveBeenCalledWith('report.pdf');
});
