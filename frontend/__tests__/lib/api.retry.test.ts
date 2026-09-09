import { ApiClient } from '@/lib/api';

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('ApiClient idempotent save retries', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retries a transient PATCH only when an idempotency key is present', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'temporary failure' }, 503))
      .mockResolvedValueOnce(jsonResponse({ id: 'v1' }));

    const resultPromise = new ApiClient().patch('/visits/v1', { notes: 'draft' }, { idempotencyKey: 'save-1' });
    await expect(resultPromise).resolves.toEqual({ id: 'v1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers['Idempotency-Key']).toBe('save-1');
  });

  it('does not retry a non-idempotent PATCH', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(jsonResponse({ message: 'temporary failure' }, 503));

    await expect(new ApiClient().patch('/visits/v1', { notes: 'draft' })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the purchase create key across a failed save and manual retry', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Unable to save' }, 400));
    const client = new ApiClient();
    const payload = { invoiceNumber: 'OCR-1' };
    await expect(client.createPharmacyPurchaseInvoiceDraft(payload)).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'purchase-1' }));
    await client.createPharmacyPurchaseInvoiceDraft(payload);
    const first = fetchMock.mock.calls[0][1].headers['Idempotency-Key'];
    expect(first).toMatch(/^purchase-/);
    expect(fetchMock.mock.calls[1][1].headers['Idempotency-Key']).toBe(first);
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'purchase-2' }));
    await client.createPharmacyPurchaseInvoiceDraft({ invoiceNumber: 'OCR-2' });
    expect(fetchMock.mock.calls[2][1].headers['Idempotency-Key']).not.toBe(first);
  });

  it('generates an idempotency key for prescription updates', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(jsonResponse({ id: 'rx-1' }));

    await new ApiClient().updatePrescription('rx-1', { notes: 'updated' });

    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toMatch(/^cms:PATCH:prescriptions:update:rx-1:/);
  });

  it('generates an idempotency key for prescription template saves', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(jsonResponse({ id: 'tpl-1' }));

    await new ApiClient().createPrescriptionTemplate({ name: 'Dermatology' });

    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toMatch(/^cms:POST:prescriptions:template:/);
  });

  it('creates a prescription and then verifies a non-empty server PDF', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'rx-1', status: 'ACTIVE' }, 201))
      .mockResolvedValueOnce(jsonResponse({
        fileUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
        fileName: 'prescription-rx-1.pdf',
        fileSize: 8,
      }));

    const result = await new ApiClient().createPrescriptionAndPdf({
      patientId: 'patient-1',
      visitId: 'visit-1',
      doctorId: 'doctor-1',
      items: [{ drugName: 'Paracetamol', dosage: 500 }],
    });

    expect(result.prescription.id).toBe('rx-1');
    expect(result.pdf.fileName).toBe('prescription-rx-1.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/prescriptions');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/prescriptions/rx-1/pdf');
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toMatch(/^cms:POST:prescriptions:create:/);
    expect(fetchMock.mock.calls[1][1].headers['Idempotency-Key']).toMatch(/^cms:POST:prescriptions:pdf:rx-1:/);
  });

  it('does not request a PDF when prescription creation returns no ID', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ACTIVE' }, 201));

    await expect(new ApiClient().createPrescriptionAndPdf({ items: [{ drugName: 'Paracetamol' }] }))
      .rejects.toThrow('prescription ID');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { fileUrl: 'data:application/pdf;base64,bm90IGEgcGRm', fileSize: 9, fileName: 'rx.pdf' },
    { fileUrl: 'data:application/pdf;base64,JVBERi0xLjQ=', fileSize: 999, fileName: 'rx.pdf' },
  ])('rejects invalid PDF bytes or a mismatched byte count', async pdf => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ id: 'rx-1' }, 201))
      .mockResolvedValueOnce(jsonResponse(pdf));
    await expect(new ApiClient().createPrescriptionAndPdf({})).rejects.toThrow('invalid or empty');
  });
});
