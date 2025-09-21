'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Package, 
  Plus, 
  Edit, 
  Trash2, 
  Eye,
  Search,
  Filter,
  DollarSign,
  Clock,
  User,
  AlertTriangle,
  CheckCircle,
  X
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface Drug {
  id: string;
  name: string;
  price: number;
  manufacturerName: string;
  packSizeLabel: string;
  category?: string;
  dosageForm?: string;
  strength?: string;
}

interface PackageItem {
  drugId: string;
  quantity: number;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  sequence?: number;
}

interface PharmacyPackage {
  id: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  originalPrice: number;
  packagePrice: number;
  discountPercent: number;
  duration?: string;
  instructions?: string;
  indications?: string;
  contraindications?: string;
  createdBy?: string;
  isActive: boolean;
  isPublic: boolean;
  createdAt: string;
  creator?: {
    id: string;
    firstName: string;
    lastName: string;
    department?: string;
  };
  items: {
    id: string;
    drugId: string;
    quantity: number;
    dosage?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
    sequence: number;
    drug: Drug;
  }[];
}

const DERMATOLOGY_SUBCATEGORIES = [
  'Acne Treatment',
  'Anti-aging',
  'Hair Care',
  'Pigmentation',
  'Eczema/Psoriasis',
  'Fungal Infections',
  'Wound Care',
  'Moisturizing',
  'Sun Protection',
  'Post-procedure Care'
];

export function PharmacyPackageManager() {
  const [packages, setPackages] = useState<PharmacyPackage[]>([]);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PharmacyPackage | null>(null);
  const [editingPackage, setEditingPackage] = useState<PharmacyPackage | null>(null);
  const { toast } = useToast();

  // Form state for creating/editing packages
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'Dermatology',
    subcategory: '',
    packagePrice: 0,
    discountPercent: 0,
    duration: '',
    instructions: '',
    indications: '',
    contraindications: '',
    isPublic: false,
    items: [] as PackageItem[]
  });

  useEffect(() => {
    loadPackages();
    loadDrugs();
  }, []);

  const loadPackages = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/pharmacy/packages', {
        params: {
          search: searchQuery || undefined,
          category: selectedCategory !== 'all' ? selectedCategory : undefined,
          subcategory: selectedSubcategory !== 'all' ? selectedSubcategory : undefined,
          limit: 50
        }
      });
      setPackages(response.data.packages || []);
    } catch (error) {
      console.error('Error loading packages:', error);
      toast({
        title: "Error",
        description: "Failed to load pharmacy packages",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDrugs = async () => {
    try {
      const response = await apiClient.get('/drugs', {
        params: {
          category: 'Dermatology',
          limit: 100,
          isActive: true
        }
      });
      setDrugs(response.data.drugs || []);
    } catch (error) {
      console.error('Error loading drugs:', error);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      loadPackages();
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, selectedCategory, selectedSubcategory]);

  const handleCreatePackage = async () => {
    try {
      if (!formData.name || formData.items.length === 0) {
        toast({
          title: "Validation Error",
          description: "Package name and at least one item are required",
          variant: "destructive",
        });
        return;
      }

      await apiClient.post('/pharmacy/packages', formData);
      
      toast({
        title: "Success",
        description: "Package created successfully",
      });
      
      setShowCreateDialog(false);
      resetForm();
      loadPackages();
    } catch (error: any) {
      console.error('Error creating package:', error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to create package",
        variant: "destructive",
      });
    }
  };

  const handleUpdatePackage = async () => {
    try {
      if (!editingPackage || !formData.name || formData.items.length === 0) {
        toast({
          title: "Validation Error",
          description: "Package name and at least one item are required",
          variant: "destructive",
        });
        return;
      }

      await apiClient.patch(`/pharmacy/packages/${editingPackage.id}`, formData);
      
      toast({
        title: "Success",
        description: "Package updated successfully",
      });
      
      setEditingPackage(null);
      resetForm();
      loadPackages();
    } catch (error: any) {
      console.error('Error updating package:', error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to update package",
        variant: "destructive",
      });
    }
  };

  const handleDeletePackage = async (packageId: string) => {
    try {
      if (!confirm('Are you sure you want to delete this package?')) {
        return;
      }

      await apiClient.delete(`/pharmacy/packages/${packageId}`);
      
      toast({
        title: "Success",
        description: "Package deleted successfully",
      });
      
      loadPackages();
    } catch (error: any) {
      console.error('Error deleting package:', error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to delete package",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      category: 'Dermatology',
      subcategory: '',
      packagePrice: 0,
      discountPercent: 0,
      duration: '',
      instructions: '',
      indications: '',
      contraindications: '',
      isPublic: false,
      items: []
    });
  };

  const addItemToPackage = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, {
        drugId: '',
        quantity: 1,
        dosage: '',
        frequency: '',
        duration: '',
        instructions: '',
        sequence: prev.items.length + 1
      }]
    }));
  };

  const removeItemFromPackage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const updatePackageItem = (index: number, field: keyof PackageItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const calculateOriginalPrice = () => {
    return formData.items.reduce((total, item) => {
      const drug = drugs.find(d => d.id === item.drugId);
      return total + (drug ? drug.price * item.quantity : 0);
    }, 0);
  };

  const openEditDialog = (pkg: PharmacyPackage) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name,
      description: pkg.description || '',
      category: pkg.category,
      subcategory: pkg.subcategory || '',
      packagePrice: pkg.packagePrice,
      discountPercent: pkg.discountPercent,
      duration: pkg.duration || '',
      instructions: pkg.instructions || '',
      indications: pkg.indications || '',
      contraindications: pkg.contraindications || '',
      isPublic: pkg.isPublic,
      items: pkg.items.map(item => ({
        drugId: item.drugId,
        quantity: item.quantity,
        dosage: item.dosage,
        frequency: item.frequency,
        duration: item.duration,
        instructions: item.instructions,
        sequence: item.sequence
      }))
    });
  };

  const filteredPackages = packages.filter(pkg => {
    const matchesSearch = !searchQuery || 
      pkg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pkg.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pkg.indications?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || pkg.category === selectedCategory;
    const matchesSubcategory = selectedSubcategory === 'all' || pkg.subcategory === selectedSubcategory;
    
    return matchesSearch && matchesCategory && matchesSubcategory;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" />
            Pharmacy Packages
          </h2>
          <p className="text-muted-foreground">
            Create and manage dermatology treatment packages
          </p>
        </div>
        <Button 
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Create Package
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search packages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="Dermatology">Dermatology</SelectItem>
                  <SelectItem value="General">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="subcategory">Subcategory</Label>
              <Select value={selectedSubcategory} onValueChange={setSelectedSubcategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All subcategories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subcategories</SelectItem>
                  {DERMATOLOGY_SUBCATEGORIES.map(sub => (
                    <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Packages List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full flex justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-2 text-muted-foreground">Loading packages...</p>
            </div>
          </div>
        ) : filteredPackages.length === 0 ? (
          <div className="col-span-full text-center py-8">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No packages found</h3>
            <p className="text-muted-foreground">
              {searchQuery || selectedCategory || selectedSubcategory 
                ? 'Try adjusting your filters' 
                : 'Create your first package to get started'}
            </p>
          </div>
        ) : (
          filteredPackages.map((pkg) => (
            <Card key={pkg.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{pkg.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {pkg.description}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedPackage(pkg);
                        setShowViewDialog(true);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(pkg)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeletePackage(pkg.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Badge variant="secondary">{pkg.subcategory}</Badge>
                    <div className="flex items-center gap-1">
                      {pkg.isPublic ? (
                        <Badge variant="default">Public</Badge>
                      ) : (
                        <Badge variant="outline">Private</Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-muted-foreground line-through">
                        ₹{pkg.originalPrice.toFixed(2)}
                      </p>
                      <p className="font-semibold text-lg">
                        ₹{pkg.packagePrice.toFixed(2)}
                      </p>
                    </div>
                    <Badge variant="destructive" className="text-xs">
                      {pkg.discountPercent.toFixed(1)}% OFF
                    </Badge>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      {pkg.items.length} items
                    </div>
                    {pkg.duration && (
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        {pkg.duration}
                      </div>
                    )}
                    {pkg.creator && (
                      <div className="flex items-center gap-1 mt-1">
                        <User className="h-3 w-3" />
                        Dr. {pkg.creator.firstName} {pkg.creator.lastName}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create/Edit Package Dialog */}
      <Dialog 
        open={showCreateDialog || editingPackage !== null} 
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setEditingPackage(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPackage ? 'Edit Package' : 'Create New Package'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Package Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Complete Acne Treatment Kit"
                />
              </div>
              <div>
                <Label htmlFor="subcategory">Subcategory</Label>
                <Select 
                  value={formData.subcategory} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, subcategory: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subcategory" />
                  </SelectTrigger>
                  <SelectContent>
                    {DERMATOLOGY_SUBCATEGORIES.map(sub => (
                      <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the package and its benefits"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="duration">Duration</Label>
                <Input
                  id="duration"
                  value={formData.duration}
                  onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
                  placeholder="e.g., 4 weeks"
                />
              </div>
              <div>
                <Label htmlFor="packagePrice">Package Price (₹)</Label>
                <Input
                  id="packagePrice"
                  type="number"
                  step="0.01"
                  value={formData.packagePrice}
                  onChange={(e) => setFormData(prev => ({ ...prev, packagePrice: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="instructions">Usage Instructions</Label>
              <Textarea
                id="instructions"
                value={formData.instructions}
                onChange={(e) => setFormData(prev => ({ ...prev, instructions: e.target.value }))}
                placeholder="How to use this package"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="indications">Indications</Label>
                <Textarea
                  id="indications"
                  value={formData.indications}
                  onChange={(e) => setFormData(prev => ({ ...prev, indications: e.target.value }))}
                  placeholder="What conditions this treats"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="contraindications">Contraindications</Label>
                <Textarea
                  id="contraindications"
                  value={formData.contraindications}
                  onChange={(e) => setFormData(prev => ({ ...prev, contraindications: e.target.value }))}
                  placeholder="When not to use"
                  rows={3}
                />
              </div>
            </div>

            {/* Package Items */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <Label>Package Items *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItemToPackage}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>
              
              <div className="space-y-4">
                {formData.items.map((item, index) => (
                  <Card key={index}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-4">
                        <h4 className="font-medium">Item {index + 1}</h4>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItemFromPackage(index)}
                          className="text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>Drug *</Label>
                          <Select
                            value={item.drugId}
                            onValueChange={(value) => updatePackageItem(index, 'drugId', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select drug" />
                            </SelectTrigger>
                            <SelectContent>
                              {drugs.map(drug => (
                                <SelectItem key={drug.id} value={drug.id}>
                                  {drug.name} - ₹{drug.price}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Quantity *</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updatePackageItem(index, 'quantity', parseInt(e.target.value) || 1)}
                          />
                        </div>
                        <div>
                          <Label>Dosage</Label>
                          <Input
                            value={item.dosage}
                            onChange={(e) => updatePackageItem(index, 'dosage', e.target.value)}
                            placeholder="e.g., Apply thin layer"
                          />
                        </div>
                        <div>
                          <Label>Frequency</Label>
                          <Input
                            value={item.frequency}
                            onChange={(e) => updatePackageItem(index, 'frequency', e.target.value)}
                            placeholder="e.g., Twice daily"
                          />
                        </div>
                        <div>
                          <Label>Duration</Label>
                          <Input
                            value={item.duration}
                            onChange={(e) => updatePackageItem(index, 'duration', e.target.value)}
                            placeholder="e.g., 4 weeks"
                          />
                        </div>
                        <div>
                          <Label>Instructions</Label>
                          <Input
                            value={item.instructions}
                            onChange={(e) => updatePackageItem(index, 'instructions', e.target.value)}
                            placeholder="Special instructions"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Pricing Summary */}
            {formData.items.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Pricing Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Original Price:</span>
                      <span>₹{calculateOriginalPrice().toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Package Price:</span>
                      <span>₹{formData.packagePrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-green-600">
                      <span>Savings:</span>
                      <span>₹{(calculateOriginalPrice() - formData.packagePrice).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-green-600">
                      <span>Discount:</span>
                      <span>
                        {calculateOriginalPrice() > 0 
                          ? (((calculateOriginalPrice() - formData.packagePrice) / calculateOriginalPrice()) * 100).toFixed(1)
                          : 0}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Public/Private Toggle */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isPublic"
                checked={formData.isPublic}
                onChange={(e) => setFormData(prev => ({ ...prev, isPublic: e.target.checked }))}
                className="rounded"
              />
              <Label htmlFor="isPublic">Make this package public (visible to all doctors)</Label>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  setEditingPackage(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={editingPackage ? handleUpdatePackage : handleCreatePackage}
                disabled={!formData.name || formData.items.length === 0}
              >
                {editingPackage ? 'Update Package' : 'Create Package'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Package Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedPackage?.name}</DialogTitle>
          </DialogHeader>
          
          {selectedPackage && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Package Details</h4>
                  <div className="space-y-2 text-sm">
                    <div><strong>Category:</strong> {selectedPackage.category}</div>
                    <div><strong>Subcategory:</strong> {selectedPackage.subcategory}</div>
                    <div><strong>Duration:</strong> {selectedPackage.duration}</div>
                    <div><strong>Status:</strong> {selectedPackage.isPublic ? 'Public' : 'Private'}</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Pricing</h4>
                  <div className="space-y-2 text-sm">
                    <div><strong>Original Price:</strong> ₹{selectedPackage.originalPrice.toFixed(2)}</div>
                    <div><strong>Package Price:</strong> ₹{selectedPackage.packagePrice.toFixed(2)}</div>
                    <div><strong>Discount:</strong> {selectedPackage.discountPercent.toFixed(1)}%</div>
                    <div><strong>Savings:</strong> ₹{(selectedPackage.originalPrice - selectedPackage.packagePrice).toFixed(2)}</div>
                  </div>
                </div>
              </div>

              {selectedPackage.description && (
                <div>
                  <h4 className="font-semibold mb-2">Description</h4>
                  <p className="text-sm text-muted-foreground">{selectedPackage.description}</p>
                </div>
              )}

              <div>
                <h4 className="font-semibold mb-2">Package Items</h4>
                <div className="space-y-3">
                  {selectedPackage.items
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((item, index) => (
                    <Card key={item.id}>
                      <CardContent className="p-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h5 className="font-medium">{item.drug.name}</h5>
                            <p className="text-sm text-muted-foreground">
                              {item.drug.manufacturerName} • {item.drug.packSizeLabel}
                            </p>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                              <div><strong>Quantity:</strong> {item.quantity}</div>
                              {item.dosage && <div><strong>Dosage:</strong> {item.dosage}</div>}
                              {item.frequency && <div><strong>Frequency:</strong> {item.frequency}</div>}
                              {item.duration && <div><strong>Duration:</strong> {item.duration}</div>}
                            </div>
                            {item.instructions && (
                              <p className="text-xs text-muted-foreground mt-1">
                                <strong>Instructions:</strong> {item.instructions}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">
                              ₹{(item.drug.price * item.quantity).toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              ₹{item.drug.price} × {item.quantity}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {selectedPackage.instructions && (
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Usage Instructions
                  </h4>
                  <p className="text-sm text-muted-foreground">{selectedPackage.instructions}</p>
                </div>
              )}

              {selectedPackage.indications && (
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-500" />
                    Indications
                  </h4>
                  <p className="text-sm text-muted-foreground">{selectedPackage.indications}</p>
                </div>
              )}

              {selectedPackage.contraindications && (
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    Contraindications
                  </h4>
                  <p className="text-sm text-muted-foreground">{selectedPackage.contraindications}</p>
                </div>
              )}

              {selectedPackage.creator && (
                <div>
                  <h4 className="font-semibold mb-2">Created By</h4>
                  <p className="text-sm text-muted-foreground">
                    Dr. {selectedPackage.creator.firstName} {selectedPackage.creator.lastName}
                    {selectedPackage.creator.department && ` • ${selectedPackage.creator.department}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Created on {new Date(selectedPackage.createdAt).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
} 