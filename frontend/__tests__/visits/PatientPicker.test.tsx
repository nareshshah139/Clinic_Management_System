import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import PatientPicker from '@/components/visits/PatientPicker';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { getPatients: jest.fn() } }));
const getPatients = jest.mocked(apiClient.getPatients);
const P1 = { id: 'p1', name: 'Asha Verma', gender: 'F', age: 30, phone: '900' };
const P2 = { id: 'p2', name: 'No Contact', gender: '', email: 'nc@example.test' };
const P3 = { id: 'p3', name: 'Bare Patient' };

function Harness({ onSelect = jest.fn(), onClear = jest.fn(), label }: { onSelect?: jest.Mock; onClear?: jest.Mock; label?: string }) {
  const [id, setId] = useState('');
  return (
    <>
      <PatientPicker
        selectedPatientId={id}
        selectedLabel={label}
        onSelect={(p) => { onSelect(p); setId(p.id); }}
        onClear={() => { onClear(); setId(''); }}
      />
      <button>other</button>
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  getPatients.mockResolvedValue({ patients: [P1, P2, P3] } as never);
});

it('builds line two from age, sex and phone, falling back to email', async () => {
  render(<Harness />);
  fireEvent.focus(screen.getByRole('combobox', { name: 'Select Patient' }));
  const rows = await screen.findAllByRole('option');
  expect(rows[0].textContent).toBe('Asha Verma30 · Female · 900');
  expect(rows[1].textContent).toBe('No Contactnc@example.test');
  expect(rows[2].textContent).toBe('Bare Patient');
});

it('searches with the typed text and a limit of 10', async () => {
  render(<Harness />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'asha' } });
  await waitFor(() => expect(getPatients).toHaveBeenCalledWith({ search: 'asha', limit: 10 }));
});

it('sets aria-activedescendant for the highlighted row and closes on Escape', async () => {
  render(<Harness />);
  const box = screen.getByRole('combobox');
  fireEvent.focus(box);
  await screen.findAllByRole('option');
  expect(box).not.toHaveAttribute('aria-activedescendant');
  fireEvent.keyDown(box, { key: 'ArrowDown' });
  const rows = screen.getAllByRole('option');
  expect(rows[0]).toHaveAttribute('aria-selected', 'true');
  expect(box.getAttribute('aria-activedescendant')).toBe(rows[0].id);
  fireEvent.keyDown(box, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(box).toHaveAttribute('aria-expanded', 'false');
  fireEvent.keyDown(box, { key: 'ArrowDown' });
  expect(await screen.findByRole('listbox')).toBeInTheDocument();
});

it('closes on an outside mousedown', async () => {
  render(<Harness />);
  fireEvent.focus(screen.getByRole('combobox'));
  await screen.findByRole('listbox');
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('shows the label of an outside selection', async () => {
  render(
    <PatientPicker selectedPatientId="p9" selectedLabel="Linked Patient" onSelect={jest.fn()} onClear={jest.fn()} />,
  );
  expect(screen.getByRole('combobox')).toHaveValue('Linked Patient');
});

it('does not choose anything on Enter with several results and no highlight', async () => {
  const onSelect = jest.fn();
  render(<Harness onSelect={onSelect} />);
  const box = screen.getByRole('combobox');
  fireEvent.change(box, { target: { value: 'a' } });
  await screen.findAllByRole('option');
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(onSelect).not.toHaveBeenCalled();
});
