import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import { apiClient } from '@/lib/api';
import { DoctorPatientPanels } from '@/components/dashboard/DoctorPatientPanels';

const visits = [{ id: 'v1', createdAt: '2026-11-05T05:00:00Z', patient: { id: 'p1', name: 'Asha Kumar' }, diagnosis: [{ diagnosis: 'Acne vulgaris' }] }];
const patientsPage = (n: number, total: number, page = 1) => ({
  data: Array.from({ length: n }, (_, i) => ({ id: `p${page}-${i}`, name: `Patient ${page}-${i}`, patientCode: `C${i}`, phone: '900', lastVisitAt: i === 0 ? '2026-11-04T05:00:00Z' : null })),
  meta: { total },
});

describe('DoctorPatientPanels', () => {
  let get: jest.SpiedFunction<typeof apiClient.get>;
  beforeEach(() => {
    get = jest.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string, params?: Record<string, unknown>) => {
      if (endpoint.startsWith('/visits/doctor/')) return { visits } as any;
      if (endpoint === '/patients') return patientsPage(10, 12, Number(params?.page ?? 1)) as any;
      throw new Error(`unexpected ${endpoint}`);
    });
  });
  afterEach(() => get.mockRestore());

  it('shows the doctor\'s recent visits and only their own patients', async () => {
    render(<DoctorPatientPanels doctorId="doc-1" />);
    const visitLink = await screen.findByRole('link', { name: /Asha Kumar/ });
    expect(visitLink).toHaveAttribute('href', '/dashboard/visits?patientId=p1&visitId=v1');
    expect(screen.getByText('Acne vulgaris')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/visits/doctor/doc-1', { limit: 8 });

    await screen.findByText('Patient 1-0');
    expect(get).toHaveBeenCalledWith('/patients', expect.objectContaining({ primaryDoctorId: 'doc-1', page: 1 }));
    expect(screen.getByText('My patients (12)')).toBeInTheDocument();
    expect(screen.getAllByText('No visits yet').length).toBeGreaterThan(0);
  });

  it('pages and searches within the doctor\'s patients', async () => {
    render(<DoctorPatientPanels doctorId="doc-1" />);
    await screen.findByText('Patient 1-0');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Patient 2-0');
    fireEvent.change(screen.getByLabelText('Search my patients'), { target: { value: 'as' } });
    await waitFor(() => expect(get).toHaveBeenCalledWith('/patients', expect.objectContaining({ primaryDoctorId: 'doc-1', search: 'as', page: 1 })));
  });

  it('says so when loading fails instead of showing an empty list', async () => {
    get.mockRejectedValue(new Error('offline'));
    render(<DoctorPatientPanels doctorId="doc-1" />);
    expect(await screen.findByText(/Could not load your recent visits/)).toBeInTheDocument();
    expect(await screen.findByText(/Could not load your patients/)).toBeInTheDocument();
  });
});
