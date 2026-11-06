import React, { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';

export interface ClinicInvestigation {
  id: string;
  name: string;
}

type Toast = (options: { variant?: 'destructive'; title: string; description?: string }) => unknown;

export const tidyInvestigationName = (raw: string) => raw.trim().replace(/\s+/g, ' ');

export const sameInvestigation = (a: string, b: string) => tidyInvestigationName(a).toLowerCase() === tidyInvestigationName(b).toLowerCase();

export const hasInvestigation = (options: readonly string[], name: string) => options.some((option) => sameInvestigation(option, name));

export function mergeInvestigationOptions(defaults: readonly string[], ...groups: ReadonlyArray<readonly string[]>): string[] {
  const merged: string[] = [];
  for (const name of [...defaults, ...groups.flat()]) {
    if (!hasInvestigation(merged, name)) merged.push(name);
  }
  return merged;
}

export function useClinicInvestigations(toast: Toast) {
  const [saved, setSaved] = useState<ClinicInvestigation[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(apiClient.getClinicInvestigations?.())
      .then((rows) => {
        if (!cancelled && Array.isArray(rows)) setSaved((added) => [...rows, ...added.filter((entry) => !rows.some((row) => row.id === entry.id))]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const add = useCallback(async (name: string): Promise<{ name: string; savedToClinic: boolean }> => {
    try {
      const row = await apiClient.createClinicInvestigation({ name });
      if (!row?.id || !row.name) throw new Error('Unexpected response');
      setSaved((prev) => (prev.some((entry) => entry.id === row.id) ? prev : [...prev, row]));
      return { name: row.name, savedToClinic: true };
    } catch {
      toast({ variant: 'destructive', title: 'Not saved to clinic list', description: `"${name}" was added to this prescription only. It could not be saved to the clinic list.` });
      return { name, savedToClinic: false };
    }
  }, [toast]);

  const rename = useCallback(async (entry: ClinicInvestigation, name: string): Promise<ClinicInvestigation | null> => {
    try {
      const row = await apiClient.renameClinicInvestigation(entry.id, name);
      setSaved((prev) => prev.map((existing) => (existing.id === entry.id ? row : existing)));
      return row;
    } catch (error) {
      const conflict = (error as { status?: number })?.status === 409;
      toast({ variant: 'destructive', title: 'Could not rename investigation', description: conflict ? 'An investigation with that name already exists' : getErrorMessage(error) });
      return null;
    }
  }, [toast]);

  const remove = useCallback(async (entry: ClinicInvestigation): Promise<boolean> => {
    try {
      await apiClient.deleteClinicInvestigation(entry.id);
      setSaved((prev) => prev.filter((existing) => existing.id !== entry.id));
      return true;
    } catch (error) {
      toast({ variant: 'destructive', title: 'Could not remove investigation', description: getErrorMessage(error) });
      return false;
    }
  }, [toast]);

  return { saved, add, rename, remove };
}

interface ManageProps {
  saved: ClinicInvestigation[];
  onRename: (entry: ClinicInvestigation, name: string) => Promise<ClinicInvestigation | null>;
  onRemove: (entry: ClinicInvestigation) => Promise<boolean>;
}

export function ManageClinicInvestigations({ saved, onRename, onRemove }: ManageProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const save = async (entry: ClinicInvestigation) => {
    const name = tidyInvestigationName(draft);
    if (!name) return;
    if (name === entry.name || (await onRename(entry, name))) setEditingId(null);
  };

  return (
    <div className="pt-2 border-t space-y-2">
      <Button type="button" size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        Manage saved investigations
      </Button>
      {open && (
        saved.length === 0 ? (
          <p className="text-xs text-gray-600">No investigations saved to the clinic list yet.</p>
        ) : (
          <ul className="space-y-1" aria-label="Saved investigations">
            {saved.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 text-sm">
                {editingId === entry.id ? (
                  <>
                    <Input
                      aria-label={`New name for ${entry.name}`}
                      value={draft}
                      maxLength={100}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void save(entry);
                        }
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                    <Button type="button" size="sm" variant="outline" aria-label={`Save new name for ${entry.name}`} disabled={!tidyInvestigationName(draft)} onClick={() => void save(entry)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" aria-label={`Cancel renaming ${entry.name}`} onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : confirmingId === entry.id ? (
                  <>
                    <span className="flex-1">Remove {entry.name} for everyone in the clinic?</span>
                    <Button type="button" size="sm" variant="destructive" aria-label={`Confirm removing ${entry.name}`} onClick={() => { setConfirmingId(null); void onRemove(entry); }}>
                      Remove
                    </Button>
                    <Button type="button" size="sm" variant="ghost" aria-label={`Keep ${entry.name}`} onClick={() => setConfirmingId(null)}>
                      Keep
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1">{entry.name}</span>
                    <Button type="button" size="sm" variant="ghost" aria-label={`Rename ${entry.name}`} onClick={() => { setEditingId(entry.id); setDraft(entry.name); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${entry.name}`} onClick={() => setConfirmingId(entry.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
