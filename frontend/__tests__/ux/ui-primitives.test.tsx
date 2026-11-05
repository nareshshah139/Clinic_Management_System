import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PageHeader } from '@/components/ui/page-header';
import { Spinner } from '@/components/ui/spinner';
import { LoadingSkeleton } from '@/components/ui/skeleton';

describe('shared clinical interface primitives', () => {
  it('preserves the page heading, description and working action', () => {
    const onCreate = jest.fn();
    render(<PageHeader title="Appointments" description="Manage the clinic schedule." actions={<button onClick={onCreate}>Book appointment</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Appointments' })).toBeVisible();
    expect(screen.getByText('Manage the clinic schedule.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Book appointment' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('announces a loading action without depending on animation', () => {
    render(<Spinner label="Saving prescription…" />);
    expect(screen.getByRole('status', { name: 'Saving prescription…' })).toHaveClass('motion-reduce:animate-none');
  });

  it('announces one loading state while hiding placeholder values', () => {
    const { container } = render(<LoadingSkeleton label="Loading invoices…" />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status', { name: 'Loading invoices…' })).toBeVisible();
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(18);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
