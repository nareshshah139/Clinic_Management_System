import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmationProvider, useConfirm } from './confirmation-provider';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';

function Caller({ result, twice = false }: { result: (value: boolean) => void; twice?: boolean }) {
  const confirm = useConfirm();
  return <button onClick={() => {
    void confirm({ title: 'Delete room?', description: 'Consultation room\nThis cannot be undone.', confirmLabel: 'Delete room', variant: 'destructive' }).then(result);
    if (twice) void confirm({ title: 'Second request', description: 'Must not replace the first.' }).then(result);
  }}>Remove room</button>;
}

it('waits for acceptance, focuses Cancel and restores focus after deleting once', async () => {
  const result = jest.fn();
  const user = userEvent.setup();
  render(<ConfirmationProvider><Caller result={result} /></ConfirmationProvider>);
  const opener = screen.getByRole('button', { name: 'Remove room' });
  await user.click(opener);
  expect(result).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog', { name: 'Delete room?' })).toHaveAccessibleDescription('Consultation room\nThis cannot be undone.');
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Delete room' }));
  expect(result.mock.calls).toEqual([[true]]);
  await waitFor(() => expect(opener).toHaveFocus());
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

it.each(['Cancel', 'Close', 'Escape'])('%s cancels without approving', async action => {
  const result = jest.fn();
  const user = userEvent.setup();
  render(<ConfirmationProvider><Caller result={result} /></ConfirmationProvider>);
  await user.click(screen.getByRole('button', { name: 'Remove room' }));
  if (action === 'Escape') await user.keyboard('{Escape}');
  else await user.click(screen.getByRole('button', { name: action }));
  expect(result.mock.calls).toEqual([[false]]);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

it('rejects overlapping requests without replacing or approving the first', async () => {
  const result = jest.fn();
  const user = userEvent.setup();
  render(<ConfirmationProvider><Caller result={result} twice /></ConfirmationProvider>);
  await user.click(screen.getByRole('button', { name: 'Remove room' }));
  expect(result.mock.calls).toEqual([[false]]);
  expect(screen.getByRole('alertdialog', { name: 'Delete room?' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(result.mock.calls).toEqual([[false], [false]]);
});

it('cancels when its caller unmounts and accepts a later request from a new caller', async () => {
  const result = jest.fn();
  const user = userEvent.setup();
  const view = render(<ConfirmationProvider><Caller result={result} /></ConfirmationProvider>);
  await user.click(screen.getByRole('button', { name: 'Remove room' }));
  view.rerender(<ConfirmationProvider><span>Another page</span></ConfirmationProvider>);
  await waitFor(() => expect(result.mock.calls).toEqual([[false]]));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  view.rerender(<ConfirmationProvider><Caller result={result} /></ConfirmationProvider>);
  await user.click(screen.getByRole('button', { name: 'Remove room' }));
  await user.click(screen.getByRole('button', { name: 'Delete room' }));
  expect(result.mock.calls).toEqual([[false], [true]]);
});

it('settles false when the provider unmounts', async () => {
  const result = jest.fn();
  const view = render(<ConfirmationProvider><Caller result={result} /></ConfirmationProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Remove room' }));
  view.unmount();
  await act(async () => {});
  expect(result.mock.calls).toEqual([[false]]);
});

it('fails closed without a provider', async () => {
  const result = jest.fn();
  render(<Caller result={result} />);
  await userEvent.click(screen.getByRole('button', { name: 'Remove room' }));
  expect(result.mock.calls).toEqual([[false]]);
});

it('works after StrictMode effect replay', async () => {
  const result = jest.fn();
  render(<React.StrictMode><ConfirmationProvider><Caller result={result} /></ConfirmationProvider></React.StrictMode>);
  await userEvent.click(screen.getByRole('button', { name: 'Remove room' }));
  await userEvent.click(screen.getByRole('button', { name: 'Delete room' }));
  expect(result.mock.calls).toEqual([[true]]);
});

it('returns focus to the caller inside an existing dialog', async () => {
  const result = jest.fn();
  render(<ConfirmationProvider><Dialog defaultOpen><DialogContent>
    <DialogTitle>Room details</DialogTitle><DialogDescription>Edit the room.</DialogDescription>
    <Caller result={result} />
  </DialogContent></Dialog></ConfirmationProvider>);
  const opener = screen.getByRole('button', { name: 'Remove room' });
  await userEvent.click(opener);
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await userEvent.keyboard('{Escape}');
  expect(result.mock.calls).toEqual([[false]]);
  await waitFor(() => expect(opener).toHaveFocus());
  expect(screen.getByRole('dialog', { name: 'Room details' })).toBeInTheDocument();
});
