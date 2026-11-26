import { StrictMode, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { act, render, screen } from '@testing-library/react';
import { Toaster } from '@/components/ui/toaster';
import { keepToastsAbove, ToastAction } from '@/components/ui/toast';
import { ActionDialog } from '@/components/inventory/purchase/ActionDialog';
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

  it('sets notifications aside while a dialog is open, so their close button never lands on the dialog, and brings them back after', () => {
    render(<Toaster />);
    act(() => {
      toast({ title: 'Patient archived', description: 'Undo is available for a moment.' });
    });
    expect(screen.getByText('Patient archived')).toBeVisible();

    const { rerender } = render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>New patient</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    act(() => jest.advanceTimersByTime(1_000));
    expect(screen.queryByText('Patient archived')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'New patient' })).toBeInTheDocument();

    act(() => {
      toast({ variant: 'destructive', title: 'Could not add the patient' });
    });
    expect(screen.getByText('Could not add the patient')).toBeVisible();

    act(() => jest.advanceTimersByTime(1_000));

    rerender(
      <Dialog open={false}>
        <DialogContent>
          <DialogTitle>New patient</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    act(() => jest.advanceTimersByTime(1));
    expect(screen.getByText('Patient archived')).toBeVisible();
    act(() => jest.advanceTimersByTime(2_900));
    expect(screen.getByText('Patient archived')).toBeVisible();
    act(() => jest.advanceTimersByTime(200));
    expect(screen.queryByText('Patient archived')).not.toBeInTheDocument();
  });

  it('does not bring back a notification whose time ran out while a dialog was open, so an Undo never outlives its window', () => {
    render(<Toaster />);
    act(() => {
      toast({ title: 'Set off ₹200 of credit', duration: 30_000 });
    });
    const { rerender } = render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Settings</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    act(() => jest.advanceTimersByTime(31_000));
    rerender(
      <Dialog open={false}>
        <DialogContent>
          <DialogTitle>Settings</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    act(() => jest.advanceTimersByTime(100));

    expect(screen.queryByText('Set off ₹200 of credit')).not.toBeInTheDocument();
  });

  it('keeps notifications while a page holds a dialog that is closed', () => {
    render(<Toaster />);
    act(() => {
      toast({ title: 'Patient archived' });
    });

    render(
      <Dialog open={false}>
        <DialogContent>
          <DialogTitle>Quick create</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    act(() => jest.advanceTimersByTime(1_000));

    expect(screen.getByText('Patient archived')).toBeInTheDocument();
  });

  it('sets notifications aside for a dialog whose field takes focus as it opens', () => {
    render(<Toaster />);
    act(() => {
      toast({ title: 'Stock saved' });
    });

    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Edit stock</DialogTitle>
          <input aria-label="Quantity" autoFocus defaultValue="4" />
        </DialogContent>
      </Dialog>,
    );
    act(() => jest.advanceTimersByTime(1_000));

    expect(screen.queryByText('Stock saved')).not.toBeInTheDocument();
  });

  it('parks a notification once, not twice, when React opens a dialog twice in development', () => {
    render(<Toaster />);
    act(() => {
      toast({ title: 'Patient archived' });
    });
    const { rerender } = render(
      <StrictMode>
        <Dialog open>
          <DialogContent>
            <DialogTitle>New patient</DialogTitle>
          </DialogContent>
        </Dialog>
      </StrictMode>,
    );
    act(() => jest.advanceTimersByTime(500));
    expect(screen.queryByText('Patient archived')).not.toBeInTheDocument();

    rerender(
      <StrictMode>
        <Dialog open={false}>
          <DialogContent>
            <DialogTitle>New patient</DialogTitle>
          </DialogContent>
        </Dialog>
      </StrictMode>,
    );
    act(() => jest.advanceTimersByTime(500));
    expect(screen.getAllByText('Patient archived')).toHaveLength(1);
  });
});

describe('notifications next to row-action dialogs', () => {
  beforeEach(() => jest.useFakeTimers());

  function MarkPaid({ anchor }: { anchor: HTMLElement }) {
    const amount = useRef<HTMLInputElement>(null);
    return (
      <ActionDialog
        anchor={anchor}
        title="Mark bill paid"
        description="Record the payment for this bill."
        saving={false}
        initialFocus={amount}
        onClose={() => {}}
        onSubmit={async () => 'done'}
        footer={() => <button type="submit">Save payment</button>}
      >
        <input ref={amount} aria-label="Amount" defaultValue="1200" />
      </ActionDialog>
    );
  }

  it('sets a showing notification aside while a row-action dialog is open and brings it back when it closes', () => {
    render(<Toaster />);
    act(() => {
      toast({ title: 'Bill posted', description: 'Undo is available for a moment.' });
    });
    const anchor = document.body.appendChild(document.createElement('button'));

    const { unmount } = render(<MarkPaid anchor={anchor} />);
    act(() => jest.advanceTimersByTime(500));
    expect(screen.getByRole('dialog', { name: 'Mark bill paid' })).toBeInTheDocument();
    expect(screen.queryByText('Bill posted')).not.toBeInTheDocument();

    unmount();
    act(() => jest.advanceTimersByTime(1));
    expect(screen.getByText('Bill posted')).toBeVisible();
    anchor.remove();
  });

  it('keeps the notification a dialog raised as it closed when the set-aside ones come back', () => {
    render(<Toaster />);
    act(() => {
      toast({ title: 'Stock saved' });
      toast({ title: 'Bill sent' });
      toast({ title: 'Patient checked in' });
    });
    const anchor = document.body.appendChild(document.createElement('button'));
    const { unmount } = render(<MarkPaid anchor={anchor} />);
    act(() => jest.advanceTimersByTime(500));

    unmount();
    act(() => {
      toast({ title: 'Payment recorded' });
      jest.advanceTimersByTime(1);
    });

    expect(screen.getByText('Payment recorded')).toBeVisible();
    expect(screen.getByText('Patient checked in')).toBeVisible();
    expect(screen.getByText('Bill sent')).toBeVisible();
    expect(screen.queryByText('Stock saved')).not.toBeInTheDocument();
    anchor.remove();
  });
});

describe('notifications above a sticky action bar', () => {
  const clearance = () => document.documentElement.style.getPropertyValue('--toast-clearance');

  function placeBar(top: number, height: number) {
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.dataset.bar
        ? ({ top, bottom: top + height, height, left: 0, right: 800, width: 800, x: 0, y: top } as DOMRect)
        : new DOMRect();
    });
  }
  const scroll = () =>
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

  afterEach(() => jest.restoreAllMocks());

  it('lifts the notifications by the room a bar held at the bottom edge takes, and follows the bar as the page scrolls', () => {
    render(<Toaster />);
    placeBar(window.innerHeight - 120, 120);

    const { unmount } = render(<div data-bar="1" ref={keepToastsAbove}>Print Preview</div>);
    expect(clearance()).toBe('120px');

    placeBar(window.innerHeight - 300, 120);
    scroll();
    expect(clearance()).toBe('0px');

    placeBar(window.innerHeight - 64, 64);
    scroll();
    expect(clearance()).toBe('64px');

    unmount();
    expect(clearance()).toBe('0px');
  });

  it('leaves notifications at the bottom when the bar floats above the bottom edge on a short page', () => {
    render(<Toaster />);
    placeBar(window.innerHeight - 180, 70);

    const { unmount } = render(<div data-bar="1" ref={keepToastsAbove}>Print Preview</div>);
    expect(clearance()).toBe('0px');
    unmount();
  });

  it('offsets the notification stack by the published clearance on wide screens only, where it sits at the bottom', () => {
    render(<Toaster />);
    const stack = screen.getByRole('region').querySelector('ol')!;
    expect(stack.className).toContain('md:bottom-[var(--toast-clearance,0px)]');
    expect(stack.className).not.toMatch(/(^|\s)bottom-\[var/);
  });
});

it('keeps the Undo on a notification whose title is one long unbroken bill number', () => {
  const undo = jest.fn();
  render(<Toaster />);
  act(() => {
    toast({
      title: 'Bill SUPPLIER-INV-2026-000000000000000000000000000000000000000000000000000123 posted',
      action: (
        <ToastAction altText="Undo posting" onClick={undo}>
          Undo
        </ToastAction>
      ),
    });
  });

  const text = screen.getByText(/SUPPLIER-INV-2026/).parentElement!;
  expect(text).toHaveClass('min-w-0');
  expect(text.className).toContain('[overflow-wrap:anywhere]');
  act(() => screen.getByRole('button', { name: 'Undo' }).click());
  expect(undo).toHaveBeenCalledTimes(1);
});
