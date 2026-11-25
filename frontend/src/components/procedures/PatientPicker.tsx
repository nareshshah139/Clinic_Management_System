'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';
import type { Patient } from '@/lib/types';
import { useDebouncedPatientSearch } from '@/components/appointments/useDebouncedPatientSearch';
import type { PatientRef } from './procedure-record';

const patientName = (p: Patient) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ');

type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'done'; matches: Patient[] }
  | { status: 'error' };

interface PatientPickerProps {
  id: string;
  label: string;
  value: PatientRef | null;
  onChange: (patient: PatientRef | null) => void;
  clearLabel: string;
  locked?: boolean;
}

export function PatientPicker({ id, label, value, onChange, clearLabel, locked = false }: PatientPickerProps) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });

  const { schedule, cancel } = useDebouncedPatientSearch(async (q, isCurrent) => {
    try {
      const res = await apiClient.getPatients({ search: q, limit: 10 });
      if (isCurrent()) setSearch({ status: 'done', matches: res.data ?? res.patients ?? [] });
    } catch {
      if (isCurrent()) setSearch({ status: 'error' });
    }
  });

  const onQuery = (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      cancel();
      setSearch({ status: 'idle' });
      return;
    }
    setSearch({ status: 'searching' });
    schedule(q.trim());
  };

  const choose = (patient: Patient) => {
    cancel();
    setQuery('');
    setSearch({ status: 'idle' });
    onChange({ id: patient.id, name: patientName(patient) });
  };

  if (value) {
    return (
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <div className="mt-1 flex h-9 items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 text-sm">
          <span className="truncate font-medium">{value.name}</span>
          {!locked && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              {clearLabel}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      <Input
        id={id}
        type="search"
        autoComplete="off"
        placeholder="Search by name, phone or code"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      {search.status === 'searching' && <p className="mt-1 text-xs text-muted-foreground" role="status">Searching…</p>}
      {search.status === 'error' && <p className="mt-1 text-xs text-destructive" role="alert">Could not search patients. Try again.</p>}
      {search.status === 'done' && search.matches.length === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">No patients match “{query.trim()}”.</p>
      )}
      {search.status === 'done' && search.matches.length > 0 && (
        <ul aria-label={`${label} matches`} className="mt-1 max-h-48 overflow-auto rounded-md border border-border">
          {search.matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => choose(p)}
              >
                <span className="font-medium">{patientName(p)}</span>
                {(p.patientCode || p.phone) && (
                  <span className="ml-2 text-xs text-muted-foreground">{[p.patientCode, p.phone].filter(Boolean).join(' · ')}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
