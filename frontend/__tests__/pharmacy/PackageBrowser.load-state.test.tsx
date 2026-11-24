import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PackageBrowser } from '@/components/pharmacy/PackageBrowser';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const get = apiClient.get as jest.Mock;

describe('PackageBrowser load states', () => {
  beforeEach(() => get.mockReset());

  it('tells an empty catalogue how to fill it, without a retry', async () => {
    get.mockResolvedValue({ packages: [] });
    render(<PackageBrowser />);
    expect(await screen.findByText('No packages yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('reports a failed load and retries it, rather than showing an empty catalogue', async () => {
    get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ packages: [] });
    render(<PackageBrowser />);
    expect(await screen.findByText("Couldn't load packages")).toBeInTheDocument();
    expect(screen.queryByText('No packages yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No packages yet')).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('loads packages from every category and shows a General package', async () => {
    get.mockResolvedValue({
      packages: [{
        id: 'p1', name: 'Wellness bundle', category: 'General', originalPrice: 100, packagePrice: 90,
        discountPercent: 10, isActive: true, isPublic: true, createdAt: '2026-01-01T00:00:00Z', items: [],
      }],
    });
    render(<PackageBrowser />);
    expect(await screen.findByText('Wellness bundle')).toBeInTheDocument();
    expect(get.mock.calls[0][1]).not.toHaveProperty('category');
  });
});
