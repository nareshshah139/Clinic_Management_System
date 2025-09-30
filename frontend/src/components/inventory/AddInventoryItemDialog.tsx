'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { apiClient } from '@/lib/api';
import { Loader2 } from 'lucide-react';

interface AddInventoryItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddInventoryItemDialog({ open, onOpenChange, onSuccess }: AddInventoryItemDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    // Basic Information
    name: '',
    description: '',
    genericName: '',
    brandName: '',
    type: 'MEDICINE',
    category: '',
    subCategory: '',
    manufacturer: '',
    supplier: '',

    // Identification
    barcode: '',
    sku: '',

    // Pricing
    costPrice: '',
    sellingPrice: '',
    mrp: '',

    // Unit & Packaging
    unit: 'PIECES',
    packSize: '',
    packUnit: '',

    // Stock Levels
    minStockLevel: '',
    maxStockLevel: '',
    reorderLevel: '',
    reorderQuantity: '',

    // Additional Details
    expiryDate: '',
    batchNumber: '',
    hsnCode: '',
    gstRate: '',
    storageLocation: '',
    storageConditions: '',

    // Flags
    requiresPrescription: false,
    isControlled: false,
    status: 'ACTIVE',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Prepare data, converting strings to numbers where needed
      const payload: Record<string, unknown> = {
        name: formData.name,
        type: formData.type,
        costPrice: parseFloat(formData.costPrice),
        sellingPrice: parseFloat(formData.sellingPrice),
        unit: formData.unit,
        status: formData.status,
      };

      // Add optional string fields
      if (formData.description) payload.description = formData.description;
      if (formData.genericName) payload.genericName = formData.genericName;
      if (formData.brandName) payload.brandName = formData.brandName;
      if (formData.category) payload.category = formData.category;
      if (formData.subCategory) payload.subCategory = formData.subCategory;
      if (formData.manufacturer) payload.manufacturer = formData.manufacturer;
      if (formData.supplier) payload.supplier = formData.supplier;
      if (formData.barcode) payload.barcode = formData.barcode;
      if (formData.sku) payload.sku = formData.sku;
      if (formData.batchNumber) payload.batchNumber = formData.batchNumber;
      if (formData.hsnCode) payload.hsnCode = formData.hsnCode;
      if (formData.storageLocation) payload.storageLocation = formData.storageLocation;
      if (formData.storageConditions) payload.storageConditions = formData.storageConditions;
      if (formData.packUnit) payload.packUnit = formData.packUnit;

      // Add optional numeric fields
      if (formData.mrp) payload.mrp = parseFloat(formData.mrp);
      if (formData.packSize) payload.packSize = parseInt(formData.packSize);
      if (formData.minStockLevel) payload.minStockLevel = parseInt(formData.minStockLevel);
      if (formData.maxStockLevel) payload.maxStockLevel = parseInt(formData.maxStockLevel);
      if (formData.reorderLevel) payload.reorderLevel = parseInt(formData.reorderLevel);
      if (formData.reorderQuantity) payload.reorderQuantity = parseInt(formData.reorderQuantity);
      if (formData.gstRate) payload.gstRate = parseFloat(formData.gstRate);

      // Add optional date field
      if (formData.expiryDate) payload.expiryDate = formData.expiryDate;

      // Add boolean fields
      payload.requiresPrescription = formData.requiresPrescription;
      payload.isControlled = formData.isControlled;

      console.log('📦 Creating inventory item:', payload);
      await apiClient.createInventoryItem(payload);

      // Reset form
      setFormData({
        name: '',
        description: '',
        genericName: '',
        brandName: '',
        type: 'MEDICINE',
        category: '',
        subCategory: '',
        manufacturer: '',
        supplier: '',
        barcode: '',
        sku: '',
        costPrice: '',
        sellingPrice: '',
        mrp: '',
        unit: 'PIECES',
        packSize: '',
        packUnit: '',
        minStockLevel: '',
        maxStockLevel: '',
        reorderLevel: '',
        reorderQuantity: '',
        expiryDate: '',
        batchNumber: '',
        hsnCode: '',
        gstRate: '',
        storageLocation: '',
        storageConditions: '',
        requiresPrescription: false,
        isControlled: false,
        status: 'ACTIVE',
      });

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error('❌ Error creating inventory item:', err);
      setError(err instanceof Error ? err.message : 'Failed to create inventory item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Inventory Item</DialogTitle>
          <DialogDescription>
            Add a new item to your inventory. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Basic Information</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Item Name *</Label>
                <Input
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Paracetamol 500mg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select value={formData.type} onValueChange={(value: string) => setFormData({ ...formData, type: value })}>
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MEDICINE">Medicine</SelectItem>
                    <SelectItem value="EQUIPMENT">Equipment</SelectItem>
                    <SelectItem value="SUPPLY">Supply</SelectItem>
                    <SelectItem value="CONSUMABLE">Consumable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the item"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="genericName">Generic Name</Label>
                <Input
                  id="genericName"
                  value={formData.genericName}
                  onChange={(e) => setFormData({ ...formData, genericName: e.target.value })}
                  placeholder="e.g., Acetaminophen"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="brandName">Brand Name</Label>
                <Input
                  id="brandName"
                  value={formData.brandName}
                  onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
                  placeholder="e.g., Crocin"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., Analgesics"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subCategory">Sub-Category</Label>
                <Input
                  id="subCategory"
                  value={formData.subCategory}
                  onChange={(e) => setFormData({ ...formData, subCategory: e.target.value })}
                  placeholder="e.g., Non-opioid"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="manufacturer">Manufacturer</Label>
                <Input
                  id="manufacturer"
                  value={formData.manufacturer}
                  onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                  placeholder="e.g., GSK Pharma"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier">Supplier</Label>
                <Input
                  id="supplier"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  placeholder="e.g., MedSupply Co."
                />
              </div>
            </div>
          </div>

          {/* Identification */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Identification</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="barcode">Barcode</Label>
                <Input
                  id="barcode"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  placeholder="e.g., 1234567890123"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sku">SKU</Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="e.g., MED-PAR-500"
                />
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Pricing</h3>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="costPrice">Cost Price (₹) *</Label>
                <Input
                  id="costPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.costPrice}
                  onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sellingPrice">Selling Price (₹) *</Label>
                <Input
                  id="sellingPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.sellingPrice}
                  onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mrp">MRP (₹)</Label>
                <Input
                  id="mrp"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.mrp}
                  onChange={(e) => setFormData({ ...formData, mrp: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Unit & Packaging */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Unit & Packaging</h3>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit">Unit *</Label>
                <Select value={formData.unit} onValueChange={(value: string) => setFormData({ ...formData, unit: value })}>
                  <SelectTrigger id="unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PIECES">Pieces</SelectItem>
                    <SelectItem value="BOXES">Boxes</SelectItem>
                    <SelectItem value="BOTTLES">Bottles</SelectItem>
                    <SelectItem value="STRIPS">Strips</SelectItem>
                    <SelectItem value="TUBES">Tubes</SelectItem>
                    <SelectItem value="VIALS">Vials</SelectItem>
                    <SelectItem value="AMPOULES">Ampoules</SelectItem>
                    <SelectItem value="SYRINGES">Syringes</SelectItem>
                    <SelectItem value="PACKS">Packs</SelectItem>
                    <SelectItem value="KITS">Kits</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="packSize">Pack Size</Label>
                <Input
                  id="packSize"
                  type="number"
                  min="0"
                  value={formData.packSize}
                  onChange={(e) => setFormData({ ...formData, packSize: e.target.value })}
                  placeholder="e.g., 10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="packUnit">Pack Unit</Label>
                <Input
                  id="packUnit"
                  value={formData.packUnit}
                  onChange={(e) => setFormData({ ...formData, packUnit: e.target.value })}
                  placeholder="e.g., tablets"
                />
              </div>
            </div>
          </div>

          {/* Stock Levels */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Stock Levels</h3>
            
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="minStockLevel">Min Stock</Label>
                <Input
                  id="minStockLevel"
                  type="number"
                  min="0"
                  value={formData.minStockLevel}
                  onChange={(e) => setFormData({ ...formData, minStockLevel: e.target.value })}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxStockLevel">Max Stock</Label>
                <Input
                  id="maxStockLevel"
                  type="number"
                  min="0"
                  value={formData.maxStockLevel}
                  onChange={(e) => setFormData({ ...formData, maxStockLevel: e.target.value })}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reorderLevel">Reorder Level</Label>
                <Input
                  id="reorderLevel"
                  type="number"
                  min="0"
                  value={formData.reorderLevel}
                  onChange={(e) => setFormData({ ...formData, reorderLevel: e.target.value })}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reorderQuantity">Reorder Qty</Label>
                <Input
                  id="reorderQuantity"
                  type="number"
                  min="0"
                  value={formData.reorderQuantity}
                  onChange={(e) => setFormData({ ...formData, reorderQuantity: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Additional Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Additional Details</h3>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="batchNumber">Batch Number</Label>
                <Input
                  id="batchNumber"
                  value={formData.batchNumber}
                  onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })}
                  placeholder="e.g., BT123456"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiryDate">Expiry Date</Label>
                <Input
                  id="expiryDate"
                  type="date"
                  value={formData.expiryDate}
                  onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hsnCode">HSN Code</Label>
                <Input
                  id="hsnCode"
                  value={formData.hsnCode}
                  onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                  placeholder="e.g., 30049099"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gstRate">GST Rate (%)</Label>
                <Input
                  id="gstRate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.gstRate}
                  onChange={(e) => setFormData({ ...formData, gstRate: e.target.value })}
                  placeholder="e.g., 18"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="storageLocation">Storage Location</Label>
                <Input
                  id="storageLocation"
                  value={formData.storageLocation}
                  onChange={(e) => setFormData({ ...formData, storageLocation: e.target.value })}
                  placeholder="e.g., Shelf A-12"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="storageConditions">Storage Conditions</Label>
              <Input
                id="storageConditions"
                value={formData.storageConditions}
                onChange={(e) => setFormData({ ...formData, storageConditions: e.target.value })}
                placeholder="e.g., Store in a cool, dry place"
              />
            </div>

            <div className="flex gap-6">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="requiresPrescription"
                  checked={formData.requiresPrescription}
                  onCheckedChange={(checked: boolean) =>
                    setFormData({ ...formData, requiresPrescription: checked as boolean })
                  }
                />
                <Label htmlFor="requiresPrescription" className="text-sm font-normal cursor-pointer">
                  Requires Prescription
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isControlled"
                  checked={formData.isControlled}
                  onCheckedChange={(checked: boolean) =>
                    setFormData({ ...formData, isControlled: checked as boolean })
                  }
                />
                <Label htmlFor="isControlled" className="text-sm font-normal cursor-pointer">
                  Controlled Substance
                </Label>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

