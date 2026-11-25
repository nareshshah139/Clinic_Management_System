import { fireEvent, render, screen } from '@testing-library/react';
import { InventoryApprovals } from '@/components/inventory/InventoryApprovals';

jest.mock('@/components/inventory/InventoryUpdates', () => ({ InventoryUpdates: () => <p>Price and stock edit queue</p> }));
jest.mock('@/components/inventory/InventoryItemRequests', () => ({ InventoryItemRequests: () => <p>New item request queue</p> }));

const selected = () => screen.getAllByRole('tab').filter((tab) => tab.getAttribute('aria-selected') === 'true').map((tab) => tab.textContent);

it('keeps Price / stock open after the user picks it, however many new items arrive', () => {
  const view = render(<InventoryApprovals canReadEdits pending={{ items: 2, edits: 1 }} />);
  expect(selected()).toEqual(['New items2']);
  fireEvent.click(screen.getByRole('tab', { name: /Price \/ stock/ }));
  view.rerender(<InventoryApprovals canReadEdits pending={{ items: 3, edits: 1 }} />);
  expect(selected()).toEqual(['Price / stock1']);
  expect(screen.getByText('Price and stock edit queue')).toBeInTheDocument();
});

it('does not move a reader off Price / stock when new item requests appear later', () => {
  const view = render(<InventoryApprovals canReadEdits pending={{ items: 0, edits: 4 }} />);
  expect(selected()).toEqual(['Price / stock4']);
  view.rerender(<InventoryApprovals canReadEdits pending={{ items: 2, edits: 4 }} />);
  expect(selected()).toEqual(['Price / stock4']);
  expect(screen.getByText('Price and stock edit queue')).toBeInTheDocument();
});

it('opens on New items once the first count shows requests waiting', () => {
  const view = render(<InventoryApprovals canReadEdits pending={{ items: null, edits: null }} />);
  view.rerender(<InventoryApprovals canReadEdits pending={{ items: 2, edits: 0 }} />);
  expect(selected()).toEqual(['New items2']);
  expect(screen.getByText('New item request queue')).toBeInTheDocument();
});

it('badges each tab with its own pending count', () => {
  render(<InventoryApprovals canReadEdits pending={{ items: 2, edits: 5 }} />);
  expect(screen.getByRole('tab', { name: /Price \/ stock/ })).toContainElement(screen.getByLabelText('5 pending'));
  expect(screen.getByRole('tab', { name: /New items/ })).toContainElement(screen.getByLabelText('2 pending'));
});
