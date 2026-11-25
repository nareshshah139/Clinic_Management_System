import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';

jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn().mockResolvedValue([]), getPatient: jest.fn().mockResolvedValue({}),
  getClinicAssets: jest.fn().mockResolvedValue([]), getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getAllPatientVisitHistory: jest.fn().mockResolvedValue([]), getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }),
  getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

async function wait(ms: number) { await act(async () => { jest.advanceTimersByTime(ms); }); }
const row = (drugName: string, duration: number) => ({ drugName, dosage: '', dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration, durationUnit: 'DAYS' });
const medicineNames = () => (screen.getAllByPlaceholderText('Search medicine name...') as HTMLInputElement[]).map((el) => el.value);
const duration = (name: string) => screen.getByLabelText(`Duration for ${name}`) as HTMLInputElement;

async function mount(items: object[]) {
  localStorage.setItem('rxDraft:undo-test:standalone', JSON.stringify({ items }));
  render(<PrescriptionBuilder patientId="undo-test" visitId={null} doctorId="doctor" />);
  await wait(1000);
}

function WithReviewDate() {
  const [reviewDate, setReviewDate] = useState('');
  return <PrescriptionBuilder patientId="undo-test" visitId={null} doctorId="doctor" reviewDate={reviewDate} onChangeReviewDate={setReviewDate} />;
}
async function mountWithReviewDate() {
  jest.setSystemTime(new Date(2026, 2, 2, 9));
  localStorage.setItem('rxDraft:undo-test:standalone', JSON.stringify({ items: [row('', 7)] }));
  render(<WithReviewDate />);
  await wait(1000);
  return { instructions: screen.getByLabelText('Follow-up instructions') as HTMLInputElement, reviewDate: screen.getByLabelText('Review date') as HTMLInputElement };
}

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
});
afterEach(() => { jest.useRealTimers(); });

describe('prescription undo and redo', () => {
  it('undoes a burst of keystrokes in one step and redoes it', async () => {
    await mount([row('Cetirizine 10', 7)]);

    fireEvent.change(duration('Cetirizine 10'), { target: { value: '1' } });
    await wait(200);
    fireEvent.change(duration('Cetirizine 10'), { target: { value: '14' } });
    await wait(2000);
    fireEvent.change(duration('Cetirizine 10'), { target: { value: '21' } });

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(duration('Cetirizine 10').value).toBe('14');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(duration('Cetirizine 10').value).toBe('7');
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(duration('Cetirizine 10').value).toBe('14');
  });

  it('brings back a deleted row', async () => {
    await mount([row('Cetirizine 10', 7), row('Doxycycline 100', 14)]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Cetirizine 10' }));
    expect(medicineNames()).not.toContain('Cetirizine 10');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(medicineNames().slice(0, 2)).toEqual(['Cetirizine 10', 'Doxycycline 100']);
    expect(duration('Doxycycline 100').value).toBe('14');
  });

  it('typing a medicine name and undoing restores the previous name', async () => {
    await mount([row('Cetirizine 10', 7)]);
    const input = screen.getAllByPlaceholderText('Search medicine name...')[0];

    fireEvent.change(input, { target: { value: 'Cetirizine 1' } });
    fireEvent.change(input, { target: { value: 'Cetirizine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(medicineNames()[0]).toBe('Cetirizine 10');
  });

  it('undoing a follow-up shortcut also restores the review date it set, and redo sets it again', async () => {
    const { instructions, reviewDate } = await mountWithReviewDate();

    fireEvent.click(screen.getByRole('button', { name: 'Follow up in 14 days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Follow up in 30 days' }));
    expect([instructions.value, reviewDate.value]).toEqual(['Follow up in 30 days', '2026-04-01']);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect([instructions.value, reviewDate.value]).toEqual(['Follow up in 14 days', '2026-03-16']);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect([instructions.value, reviewDate.value]).toEqual(['', '']);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect([instructions.value, reviewDate.value]).toEqual(['Follow up in 14 days', '2026-03-16']);
  });

  it('a review date chip is one undo step with the instructions it fills in', async () => {
    const { instructions, reviewDate } = await mountWithReviewDate();

    fireEvent.click(screen.getByRole('button', { name: '2w' }));
    expect([instructions.value, reviewDate.value]).toEqual(['Follow up in 2 weeks', '2026-03-16']);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect([instructions.value, reviewDate.value]).toEqual(['', '']);
  });

  it('undoing a medicine edit keeps a review date the doctor typed afterwards', async () => {
    const { reviewDate } = await mountWithReviewDate();

    fireEvent.change(screen.getAllByPlaceholderText('Search medicine name...')[0], { target: { value: 'Cetirizine' } });
    fireEvent.change(reviewDate, { target: { value: '2026-05-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect([medicineNames()[0], reviewDate.value]).toEqual(['', '2026-05-05']);
  });
});
