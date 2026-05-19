'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  Loader2,
  PackagePlus,
  Pill,
  Save,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type DrugSearchResult = {
  id: string;
  name: string;
  price: number;
  manufacturerName: string;
  packSizeLabel: string;
  composition1?: string | null;
  composition2?: string | null;
  category?: string | null;
  dosageForm?: string | null;
  strength?: string | null;
  isActive?: boolean;
};

type DrugDetail = DrugSearchResult & {
  inventoryItems?: Array<{
    id: string;
    currentStock: number;
    minStockLevel?: number | null;
    maxStockLevel?: number | null;
    storageLocation?: string | null;
    expiryDate?: string | null;
  }>;
};

type QuickUpdateForm = {
  price: string;
  manufacturerName: string;
  packSizeLabel: string;
  composition1: string;
  category: string;
  dosageForm: string;
  strength: string;
  stockAdjustment: string;
};

export function MedicineQuickUpdate() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DrugSearchResult[]>([]);
  const [selected, setSelected] = useState<DrugDetail | null>(null);
  const [form, setForm] = useState<QuickUpdateForm>({
    price: '',
    manufacturerName: '',
    packSizeLabel: '',
    composition1: '',
    category: '',
    dosageForm: '',
    strength: '',
    stockAdjustment: '',
  });
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        setLoadingSearch(true);
        const response = await apiClient.get<{
          data?: DrugSearchResult[];
        }>('/drugs', {
          search: trimmed,
          limit: 6,
          page: 1,
          isActive: true,
        });
        setResults(response.data || []);
      } catch (error) {
        console.error('Failed to search medicines:', error);
        setResults([]);
      } finally {
        setLoadingSearch(false);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [query]);

  const inventoryItem = selected?.inventoryItems?.[0] || null;
  const canSave = useMemo(() => {
    if (!selected) return false;
    return [
      form.manufacturerName,
      form.packSizeLabel,
      form.composition1,
      form.category,
      form.dosageForm,
      form.strength,
    ].every((value) => value.trim().length > 0);
  }, [form, selected]);

  const selectMedicine = async (drug: DrugSearchResult) => {
    try {
      const detail = await apiClient.get<DrugDetail>(`/drugs/${drug.id}`);
      setSelected(detail);
      setQuery(detail.name);
      setResults([]);
      setForm({
        price: String(detail.price ?? 0),
        manufacturerName: detail.manufacturerName || '',
        packSizeLabel: detail.packSizeLabel || '',
        composition1: detail.composition1 || '',
        category: detail.category || '',
        dosageForm: detail.dosageForm || '',
        strength: detail.strength || '',
        stockAdjustment: '',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Unable to load medicine',
        description: getErrorMessage(error),
      });
    }
  };

  const saveChanges = async () => {
    if (!selected || !canSave) {
      toast({
        variant: 'destructive',
        title: 'Missing product fields',
        description: 'Fill manufacturer, pack size, composition, category, form, and strength before saving.',
      });
      return;
    }

    const parsedAdjustment = Number(form.stockAdjustment || 0);
    if (form.stockAdjustment && !Number.isFinite(parsedAdjustment)) {
      toast({
        variant: 'destructive',
        title: 'Invalid stock adjustment',
        description: 'Use a positive or negative number for stock adjustment.',
      });
      return;
    }

    try {
      setSaving(true);
      const updated = await apiClient.patch<DrugDetail>(`/drugs/${selected.id}`, {
        name: selected.name,
        price: Number(form.price || 0),
        manufacturerName: form.manufacturerName.trim(),
        packSizeLabel: form.packSizeLabel.trim(),
        composition1: form.composition1.trim(),
        category: form.category.trim(),
        dosageForm: form.dosageForm.trim(),
        strength: form.strength.trim(),
      });

      if (parsedAdjustment !== 0) {
        if (!inventoryItem?.id) {
          throw new Error('This medicine has no inventory item for stock adjustment.');
        }
        await apiClient.adjustStock({
          itemId: inventoryItem.id,
          adjustmentQuantity: parsedAdjustment,
          reason: 'Single medicine quick update',
          notes: `Quick stock correction from pharmacy desk for ${selected.name}`,
        });
      }

      const refreshed = await apiClient.get<DrugDetail>(`/drugs/${updated.id}`);
      setSelected(refreshed);
      setForm((current) => ({ ...current, stockAdjustment: '' }));
      window.dispatchEvent(new CustomEvent('pharmacy-dashboard-refresh'));
      toast({
        title: 'Medicine updated',
        description: `${refreshed.name} is ready for billing and fulfilment.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: getErrorMessage(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="overflow-hidden rounded-[8px] border-slate-200 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Pill className="h-5 w-5 text-slate-800" />
              Single Medicine Update
            </CardTitle>
            <CardDescription>
              Search once, correct price or master fields, and adjust stock if needed.
            </CardDescription>
          </div>
          <Badge variant="outline" className="bg-slate-50">
            HITL
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search medicine by name, maker, or composition"
            className="pl-9"
          />
          {loadingSearch && (
            <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-slate-400" />
          )}
          {results.length > 0 && (
            <div className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-[8px] border border-slate-200 bg-white shadow-xl">
              {results.map((drug) => (
                <button
                  key={drug.id}
                  type="button"
                  onClick={() => void selectMedicine(drug)}
                  className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-b-0 hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-950">
                      {drug.name}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {drug.manufacturerName} · {drug.packSizeLabel}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-slate-900">
                    ₹{Number(drug.price || 0).toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selected ? (
          <div className="space-y-4">
            <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">{selected.name}</p>
                  <p className="text-xs text-slate-500">
                    Current stock: {inventoryItem ? inventoryItem.currentStock : 'No inventory item'}
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Price">
                <Input
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                />
              </Field>
              <Field label="Stock + / -">
                <Input
                  type="number"
                  value={form.stockAdjustment}
                  onChange={(event) => setForm((current) => ({ ...current, stockAdjustment: event.target.value }))}
                  placeholder="0"
                />
              </Field>
              <Field label="Manufacturer">
                <Input
                  value={form.manufacturerName}
                  onChange={(event) => setForm((current) => ({ ...current, manufacturerName: event.target.value }))}
                />
              </Field>
              <Field label="Pack size">
                <Input
                  value={form.packSizeLabel}
                  onChange={(event) => setForm((current) => ({ ...current, packSizeLabel: event.target.value }))}
                />
              </Field>
              <Field label="Composition">
                <Input
                  value={form.composition1}
                  onChange={(event) => setForm((current) => ({ ...current, composition1: event.target.value }))}
                />
              </Field>
              <Field label="Strength">
                <Input
                  value={form.strength}
                  onChange={(event) => setForm((current) => ({ ...current, strength: event.target.value }))}
                />
              </Field>
              <Field label="Category">
                <Input
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                />
              </Field>
              <Field label="Dosage form">
                <Input
                  value={form.dosageForm}
                  onChange={(event) => setForm((current) => ({ ...current, dosageForm: event.target.value }))}
                />
              </Field>
            </div>

            <Button
              type="button"
              className="w-full"
              disabled={!canSave || saving}
              onClick={() => void saveChanges()}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save medicine update
            </Button>
          </div>
        ) : (
          <div className="rounded-[8px] border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
            <PackagePlus className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-2 text-sm font-medium text-slate-900">No medicine selected</p>
            <p className="mt-1 text-xs text-slate-500">
              Pick one medicine to update without opening the full drug database.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-slate-600">{label}</Label>
      {children}
    </div>
  );
}
