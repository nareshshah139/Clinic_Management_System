'use client';

import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';
import { formatPatientName } from '@/lib/utils';
import type { Patient } from '@/lib/types';

interface PatientSearchFieldProps {
  onSelect: (patient: Patient) => void;
  onAddNew: (query: string) => void;
}

export default function PatientSearchField({ onSelect, onAddNew }: PatientSearchFieldProps) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Patient[] | null>(null);
  const latestRequest = useRef(0);

  const search = async (q: string) => {
    setQuery(q);
    const request = ++latestRequest.current;
    if (!q.trim()) {
      setMatches(null);
      return;
    }
    try {
      const res = await apiClient.getPatients({ search: q.trim(), limit: 10 });
      if (request === latestRequest.current) setMatches(res.data || res.patients || []);
    } catch {
      if (request === latestRequest.current) setMatches([]);
    }
  };

  return (
    <div className="space-y-2">
      <label htmlFor="booking-patient-search" className="text-sm font-medium text-gray-700">Patient</label>
      <Input
        id="booking-patient-search"
        autoFocus
        autoComplete="off"
        placeholder="Search patient by name or phone"
        value={query}
        onChange={(e) => void search(e.target.value)}
      />
      {matches && matches.length > 0 && (
        <div role="listbox" aria-label="Matching patients" className="max-h-48 overflow-auto rounded border">
          {matches.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={false}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
              onClick={() => onSelect(p)}
            >
              {formatPatientName(p)} — {p.phone}
            </button>
          ))}
        </div>
      )}
      {matches && query.trim() && (
        <div className="flex items-center justify-between gap-2 text-sm text-gray-600">
          <span>{matches.length === 0 ? 'No matching patients.' : 'Not in the list?'}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => onAddNew(query.trim())}>
            Add new patient
          </Button>
        </div>
      )}
    </div>
  );
}
