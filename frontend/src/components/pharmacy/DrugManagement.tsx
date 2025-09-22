'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Filter,
  Pill,
  Package,
  DollarSign,
  Building,
  Calendar,
  AlertTriangle
} from 'lucide-react';
import { apiClient } from '@/lib/api';

interface Drug {
  id: string;
  name: string;
  price: number;
  manufacturerName: string;
  packSizeLabel: string;
  composition1?: string;
  composition2?: string;
  category?: string;
  dosageForm?: string;
  strength?: string;
  isDiscontinued: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function DrugManagement() {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedManufacturer, setSelectedManufacturer] = useState('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [manufacturers, setManufacturers] = useState<string[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingDrug, setEditingDrug] = useState<Drug | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0
  });

  // Form state for add/edit
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    manufacturerName: '',
    packSizeLabel: '',
    composition1: '',
    composition2: '',
    category: '',
    dosageForm: '',
    strength: '',
    description: '',
    barcode: '',
    sku: '',
  });

  useEffect(() => {
    loadDrugs();
    loadCategories();
    loadManufacturers();
  }, [searchQuery, selectedCategory, selectedManufacturer, pagination.page]);

  const loadDrugs = async () => {
    try {
      setLoading(true);
      const params: Record<string, any> = {
        page: Math.max(1, pagination.page), // Ensure page is at least 1
        limit: Math.min(100, Math.max(1, pagination.limit)), // Ensure limit is between 1 and 100
        sortBy: 'name',
        sortOrder: 'asc' as const,
      };

      // Only add optional parameters if they have values
      if (searchQuery && searchQuery.trim()) {
        params.search = searchQuery.trim();
      }
      if (selectedCategory !== 'all') {
        params.category = selectedCategory;
      }
      if (selectedManufacturer !== 'all') {
        params.manufacturer = selectedManufacturer;
      }

      const response = await apiClient.get<{ data: Drug[]; pagination?: { total?: number; pages?: number } }>('/drugs', params);
      setDrugs(response.data || []);
      setPagination(prev => ({
        ...prev,
        total: response.pagination?.total || 0,
        pages: response.pagination?.pages || 0,
      }));
    } catch (error) {
      console.error('Failed to load drugs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await apiClient.get<string[]>('/drugs/categories');
      setCategories(response || []);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadManufacturers = async () => {
    try {
      const response = await apiClient.get<string[]>('/drugs/manufacturers');
      setManufacturers(response || []);
    } catch (error) {
      console.error('Failed to load manufacturers:', error);
    }
  };

  const handleAddDrug = async () => {
    try {
      const drugData = {
        ...formData,
        price: parseFloat(formData.price) || 0,
      };

      await apiClient.post('/drugs', drugData);
      setShowAddDialog(false);
      resetForm();
      loadDrugs();
    } catch (error) {
      console.error('Failed to add drug:', error);
      alert('Failed to add drug. Please try again.');
    }
  };

  const handleEditDrug = async () => {
    if (!editingDrug) return;

    try {
      const drugData = {
        ...formData,
        price: parseFloat(formData.price) || 0,
      };

      await apiClient.patch(`/drugs/${editingDrug.id}`, drugData);
      setEditingDrug(null);
      resetForm();
      loadDrugs();
    } catch (error) {
      console.error('Failed to update drug:', error);
      alert('Failed to update drug. Please try again.');
    }
  };

  const handleDeleteDrug = async (drugId: string) => {
    if (!confirm('Are you sure you want to delete this drug?')) return;

    try {
      await apiClient.delete(`/drugs/${drugId}`);
      loadDrugs();
    } catch (error) {
      console.error('Failed to delete drug:', error);
      alert('Failed to delete drug. Please try again.');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      price: '',
      manufacturerName: '',
      packSizeLabel: '',
      composition1: '',
      composition2: '',
      category: '',
      dosageForm: '',
      strength: '',
      description: '',
      barcode: '',
      sku: '',
    });
  };

  const openEditDialog = (drug: Drug) => {
    setEditingDrug(drug);
    setFormData({
      name: drug.name,
      price: drug.price.toString(),
      manufacturerName: drug.manufacturerName,
      packSizeLabel: drug.packSizeLabel,
      composition1: drug.composition1 || '',
      composition2: drug.composition2 || '',
      category: drug.category || '',
      dosageForm: drug.dosageForm || '',
      strength: drug.strength || '',
      description: '',
      barcode: '',
      sku: '',
    });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedManufacturer('all');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Drug Database</h2>
          <p className="text-gray-600">Manage your pharmacy's drug inventory</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Add New Drug
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Drugs</p>
                <p className="text-2xl font-bold">{pagination.total.toLocaleString()}</p>
              </div>
              <Pill className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Categories</p>
                <p className="text-2xl font-bold">{categories.length}</p>
              </div>
              <Package className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Manufacturers</p>
                <p className="text-2xl font-bold">{manufacturers.length}</p>
              </div>
              <Building className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Drugs</p>
                <p className="text-2xl font-bold">{drugs.filter(d => d.isActive).length}</p>
              </div>
              <Calendar className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Search Drugs</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by name, composition..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div>
              <Label>Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Manufacturer</Label>
              <Select value={selectedManufacturer} onValueChange={setSelectedManufacturer}>
                <SelectTrigger>
                  <SelectValue placeholder="All manufacturers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All manufacturers</SelectItem>
                  {manufacturers.slice(0, 50).map((manufacturer) => (
                    <SelectItem key={manufacturer} value={manufacturer}>
                      {manufacturer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <Button variant="outline" onClick={clearFilters} className="w-full">
                <Filter className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Drugs List */}
      <Card>
        <CardHeader>
          <CardTitle>Drugs ({pagination.total})</CardTitle>
          <CardDescription>
            Showing {drugs.length} of {pagination.total} drugs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-gray-500">Loading drugs...</p>
              </div>
            </div>
          ) : drugs.length === 0 ? (
            <div className="text-center py-8">
              <Pill className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">No drugs found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {drugs.map((drug) => (
                <div key={drug.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-lg">{drug.name}</h3>
                        {drug.isDiscontinued && (
                          <Badge variant="destructive">Discontinued</Badge>
                        )}
                        {!drug.isActive && (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                        {drug.category && (
                          <Badge variant="outline">{drug.category}</Badge>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                        <div>
                          <p><strong>Manufacturer:</strong> {drug.manufacturerName}</p>
                          <p><strong>Pack Size:</strong> {drug.packSizeLabel}</p>
                        </div>
                        <div>
                          {drug.composition1 && (
                            <p><strong>Composition:</strong> {drug.composition1}</p>
                          )}
                          {drug.strength && (
                            <p><strong>Strength:</strong> {drug.strength}</p>
                          )}
                        </div>
                        <div>
                          <p><strong>Price:</strong> ₹{drug.price.toFixed(2)}</p>
                          {drug.dosageForm && (
                            <p><strong>Form:</strong> {drug.dosageForm}</p>
                          )}
                        </div>
                      </div>
                      
                      {drug.composition2 && (
                        <p className="text-sm text-blue-600 mt-2">
                          <strong>Additional:</strong> {drug.composition2}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(drug)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteDrug(drug.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Pagination */}
              {pagination.pages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page === 1}
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  >
                    Previous
                  </Button>
                  
                  <span className="text-sm text-gray-600">
                    Page {pagination.page} of {pagination.pages}
                  </span>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page === pagination.pages}
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Drug Dialog */}
      <Dialog open={showAddDialog || !!editingDrug} onOpenChange={(open: boolean) => {
        if (!open) {
          setShowAddDialog(false);
          setEditingDrug(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingDrug ? 'Edit Drug' : 'Add New Drug'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Drug Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Paracetamol 500mg Tablet"
              />
            </div>
            
            <div>
              <Label htmlFor="price">Price (₹) *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            
            <div>
              <Label htmlFor="manufacturerName">Manufacturer *</Label>
              <Input
                id="manufacturerName"
                value={formData.manufacturerName}
                onChange={(e) => setFormData(prev => ({ ...prev, manufacturerName: e.target.value }))}
                placeholder="e.g., Sun Pharmaceuticals"
              />
            </div>
            
            <div>
              <Label htmlFor="packSizeLabel">Pack Size *</Label>
              <Input
                id="packSizeLabel"
                value={formData.packSizeLabel}
                onChange={(e) => setFormData(prev => ({ ...prev, packSizeLabel: e.target.value }))}
                placeholder="e.g., strip of 10 tablets"
              />
            </div>
            
            <div>
              <Label htmlFor="composition1">Primary Composition</Label>
              <Input
                id="composition1"
                value={formData.composition1}
                onChange={(e) => setFormData(prev => ({ ...prev, composition1: e.target.value }))}
                placeholder="e.g., Paracetamol (500mg)"
              />
            </div>
            
            <div>
              <Label htmlFor="composition2">Secondary Composition</Label>
              <Input
                id="composition2"
                value={formData.composition2}
                onChange={(e) => setFormData(prev => ({ ...prev, composition2: e.target.value }))}
                placeholder="e.g., Caffeine (65mg)"
              />
            </div>
            
            <div>
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                placeholder="e.g., Analgesics"
              />
            </div>
            
            <div>
              <Label htmlFor="dosageForm">Dosage Form</Label>
              <Input
                id="dosageForm"
                value={formData.dosageForm}
                onChange={(e) => setFormData(prev => ({ ...prev, dosageForm: e.target.value }))}
                placeholder="e.g., Tablet"
              />
            </div>
            
            <div>
              <Label htmlFor="strength">Strength</Label>
              <Input
                id="strength"
                value={formData.strength}
                onChange={(e) => setFormData(prev => ({ ...prev, strength: e.target.value }))}
                placeholder="e.g., 500mg"
              />
            </div>
            
            <div>
              <Label htmlFor="barcode">Barcode</Label>
              <Input
                id="barcode"
                value={formData.barcode}
                onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                placeholder="e.g., 1234567890123"
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Additional description..."
              rows={3}
            />
          </div>
          
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => {
              setShowAddDialog(false);
              setEditingDrug(null);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={editingDrug ? handleEditDrug : handleAddDrug}>
              {editingDrug ? 'Update Drug' : 'Add Drug'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 