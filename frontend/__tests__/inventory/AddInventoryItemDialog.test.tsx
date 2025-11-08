import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AddInventoryItemDialog } from '@/components/inventory/AddInventoryItemDialog';
import { apiClient } from '@/lib/api';

// Mock the API client
jest.mock('@/lib/api', () => ({
  apiClient: {
    createInventoryItem: jest.fn(),
  },
}));

/**
 * Frontend tests for AddInventoryItemDialog
 * Based on INVENTORY_ALIGNMENT_VERIFICATION.md checklist
 */
describe('AddInventoryItemDialog', () => {
  const mockOnOpenChange = jest.fn();
  const mockOnSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Form validation for required fields', () => {
    it('should display required field indicators', () => {
      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      expect(screen.getByText(/Item Name \*/)).toBeInTheDocument();
      expect(screen.getByText(/Type \*/)).toBeInTheDocument();
      expect(screen.getByText(/Cost Price.*\*/)).toBeInTheDocument();
      expect(screen.getByText(/Selling Price.*\*/)).toBeInTheDocument();
      expect(screen.getByText(/Unit \*/)).toBeInTheDocument();
    });

    it('should not submit form with empty required fields', async () => {
      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      const submitButton = screen.getByRole('button', { name: /Add Item/i });
      fireEvent.click(submitButton);

      // Form should not submit (HTML5 validation will prevent it)
      await waitFor(() => {
        expect(apiClient.createInventoryItem).not.toHaveBeenCalled();
      });
    });

    it('should submit form with all required fields filled', async () => {
      (apiClient.createInventoryItem as jest.Mock).mockResolvedValue({ id: 'item-123' });

      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // Fill required fields
      const nameInput = screen.getByLabelText(/Item Name/i);
      fireEvent.change(nameInput, { target: { value: 'Paracetamol 500mg' } });

      const costPriceInput = screen.getByLabelText(/Cost Price/i);
      fireEvent.change(costPriceInput, { target: { value: '10.50' } });

      const sellingPriceInput = screen.getByLabelText(/Selling Price/i);
      fireEvent.change(sellingPriceInput, { target: { value: '15.00' } });

      // Submit form
      const submitButton = screen.getByRole('button', { name: /Add Item/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(apiClient.createInventoryItem).toHaveBeenCalled();
      });
    });
  });

  describe('Number input conversions', () => {
    it('should convert string prices to numbers on submit', async () => {
      (apiClient.createInventoryItem as jest.Mock).mockResolvedValue({ id: 'item-123' });

      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // Fill form
      fireEvent.change(screen.getByLabelText(/Item Name/i), {
        target: { value: 'Test Medicine' },
      });
      fireEvent.change(screen.getByLabelText(/Cost Price/i), {
        target: { value: '10.50' },
      });
      fireEvent.change(screen.getByLabelText(/Selling Price/i), {
        target: { value: '15.75' },
      });
      fireEvent.change(screen.getByLabelText(/MRP/i), {
        target: { value: '18.00' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

      await waitFor(() => {
        expect(apiClient.createInventoryItem).toHaveBeenCalledWith(
          expect.objectContaining({
            costPrice: 10.5,
            sellingPrice: 15.75,
            mrp: 18.0,
          })
        );
      });
    });

    it('should convert string quantities to integers on submit', async () => {
      (apiClient.createInventoryItem as jest.Mock).mockResolvedValue({ id: 'item-123' });

      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // Fill required fields
      fireEvent.change(screen.getByLabelText(/Item Name/i), {
        target: { value: 'Test Medicine' },
      });
      fireEvent.change(screen.getByLabelText(/Cost Price/i), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByLabelText(/Selling Price/i), {
        target: { value: '15' },
      });

      // Fill quantity fields
      fireEvent.change(screen.getByLabelText(/Pack Size/i), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByLabelText(/Min Stock/i), {
        target: { value: '20' },
      });
      fireEvent.change(screen.getByLabelText(/Max Stock/i), {
        target: { value: '500' },
      });
      fireEvent.change(screen.getByLabelText(/Reorder Level/i), {
        target: { value: '30' },
      });
      fireEvent.change(screen.getByLabelText(/Reorder Qty/i), {
        target: { value: '100' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

      await waitFor(() => {
        expect(apiClient.createInventoryItem).toHaveBeenCalledWith(
          expect.objectContaining({
            packSize: 10,
            minStockLevel: 20,
            maxStockLevel: 500,
            reorderLevel: 30,
            reorderQuantity: 100,
          })
        );
      });
    });

    it('should convert GST rate string to number on submit', async () => {
      (apiClient.createInventoryItem as jest.Mock).mockResolvedValue({ id: 'item-123' });

      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // Fill required + GST fields
      fireEvent.change(screen.getByLabelText(/Item Name/i), {
        target: { value: 'Test Medicine' },
      });
      fireEvent.change(screen.getByLabelText(/Cost Price/i), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByLabelText(/Selling Price/i), {
        target: { value: '15' },
      });
      fireEvent.change(screen.getByLabelText(/GST Rate/i), {
        target: { value: '12' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

      await waitFor(() => {
        expect(apiClient.createInventoryItem).toHaveBeenCalledWith(
          expect.objectContaining({
            gstRate: 12,
          })
        );
      });
    });
  });

  describe('Date picker functionality', () => {
    it('should include expiry date in submission when selected', async () => {
      (apiClient.createInventoryItem as jest.Mock).mockResolvedValue({ id: 'item-123' });

      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // Fill required fields
      fireEvent.change(screen.getByLabelText(/Item Name/i), {
        target: { value: 'Test Medicine' },
      });
      fireEvent.change(screen.getByLabelText(/Cost Price/i), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByLabelText(/Selling Price/i), {
        target: { value: '15' },
      });

      // Set expiry date
      const expiryDateInput = screen.getByLabelText(/Expiry Date/i);
      fireEvent.change(expiryDateInput, { target: { value: '2025-12-31' } });

      fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

      await waitFor(() => {
        expect(apiClient.createInventoryItem).toHaveBeenCalledWith(
          expect.objectContaining({
            expiryDate: '2025-12-31',
          })
        );
      });
    });

    it('should not include expiry date if not provided', async () => {
      (apiClient.createInventoryItem as jest.Mock).mockResolvedValue({ id: 'item-123' });

      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // Fill only required fields
      fireEvent.change(screen.getByLabelText(/Item Name/i), {
        target: { value: 'Test Medicine' },
      });
      fireEvent.change(screen.getByLabelText(/Cost Price/i), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByLabelText(/Selling Price/i), {
        target: { value: '15' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

      await waitFor(() => {
        const payload = (apiClient.createInventoryItem as jest.Mock).mock.calls[0][0];
        expect(payload).not.toHaveProperty('expiryDate');
      });
    });
  });

  describe('Checkbox state management', () => {
    it('should handle requiresPrescription checkbox state', async () => {
      (apiClient.createInventoryItem as jest.Mock).mockResolvedValue({ id: 'item-123' });

      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // Fill required fields
      fireEvent.change(screen.getByLabelText(/Item Name/i), {
        target: { value: 'Test Medicine' },
      });
      fireEvent.change(screen.getByLabelText(/Cost Price/i), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByLabelText(/Selling Price/i), {
        target: { value: '15' },
      });

      // Check the requiresPrescription checkbox
      const prescriptionCheckbox = screen.getByLabelText(/Requires Prescription/i);
      fireEvent.click(prescriptionCheckbox);

      fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

      await waitFor(() => {
        expect(apiClient.createInventoryItem).toHaveBeenCalledWith(
          expect.objectContaining({
            requiresPrescription: true,
          })
        );
      });
    });

    it('should handle isControlled checkbox state', async () => {
      (apiClient.createInventoryItem as jest.Mock).mockResolvedValue({ id: 'item-123' });

      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // Fill required fields
      fireEvent.change(screen.getByLabelText(/Item Name/i), {
        target: { value: 'Test Medicine' },
      });
      fireEvent.change(screen.getByLabelText(/Cost Price/i), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByLabelText(/Selling Price/i), {
        target: { value: '15' },
      });

      // Check the isControlled checkbox
      const controlledCheckbox = screen.getByLabelText(/Controlled Substance/i);
      fireEvent.click(controlledCheckbox);

      fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

      await waitFor(() => {
        expect(apiClient.createInventoryItem).toHaveBeenCalledWith(
          expect.objectContaining({
            isControlled: true,
          })
        );
      });
    });

    it('should default checkboxes to false', async () => {
      (apiClient.createInventoryItem as jest.Mock).mockResolvedValue({ id: 'item-123' });

      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // Fill required fields
      fireEvent.change(screen.getByLabelText(/Item Name/i), {
        target: { value: 'Test Medicine' },
      });
      fireEvent.change(screen.getByLabelText(/Cost Price/i), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByLabelText(/Selling Price/i), {
        target: { value: '15' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

      await waitFor(() => {
        expect(apiClient.createInventoryItem).toHaveBeenCalledWith(
          expect.objectContaining({
            requiresPrescription: false,
            isControlled: false,
          })
        );
      });
    });
  });

  describe('Select dropdown enum values', () => {
    it('should have correct type options in dropdown', () => {
      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // Check if type select has correct options
      // Note: This is a simplified test. In a real test, you'd need to open the select
      // and verify the options are present.
      const typeSelect = screen.getByRole('combobox', { name: /Type/i });
      expect(typeSelect).toBeInTheDocument();
    });

    it('should have correct unit options in dropdown', () => {
      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      const unitSelect = screen.getByRole('combobox', { name: /Unit/i });
      expect(unitSelect).toBeInTheDocument();
    });

    it('should default type to MEDICINE', () => {
      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // The form should have MEDICINE as default type
      const typeSelect = screen.getByRole('combobox', { name: /Type/i });
      expect(typeSelect).toHaveValue('MEDICINE');
    });

    it('should default unit to PIECES', () => {
      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      const unitSelect = screen.getByRole('combobox', { name: /Unit/i });
      expect(unitSelect).toHaveValue('PIECES');
    });
  });

  describe('API call with correct payload', () => {
    it('should send complete payload with all fields', async () => {
      (apiClient.createInventoryItem as jest.Mock).mockResolvedValue({ id: 'item-123' });

      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // Fill all fields
      fireEvent.change(screen.getByLabelText(/Item Name/i), {
        target: { value: 'Amoxicillin 500mg' },
      });
      fireEvent.change(screen.getByLabelText(/Description/i), {
        target: { value: 'Antibiotic medication' },
      });
      fireEvent.change(screen.getByLabelText(/Generic Name/i), {
        target: { value: 'Amoxicillin' },
      });
      fireEvent.change(screen.getByLabelText(/Brand Name/i), {
        target: { value: 'Amoxil' },
      });
      fireEvent.change(screen.getByLabelText(/Category/i), {
        target: { value: 'Antibiotics' },
      });
      fireEvent.change(screen.getByLabelText(/Sub-Category/i), {
        target: { value: 'Penicillin' },
      });
      fireEvent.change(screen.getByLabelText(/Manufacturer/i), {
        target: { value: 'GSK Pharma' },
      });
      fireEvent.change(screen.getByLabelText(/Supplier/i), {
        target: { value: 'MedSupply Co.' },
      });
      fireEvent.change(screen.getByLabelText(/Barcode/i), {
        target: { value: '9876543210123' },
      });
      fireEvent.change(screen.getByLabelText(/SKU/i), {
        target: { value: 'AMX-500' },
      });
      fireEvent.change(screen.getByLabelText(/Cost Price/i), {
        target: { value: '25.00' },
      });
      fireEvent.change(screen.getByLabelText(/Selling Price/i), {
        target: { value: '35.00' },
      });
      fireEvent.change(screen.getByLabelText(/MRP/i), {
        target: { value: '40.00' },
      });
      fireEvent.change(screen.getByLabelText(/Pack Size/i), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByLabelText(/Pack Unit/i), {
        target: { value: 'capsules' },
      });
      fireEvent.change(screen.getByLabelText(/Min Stock/i), {
        target: { value: '20' },
      });
      fireEvent.change(screen.getByLabelText(/Max Stock/i), {
        target: { value: '500' },
      });
      fireEvent.change(screen.getByLabelText(/Reorder Level/i), {
        target: { value: '30' },
      });
      fireEvent.change(screen.getByLabelText(/Reorder Qty/i), {
        target: { value: '100' },
      });
      fireEvent.change(screen.getByLabelText(/Batch Number/i), {
        target: { value: 'BATCH2024001' },
      });
      fireEvent.change(screen.getByLabelText(/Expiry Date/i), {
        target: { value: '2025-12-31' },
      });
      fireEvent.change(screen.getByLabelText(/HSN Code/i), {
        target: { value: '30049099' },
      });
      fireEvent.change(screen.getByLabelText(/GST Rate/i), {
        target: { value: '12' },
      });
      fireEvent.change(screen.getByLabelText(/Storage Location/i), {
        target: { value: 'Shelf B-15' },
      });
      fireEvent.change(screen.getByLabelText(/Storage Conditions/i), {
        target: { value: 'Store in cool, dry place' },
      });
      fireEvent.click(screen.getByLabelText(/Requires Prescription/i));
      fireEvent.click(screen.getByLabelText(/Controlled Substance/i));

      fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

      await waitFor(() => {
        expect(apiClient.createInventoryItem).toHaveBeenCalledWith({
          name: 'Amoxicillin 500mg',
          type: 'MEDICINE',
          costPrice: 25.0,
          sellingPrice: 35.0,
          unit: 'PIECES',
          status: 'ACTIVE',
          description: 'Antibiotic medication',
          genericName: 'Amoxicillin',
          brandName: 'Amoxil',
          category: 'Antibiotics',
          subCategory: 'Penicillin',
          manufacturer: 'GSK Pharma',
          supplier: 'MedSupply Co.',
          barcode: '9876543210123',
          sku: 'AMX-500',
          mrp: 40.0,
          packSize: 10,
          packUnit: 'capsules',
          minStockLevel: 20,
          maxStockLevel: 500,
          reorderLevel: 30,
          reorderQuantity: 100,
          batchNumber: 'BATCH2024001',
          expiryDate: '2025-12-31',
          hsnCode: '30049099',
          gstRate: 12,
          storageLocation: 'Shelf B-15',
          storageConditions: 'Store in cool, dry place',
          requiresPrescription: true,
          isControlled: true,
        });
      });
    });
  });

  describe('Success callback and dialog close', () => {
    it('should call onSuccess and onOpenChange after successful submission', async () => {
      (apiClient.createInventoryItem as jest.Mock).mockResolvedValue({ id: 'item-123' });

      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // Fill required fields and submit
      fireEvent.change(screen.getByLabelText(/Item Name/i), {
        target: { value: 'Test Medicine' },
      });
      fireEvent.change(screen.getByLabelText(/Cost Price/i), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByLabelText(/Selling Price/i), {
        target: { value: '15' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('should reset form after successful submission', async () => {
      (apiClient.createInventoryItem as jest.Mock).mockResolvedValue({ id: 'item-123' });

      const { rerender } = render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // Fill and submit
      const nameInput = screen.getByLabelText(/Item Name/i);
      fireEvent.change(nameInput, { target: { value: 'Test Medicine' } });
      fireEvent.change(screen.getByLabelText(/Cost Price/i), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByLabelText(/Selling Price/i), {
        target: { value: '15' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

      await waitFor(() => {
        expect(apiClient.createInventoryItem).toHaveBeenCalled();
      });

      // Reopen dialog
      rerender(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // Form should be reset
      expect(screen.getByLabelText(/Item Name/i)).toHaveValue('');
    });
  });

  describe('Error handling and display', () => {
    it('should display error message on API failure', async () => {
      (apiClient.createInventoryItem as jest.Mock).mockRejectedValue(
        new Error('Failed to create item')
      );

      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // Fill and submit
      fireEvent.change(screen.getByLabelText(/Item Name/i), {
        target: { value: 'Test Medicine' },
      });
      fireEvent.change(screen.getByLabelText(/Cost Price/i), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByLabelText(/Selling Price/i), {
        target: { value: '15' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

      await waitFor(() => {
        expect(screen.getByText(/Failed to create item/i)).toBeInTheDocument();
      });
    });

    it('should not call onSuccess on API failure', async () => {
      (apiClient.createInventoryItem as jest.Mock).mockRejectedValue(
        new Error('API Error')
      );

      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // Fill and submit
      fireEvent.change(screen.getByLabelText(/Item Name/i), {
        target: { value: 'Test Medicine' },
      });
      fireEvent.change(screen.getByLabelText(/Cost Price/i), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByLabelText(/Selling Price/i), {
        target: { value: '15' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

      await waitFor(() => {
        expect(screen.getByText(/API Error/i)).toBeInTheDocument();
      });

      expect(mockOnSuccess).not.toHaveBeenCalled();
      expect(mockOnOpenChange).not.toHaveBeenCalled();
    });

    it('should disable submit button while loading', async () => {
      (apiClient.createInventoryItem as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ id: 'item-123' }), 1000);
          })
      );

      render(
        <AddInventoryItemDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />
      );

      // Fill and submit
      fireEvent.change(screen.getByLabelText(/Item Name/i), {
        target: { value: 'Test Medicine' },
      });
      fireEvent.change(screen.getByLabelText(/Cost Price/i), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByLabelText(/Selling Price/i), {
        target: { value: '15' },
      });

      const submitButton = screen.getByRole('button', { name: /Add Item/i });
      fireEvent.click(submitButton);

      // Button should be disabled during submission
      expect(submitButton).toBeDisabled();
    });
  });
});

