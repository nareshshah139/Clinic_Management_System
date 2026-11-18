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
});
