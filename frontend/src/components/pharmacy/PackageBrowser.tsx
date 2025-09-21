'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Package, 
  Search, 
  Eye, 
  DollarSign,
  Clock,
  User,
  AlertTriangle,
  CheckCircle,
  Pill,
  Plus
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

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
    drug: {
      id: string;
      name: string;
      price: number;
      manufacturerName: string;
      packSizeLabel: string;
      category?: string;
      dosageForm?: string;
      strength?: string;
    };
  }[];
}

interface PackageBrowserProps {
  onSelectPackage?: (pkg: PharmacyPackage) => void;
}

export function PackageBrowser({ onSelectPackage, reloadKey }: PackageBrowserProps & { reloadKey?: string }) {
  const [packages, setPackages] = useState<PharmacyPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPackage, setSelectedPackage] = useState<PharmacyPackage | null>(null);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadPackages();
  }, [reloadKey]);

  const loadPackages = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/pharmacy/packages', {
        category: 'Dermatology',
        limit: 50
      });
      if (response && Array.isArray((response as any).packages)) {
        setPackages((response as any).packages);
      } else {
        console.warn('Invalid packages response format:', response);
        setPackages([]);
      }
    } catch (error) {
      console.error('Error loading packages:', error);
      setPackages([]);
      toast({
        title: "Error",
        description: "Failed to load pharmacy packages. Make sure the backend server is running.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredPackages = packages.filter(pkg => {
    const matchesSearch = !searchQuery || 
      pkg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pkg.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pkg.indications?.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesSearch && pkg.isActive;
  });

  const handleSelectPackage = (pkg: PharmacyPackage) => {
    if (onSelectPackage) {
      onSelectPackage(pkg);
      toast({
        title: "Package Added",
        description: `${pkg.name} has been added to the invoice`,
      });
    }
  };

  const handleViewPackage = (pkg: PharmacyPackage) => {
    setSelectedPackage(pkg);
    setShowViewDialog(true);
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div>
        <Label htmlFor="packageSearch">Search Treatment Packages</Label>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="packageSearch"
            placeholder="Search packages by name or condition..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* Packages Grid */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Loading packages...</p>
          </div>
        </div>
      ) : filteredPackages.length === 0 ? (
        <div className="text-center py-8">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {searchQuery ? 'No packages found' : 'No packages available'}
          </h3>
          <p className="text-muted-foreground">
            {searchQuery 
              ? 'Try adjusting your search terms' 
              : 'Check if the backend server is running and packages are populated'}
          </p>
          <Button 
            variant="outline" 
            onClick={loadPackages} 
            className="mt-4"
          >
            Retry Loading
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPackages.map((pkg) => (
            <Card key={pkg.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{pkg.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {pkg.description}
                    </CardDescription>
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
                      <Pill className="h-3 w-3" />
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

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewPackage(pkg)}
                      className="flex-1"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                    {onSelectPackage && (
                      <Button
                        size="sm"
                        onClick={() => handleSelectPackage(pkg)}
                        className="flex-1"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add to Invoice
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Package Details Dialog */}
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
                <h4 className="font-semibold mb-2">Package Contents</h4>
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

              {onSelectPackage && (
                <div className="pt-4 border-t">
                  <Button 
                    onClick={() => {
                      handleSelectPackage(selectedPackage);
                      setShowViewDialog(false);
                    }}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Package to Invoice
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
} 