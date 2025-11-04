'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QuickGuide } from '@/components/common/QuickGuide';
import {
  Package,
  Search,
  Plus,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Trash2,
  // Calendar,
  // Filter,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import type { InventoryItem, ItemCategory } from '@/lib/types';
import { AddInventoryItemDialog } from '@/components/inventory/AddInventoryItemDialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ItemCategory | 'ALL'>('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'LOW' | 'OUT'>('ALL');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const { toast } = useToast();
  // Edit dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string; sku: string; costPrice: string; sellingPrice: string; reorderLevel: string }>({
    name: '',
    description: '',
    sku: '',
    costPrice: '',
    sellingPrice: '',
    reorderLevel: '',
  });
  // Stock adjust dialog state
  const [showStockDialog, setShowStockDialog] = useState(false);
  const [stockItem, setStockItem] = useState<InventoryItem | null>(null);
  const [stockDelta, setStockDelta] = useState<string>('0');
  const [stockNote, setStockNote] = useState<string>('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const pageSize = 20;

  const fetchInventoryItems = useCallback(async (page: number = currentPage) => {
    try {
      setLoading(true);
      console.log('🏪 Fetching inventory items...');
      const response = await apiClient.getInventoryItems({
        page: Math.max(1, page),
        limit: pageSize,
        search: searchTerm || undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        stockStatus: stockFilter !== 'ALL' ? stockFilter : undefined,
        sortBy: 'name',
        sortOrder: 'asc',
      });
      console.log('🏪 Inventory response:', response, 'Type:', typeof response);
      
      // Backend returns { items, pagination: { page, limit, total, totalPages } }
      const items: InventoryItem[] = Array.isArray(response)
        ? response
        : (response?.items ?? []);
      console.log('🏪 Extracted items:', items, 'Length:', Array.isArray(items) ? items.length : 'Not array');
      
      setItems(Array.isArray(items) ? items : []);
      
      // Update pagination metadata
      if (response && !Array.isArray(response) && response.pagination) {
        setTotalPages(response.pagination.totalPages || 1);
        setTotalItems(response.pagination.total || 0);
      } else {
        // Fallback if backend doesn't return pagination
        setTotalPages(1);
        setTotalItems(items.length);
      }
    } catch (error) {
      console.error('❌ Error fetching inventory items:', error);
      setItems([]); // Ensure we always set an array
      setTotalPages(1);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, categoryFilter, stockFilter, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, stockFilter]);

  // Fetch data when page changes
  useEffect(() => {
    fetchInventoryItems(currentPage);
  }, [currentPage]);

  // Debounced fetch when filters change
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchInventoryItems(1);
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchTerm, categoryFilter, stockFilter]);

  const getStockStatus = (item: InventoryItem) => {
    if (item.currentStock === 0) {
      return { status: 'Out of Stock', variant: 'destructive' as const, color: 'text-red-600' };
    } else if (item.currentStock <= item.reorderLevel) {
      return { status: 'Low Stock', variant: 'secondary' as const, color: 'text-yellow-600' };
    }
    return { status: 'In Stock', variant: 'default' as const, color: 'text-green-600' };
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  // formatDate removed (unused)

  const lowStockItems = items.filter(item => item.currentStock <= item.reorderLevel);
  const outOfStockItems = items.filter(item => item.currentStock === 0);
  const totalValue = items.reduce((sum, item) => sum + (item.currentStock * item.costPrice), 0);

  const openEdit = (item: InventoryItem) => {
    setEditItem(item);
    setEditForm({
      name: item.name || '',
      description: item.description || '',
      sku: item.sku || '',
      costPrice: String(item.costPrice ?? ''),
      sellingPrice: String(item.sellingPrice ?? ''),
      reorderLevel: String(item.reorderLevel ?? ''),
    });
    setShowEditDialog(true);
  };

  const openStock = (item: InventoryItem) => {
    setStockItem(item);
    setStockDelta('0');
    setStockNote('');
    setShowStockDialog(true);
  };

  const handleSaveEdit = async () => {
    // No-op placeholder; backend update endpoint not wired yet
    toast({ description: 'Saved changes (no-op). Inventory update not yet implemented.' });
    setShowEditDialog(false);
    setEditItem(null);
    // Optionally refresh list
    fetchInventoryItems(1);
  };

  const handleApplyStock = async () => {
    // No-op placeholder; backend stock adjust endpoint not wired yet
    toast({ description: 'Applied stock adjustment (no-op). Not yet implemented.' });
    setShowStockDialog(false);
    setStockItem(null);
    // Optionally refresh list
    fetchInventoryItems(1);
  };

  const handleDeleteItem = async (item: InventoryItem) => {
    const confirmed = window.confirm('Are you sure you want to delete this item? This cannot be undone.');
    if (!confirmed) return;
    try {
      await apiClient.deleteInventoryItem(item.id);
      toast({ description: 'Item deleted successfully' });
      fetchInventoryItems(1);
    } catch (error: any) {
      const message = error?.body?.message || error?.message || 'Failed to delete item';
      toast({ variant: 'destructive', title: 'Delete failed', description: message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventory Management</h1>
          <p className="text-gray-600">Track and manage your clinic&#39;s inventory</p>
        </div>
        <div className="flex gap-2">
          <QuickGuide
            title="Inventory Management Guide"
            triggerVariant="ghost"
            sections={[
              {
                title: "Managing Items",
                items: [
                  "Click 'Add Item' to create new inventory entries",
                  "Fill in item details: name, SKU, category, and pricing",
                  "Set reorder levels to receive low stock alerts",
                  "Use Edit button to update item information"
                ]
              },
              {
                title: "Stock Management",
                items: [
                  "Click 'Stock' button to adjust item quantities",
                  "Add positive values to increase stock",
                  "Use negative values to record usage or damage",
                  "Add notes to track reasons for adjustments"
                ]
              },
              {
                title: "Search & Filter",
                items: [
                  "Search items by name, SKU, or barcode",
                  "Filter by category (Medicine, Equipment, Supplies)",
                  "Filter by stock status (All, Low Stock, Out of Stock)",
                  "View total inventory value and low stock alerts at the top"
                ]
              }
            ]}
          />
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Items</p>
                <p className="text-2xl font-bold text-gray-900">{items.length}</p>
              </div>
              <Package className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Low Stock</p>
                <p className="text-2xl font-bold text-yellow-600">{lowStockItems.length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Out of Stock</p>
                <p className="text-2xl font-bold text-red-600">{outOfStockItems.length}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Value</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalValue)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search items by name, SKU, or barcode..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <Select value={categoryFilter} onValueChange={(value: ItemCategory | 'ALL') => setCategoryFilter(value)}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                <SelectItem value="MEDICINE">Medicine</SelectItem>
                <SelectItem value="EQUIPMENT">Equipment</SelectItem>
                <SelectItem value="SUPPLIES">Supplies</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={(value: 'ALL' | 'LOW' | 'OUT') => setStockFilter(value)}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Stock Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Items</SelectItem>
                <SelectItem value="LOW">Low Stock</SelectItem>
                <SelectItem value="OUT">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory Items</CardTitle>
          <CardDescription>
            Manage your inventory items and track stock levels
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No inventory items found</p>
              <Button className="mt-4" onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add First Item
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Current Stock</TableHead>
                    <TableHead>Reorder Level</TableHead>
                    <TableHead>Cost Price</TableHead>
                    <TableHead>Selling Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const stockStatus = getStockStatus(item);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{item.name}</div>
                            {item.description && (
                              <div className="text-sm text-gray-500">{item.description}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.category}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                        <TableCell>
                          <span className={stockStatus.color}>
                            {item.currentStock}
                          </span>
                        </TableCell>
                        <TableCell>{item.reorderLevel}</TableCell>
                        <TableCell>{formatCurrency(item.costPrice)}</TableCell>
                        <TableCell>{formatCurrency(item.sellingPrice ?? item.costPrice)}</TableCell>
                        <TableCell>
                          <Badge variant={stockStatus.variant}>
                            {stockStatus.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                              Edit
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openStock(item)}>
                              Stock
                            </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleDeleteItem(item)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Delete Item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          
          {/* Pagination Controls */}
          {!loading && items.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 mt-4 border-t">
              <div className="text-sm text-gray-500">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems} items
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        className="w-8 h-8 p-0"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Item Dialog (no-op) */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="inv-name">Name</Label>
              <Input id="inv-name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-sku">SKU</Label>
              <Input id="inv-sku" value={editForm.sku} onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="inv-desc">Description</Label>
              <Input id="inv-desc" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-cost">Cost Price</Label>
              <Input id="inv-cost" type="number" inputMode="decimal" value={editForm.costPrice} onChange={(e) => setEditForm({ ...editForm, costPrice: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-sp">Selling Price</Label>
              <Input id="inv-sp" type="number" inputMode="decimal" value={editForm.sellingPrice} onChange={(e) => setEditForm({ ...editForm, sellingPrice: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-reorder">Reorder Level</Label>
              <Input id="inv-reorder" type="number" inputMode="numeric" value={editForm.reorderLevel} onChange={(e) => setEditForm({ ...editForm, reorderLevel: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={() => void handleSaveEdit()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock Adjust Dialog (no-op) */}
      <Dialog open={showStockDialog} onOpenChange={setShowStockDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Adjust Stock{stockItem ? ` — ${stockItem.name}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="inv-delta">Quantity Change (use negative to reduce)</Label>
              <Input id="inv-delta" type="number" inputMode="numeric" value={stockDelta} onChange={(e) => setStockDelta(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-note">Reason/Note</Label>
              <Input id="inv-note" value={stockNote} onChange={(e) => setStockNote(e.target.value)} placeholder="e.g., New purchase, damaged stock" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStockDialog(false)}>Cancel</Button>
            <Button onClick={() => void handleApplyStock()}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <AddInventoryItemDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={fetchInventoryItems}
      />
    </div>
  );
} 