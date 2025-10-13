'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Trash2 } from 'lucide-react';

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

interface PackageItemDraft {
  drug?: Drug;
  drugId?: string;
  quantity: number;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

interface PharmacyPackageCreatorProps {
  onCreated?: () => void;
  onCancel?: () => void;
}

export function PharmacyPackageCreator({ onCreated, onCancel }: PharmacyPackageCreatorProps) {
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Dermatology');
  const [subcategory, setSubcategory] = useState<string | undefined>(undefined);
  const [packagePrice, setPackagePrice] = useState<number>(0);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [duration, setDuration] = useState('');
  const [instructions, setInstructions] = useState('');
  const [indications, setIndications] = useState('');
  const [contraindications, setContraindications] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [items, setItems] = useState<PackageItemDraft[]>([]);

  const [drugQuery, setDrugQuery] = useState('');
  const [drugResults, setDrugResults] = useState<Drug[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Search drugs (debounced)
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!drugQuery.trim()) {
        setDrugResults([]);
        return;
      }
      try {
        setSearching(true);
        const res: any = await apiClient.get('/drugs', { search: drugQuery, limit: 10, isActive: true });
        const list: Drug[] = Array.isArray(res?.data) ? res.data : [];
        setDrugResults(list);
      } catch (e) {
        setDrugResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [drugQuery]);

  const originalPrice = useMemo(() => {
    return items.reduce((sum, it) => sum + (it.drug?.price || 0) * (it.quantity || 0), 0);
  }, [items]);

  const computedDiscount = useMemo(() => {
    if (originalPrice <= 0 || packagePrice <= 0) return 0;
    if (packagePrice >= originalPrice) return 0;
    return ((originalPrice - packagePrice) / originalPrice) * 100;
  }, [originalPrice, packagePrice]);

  const addItem = (drug: Drug) => {
    setItems(prev => [...prev, { drug, drugId: drug.id, quantity: 1 }]);
    setDrugQuery('');
    setDrugResults([]);
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, patch: Partial<PackageItemDraft>) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const canSubmit = name.trim().length > 2 && packagePrice > 0 && items.length > 0;

  const submit = async () => {
    if (!canSubmit) {
      toast({ title: 'Missing details', description: 'Add a name, price, and at least one drug.', variant: 'destructive' });
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        name: name.trim(),
        description: description || undefined,
        category,
        subcategory: subcategory || undefined,
        packagePrice,
        discountPercent: discountPercent || 0,
        duration: duration || undefined,
        instructions: instructions || undefined,
        indications: indications || undefined,
        contraindications: contraindications || undefined,
        isPublic,
        items: items.map((it, index) => ({
          drugId: it.drugId as string,
          quantity: Math.max(1, it.quantity || 1),
          dosage: it.dosage || undefined,
          frequency: it.frequency || undefined,
          duration: it.duration || undefined,
          instructions: it.instructions || undefined,
          sequence: index + 1,
        })),
      };

      await apiClient.post('/pharmacy/packages', payload);
      toast({ title: 'Package created', description: `${name} created successfully.` });
      if (typeof window !== 'undefined') {
        const ev = new CustomEvent('pharmacy-dashboard-refresh');
        window.dispatchEvent(ev);
      }
      if (onCreated) onCreated();
    } catch (e: any) {
      toast({ title: 'Failed to create', description: e?.message || 'Error creating package', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Complete Acne Treatment Kit" />
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Dermatology">Dermatology</SelectItem>
              <SelectItem value="General">General</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Subcategory (optional)</Label>
          <Input value={subcategory || ''} onChange={(e) => setSubcategory(e.target.value || undefined)} placeholder="e.g. Acne Treatment" />
        </div>
        <div className="space-y-2">
          <Label>Package Price (₹)</Label>
          <Input type="number" value={packagePrice} onChange={(e) => setPackagePrice(parseFloat(e.target.value) || 0)} min={0} />
        </div>
        <div className="space-y-2">
          <Label>Discount % (optional)</Label>
          <Input type="number" value={discountPercent} onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)} min={0} max={100} />
        </div>
        <div className="space-y-2">
          <Label>Duration (optional)</Label>
          <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 8 weeks" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Description (optional)</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Indications (optional)</Label>
          <Textarea value={indications} onChange={(e) => setIndications(e.target.value)} rows={2} />
        </div>
        <div className="space-y-2">
          <Label>Contraindications (optional)</Label>
          <Textarea value={contraindications} onChange={(e) => setContraindications(e.target.value)} rows={2} />
        </div>
      </div>

      {/* Drug search and selection */}
      <div className="space-y-3">
        <Label>Add drugs</Label>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search drugs by name or ingredient..." value={drugQuery} onChange={(e) => setDrugQuery(e.target.value)} />
        </div>
        {drugResults.length > 0 && (
          <div className="max-h-48 overflow-auto border rounded-md p-2">
            {drugResults.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-1" onDoubleClick={() => addItem(d)}>
                <div className="text-sm">
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-muted-foreground">₹{d.price} • {d.manufacturerName} • {d.packSizeLabel}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => addItem(d)}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Items table */}
      {items.length > 0 && (
        <Card>
          <CardContent className="p-3 space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
                <div className="text-sm">
                  <div className="font-medium">{it.drug?.name}</div>
                  <div className="text-xs text-muted-foreground">₹{it.drug?.price} • {it.drug?.manufacturerName}</div>
                </div>
                <div>
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" min={1} value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Math.max(1, parseInt(e.target.value || '1', 10)) })} />
                </div>
                <div>
                  <Label className="text-xs">Dosage</Label>
                  <Input value={it.dosage || ''} onChange={(e) => updateItem(idx, { dosage: e.target.value })} placeholder="e.g. Apply at night" />
                </div>
                <div>
                  <Label className="text-xs">Frequency</Label>
                  <Input value={it.frequency || ''} onChange={(e) => updateItem(idx, { frequency: e.target.value })} placeholder="e.g. Once daily" />
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Duration</Label>
                    <Input value={it.duration || ''} onChange={(e) => updateItem(idx, { duration: e.target.value })} placeholder="e.g. 4 weeks" />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} title="Remove">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Price summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Original price (auto)</Label>
          <Input value={originalPrice.toFixed(2)} disabled />
        </div>
        <div>
          <Label>Computed discount %</Label>
          <Input value={computedDiscount.toFixed(2)} disabled />
        </div>
        <div className="flex items-end justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? 'Creating…' : 'Create Package'}
          </Button>
        </div>
      </div>
    </div>
  );
} 