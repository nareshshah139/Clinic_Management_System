import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { act, render, screen } from '@testing-library/react';
import { Toaster } from '@/components/ui/toaster';
import { toast, useToast } from '@/hooks/use-toast';

function DismissAll() {
  const { dismiss } = useToast();
  return <button onClick={() => dismiss()}>dismiss all</button>;
}

afterEach(() => {
  jest.useRealTimers();
  const { unmount } = render(<DismissAll />);
  act(() => screen.getByText('dismiss all').click());
  unmount();
});

it('leads an error toast with the sentence and shows the support reference on its own line', () => {
  render(<Toaster />);
  act(() => {
    toast({ variant: 'destructive', title: 'Failed to load schedule', description: "You don't have access to this. Ask an admin to grant it. (Reference: 69e9a011-77b5-4a85-a164-a11fe4c8d75b)" });
  });

  expect(screen.getByText("You don't have access to this. Ask an admin to grant it.")).toBeInTheDocument();
  expect(screen.getByText('Reference: 69e9a011-77b5-4a85-a164-a11fe4c8d75b')).toBeInTheDocument();
});

it('leaves a description without a reference as written', () => {
  render(<Toaster />);
  act(() => {
    toast({ title: 'Saved', description: 'Room 2 (Reference: not-a-uuid)' });
  });

  expect(screen.getByText('Room 2 (Reference: not-a-uuid)')).toBeInTheDocument();
});

it('shows the three newest notifications at once', () => {
  render(<Toaster />);
  act(() => {
    toast({ title: 'Stock saved' });
    toast({ variant: 'destructive', title: 'Printer offline' });
    toast({ title: 'Bill sent' });
    toast({ title: 'Patient checked in' });
  });

  expect(screen.queryByText('Stock saved')).not.toBeInTheDocument();
  expect(screen.getByText('Printer offline')).toBeInTheDocument();
  expect(screen.getByText('Bill sent')).toBeInTheDocument();
  expect(screen.getByText('Patient checked in')).toBeInTheDocument();
});

it('keeps an open notification when newer ones were already dismissed', () => {
  render(<Toaster />);
  act(() => {
    toast({ variant: 'destructive', title: 'Payment failed' });
  });
  act(() => {
    toast({ title: 'Draft saved' }).dismiss();
    toast({ title: 'Room booked' }).dismiss();
    toast({ title: 'Patient checked in' });
  });

  expect(screen.getByText('Payment failed')).toBeInTheDocument();
  expect(screen.getByText('Patient checked in')).toBeInTheDocument();
});

it('names the close button so it can be found and dismisses the notification', () => {
  render(<Toaster />);
  act(() => {
    toast({ variant: 'destructive', title: 'Payment failed' });
  });

  act(() => screen.getByRole('button', { name: 'Dismiss notification' }).click());

  expect(screen.queryByText('Payment failed')).not.toBeInTheDocument();
});

describe('how long a notification stays', () => {
  beforeEach(() => jest.useFakeTimers());

  it('hides a confirmation after five seconds', () => {
    render(<Toaster />);
    act(() => {
      toast({ title: 'Saved' });
    });

    act(() => jest.advanceTimersByTime(5_100));

    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('keeps an error on screen long enough to read before hiding it', () => {
    render(<Toaster />);
    act(() => {
      toast({ variant: 'destructive', title: 'Could not save the visit' });
    });

    act(() => jest.advanceTimersByTime(9_000));
    expect(screen.getByText('Could not save the visit')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(1_100));
    expect(screen.queryByText('Could not save the visit')).not.toBeInTheDocument();
  });

  it('keeps an error that carries a support reference on screen for thirty seconds', () => {
    render(<Toaster />);
    act(() => {
      toast({ variant: 'destructive', title: 'Could not save the visit', description: 'The server failed. (Reference: 69e9a011-77b5-4a85-a164-a11fe4c8d75b)' });
    });

    act(() => jest.advanceTimersByTime(29_000));
    expect(screen.getByText('Reference: 69e9a011-77b5-4a85-a164-a11fe4c8d75b')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(1_100));
    expect(screen.queryByText('Reference: 69e9a011-77b5-4a85-a164-a11fe4c8d75b')).not.toBeInTheDocument();
  });

  it('clears notifications that were open when a dialog opens, so their close button never lands on the dialog', () => {
    render(<Toaster />);
    act(() => {
      toast({ variant: 'destructive', title: 'Export failed', description: 'The server failed. (Reference: 69e9a011-77b5-4a85-a164-a11fe4c8d75b)' });
    });
    expect(screen.getByText('Export failed')).toBeInTheDocument();

    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>New patient</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    act(() => jest.advanceTimersByTime(1_000));

    expect(screen.queryByText('Export failed')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'New patient' })).toBeInTheDocument();
  });
});
