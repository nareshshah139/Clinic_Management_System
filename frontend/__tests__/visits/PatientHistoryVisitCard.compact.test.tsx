import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatientHistoryVisitCard from '@/components/visits/PatientHistoryVisitCard';

it('opens a compact clinical summary and reveals a sanitized regimen in one click', async () => {
  render(<PatientHistoryVisitCard defaultCollapsed={false} visit={{
    complaints: [{ complaint: 'Itchy skin' }],
    diagnosis: [{ diagnosis: 'Eczema' }],
    history: { personalHistory: 'Night shifts', pastHistory: 'Asthma' },
    plan: { dermatology: { medicationPlan: [{ drugName: 'Fucibet', frequency: 'TWICE_DAILY' }] } },
    prescription: { items: [{ drugName: 'Fucibet', frequency: 'TWICE_DAILY', regimenState: { touched: ['timing'] }, gstRate: 12, language: 'EN' }] } as any,
  }} />);
  expect(screen.getByText('Night shifts')).toBeInTheDocument();
  expect(screen.getByText('Asthma')).toBeInTheDocument();
  expect(screen.getAllByText('Fucibet')).toHaveLength(1);
  expect(screen.queryByText('TWICE_DAILY')).not.toBeInTheDocument();
  expect(screen.queryByText('Eczema')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Full details' }));
  expect(screen.getByText('TWICE_DAILY')).toBeInTheDocument();
  expect(screen.getAllByText('Fucibet')).toHaveLength(1);
  for (const text of ['Regimen State', 'Touched', 'Gst Rate', 'Language']) expect(screen.queryByText(text)).not.toBeInTheDocument();
});
