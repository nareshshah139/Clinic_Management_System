import { act, render, screen } from '@testing-library/react';
import { Toaster } from '@/components/ui/toaster';
import { toast } from '@/hooks/use-toast';

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
