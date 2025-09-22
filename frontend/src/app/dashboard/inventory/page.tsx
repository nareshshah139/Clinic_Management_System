'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Package,
  Search,
  Plus,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  // Calendar,
  // Filter,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import type { InventoryItem, ItemCategory } from '@/lib/types';

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ItemCategory | 'ALL'>('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'LOW' | 'OUT'>('ALL');

  const fetchInventoryItems = useCallback(async () => {
    try {
      setLoading(true);
      console.log('�� Fetching inventory items...');
      const response = await apiClient.getInventoryItems({
        search: searchTerm || undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        stockStatus: stockFilter !== 'ALL' ? stockFilter : undefined,
      });
      console.log('🏪 Inventory response:', response, 'Type:', typeof response);
      
      // Backend might return { items, total } or just items array
      const items: InventoryItem[] = Array.isArray(response)
        ? response
        : (response?.items ?? []);
      console.log('🏪 Extracted items:', items, 'Length:', Array.isArray(items) ? items.length : 'Not array');
      
      setItems(Array.isArray(items) ? items : []);
    } catch (error) {
      console.error('❌ Error fetching inventory items:', error);
      setItems([]); // Ensure we always set an array
    } finally {
      setLoading(false);
    }
  }, [searchTerm, categoryFilter, stockFilter]);

  useEffect(() => {
    fetchInventoryItems();
  }, [fetchInventoryItems]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchInventoryItems();
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [fetchInventoryItems]);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventory Management</h1>
          <p className="text-gray-600">Track and manage your clinic&#39;s inventory</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
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
              <Button className="mt-4">
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
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                            <Button variant="outline" size="sm">
                              Stock
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
        </CardContent>
      </Card>
    </div>
  );
} 