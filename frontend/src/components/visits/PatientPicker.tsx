'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { apiClient } from '@/lib/api';
import { formatPatientName } from '@/lib/utils';
import { visitIdentity } from '@/lib/visit-identity';
import type { GetPatientsResponse, Patient } from '@/lib/types';

export type PatientMatch = Patient & { name?: string };

interface PatientPickerProps {
  selectedPatientId: string;
  selectedLabel?: string;
  onSelect: (patient: PatientMatch) => void;
  onClear: () => void;
}

const SEPARATOR = ' · ';

function extractPatients(payload: unknown): PatientMatch[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as PatientMatch[];
  if (typeof payload === 'object') {
    const data = payload as Partial<GetPatientsResponse> & { data?: PatientMatch[] };
    if (Array.isArray(data.patients)) return data.patients as PatientMatch[];
    if (Array.isArray(data.data)) return data.data as PatientMatch[];
  }
  return [];
}

function detailLine(patient: PatientMatch): string {
  const identity = visitIdentity(patient, null, null);
  return [identity.age !== null ? String(identity.age) : null, identity.sex, patient.phone || patient.email]
    .filter(Boolean)
    .join(SEPARATOR);
}

export default function PatientPicker({ selectedPatientId, selectedLabel, onSelect, onClear }: PatientPickerProps) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; options: PatientMatch[] } | null>(null);
  const [failedQuery, setFailedQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const typing = useRef(false);
  const chosenLabel = useRef('');
  const rowsReady = results?.query === query;
  const failed = !rowsReady && failedQuery === query;
  const visibleOptions = rowsReady ? results.options : [];

  useEffect(() => {
    if (!selectedPatientId) {
      chosenLabel.current = '';
      return;
    }
    if (selectedLabel && !typing.current) {
      chosenLabel.current = selectedLabel;
      setQuery(selectedLabel);
    }
  }, [selectedPatientId, selectedLabel]);

  useEffect(() => {
    if (!open || rowsReady) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const options = extractPatients(await apiClient.getPatients({ search: query || undefined, limit: 10 }));
        if (cancelled) return;
        setResults({ query, options });
        setFailedQuery(null);
      } catch {
        if (!cancelled) setFailedQuery(query);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, rowsReady]);

  const close = useCallback(() => {
    setOpen(false);
    setHighlight(-1);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  const choose = (patient: PatientMatch) => {
    const label = formatPatientName(patient);
    typing.current = false;
    chosenLabel.current = label;
    setQuery(label);
    close();
    onSelect(patient);
  };

  const onChange = (value: string) => {
    typing.current = true;
    setQuery(value);
    setOpen(true);
    setHighlight(-1);
    if (selectedPatientId && value !== chosenLabel.current) onClear();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlight(visibleOptions.length ? 0 : -1);
        return;
      }
      const max = visibleOptions.length;
      if (!max) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setHighlight((i) => (i < 0 ? (step === 1 ? 0 : max - 1) : Math.min(max - 1, Math.max(0, i + step))));
    } else if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      const picked = highlight >= 0 ? visibleOptions[highlight] : visibleOptions.length === 1 ? visibleOptions[0] : undefined;
      if (picked) choose(picked);
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        close();
      }
    }
  };

  const activeId = open && highlight >= 0 && visibleOptions[highlight] ? `${listId}-${highlight}` : undefined;

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) close();
      }}
    >
      <label htmlFor={inputId} className="text-sm font-medium text-gray-700 mb-2 block">
        Select Patient
      </label>
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        className="w-full border rounded-md px-3 py-2 text-sm"
        placeholder="Search name, phone, or email"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Patients"
          className="absolute z-20 mt-1 w-full bg-white border rounded-md shadow-sm max-h-64 overflow-auto"
        >
          {!rowsReady && !failed && <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>}
          {failed && (
            <div className="px-3 py-2 text-xs text-red-600">Couldn&apos;t search patients. Try again.</div>
          )}
          {rowsReady && visibleOptions.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">No results</div>
          )}
          {visibleOptions.map((p, idx) => {
            const detail = detailLine(p);
            return (
              <div
                key={p.id}
                id={`${listId}-${idx}`}
                role="option"
                aria-selected={idx === highlight}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => choose(p)}
                className={`cursor-pointer px-3 py-2 text-sm ${p.id === selectedPatientId ? 'bg-gray-50' : ''} ${idx === highlight ? 'bg-blue-50' : ''}`}
              >
                <div className="font-medium break-words">{formatPatientName(p)}</div>
                {detail && <div className="text-xs text-gray-500 break-words">{detail}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
