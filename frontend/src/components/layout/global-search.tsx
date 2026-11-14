'use client';

import { useEffect, useId, useRef, useState, type ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Search, User, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { apiClient } from '@/lib/api';
import { displayUtcDate } from '@/lib/date-display';
import { formatAge } from '@/lib/utils';

interface SearchResult {
  id: string;
  type: 'patient' | 'appointment' | 'user';
  title: string;
  subtitle?: string;
  description?: string;
  icon: ComponentType<{ className?: string }>;
  href: string;
}

const TYPE_LABEL: Record<SearchResult['type'], string> = { patient: 'Patient', appointment: 'Appointment', user: 'Staff' };
const TYPE_TINT: Record<SearchResult['type'], string> = {
  patient: 'bg-info-soft text-info-text',
  appointment: 'bg-success-soft text-success-text',
  user: 'bg-highlight-soft text-highlight-text',
};

async function searchEverything(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    const patientRes: any = await apiClient.getPatients({ search: query, limit: 5 });
    for (const patient of patientRes.data || patientRes.patients || []) {
      results.push({
        id: patient.id,
        type: 'patient',
        title: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || patient.name || 'Unknown Patient',
        subtitle: patient.phone || patient.email,
        description: `Patient • ${patient.gender || 'Unknown'} • ${formatAge(patient)}`,
        icon: Users,
        href: `/dashboard/patients?search=${encodeURIComponent(patient.id)}`,
      });
    }
  } catch (e) {
    console.error('Failed to search patients', e);
  }
  try {
    const appointmentRes: any = await apiClient.getAppointments({ search: query, limit: 5, sortBy: 'date', sortOrder: 'desc' });
    for (const appointment of appointmentRes.appointments || appointmentRes.data || []) {
      const patientName = appointment.patient?.name || `${appointment.patient?.firstName || ''} ${appointment.patient?.lastName || ''}`.trim() || 'Unknown Patient';
      const doctorName = appointment.doctor ? `${appointment.doctor.firstName || ''} ${appointment.doctor.lastName || ''}`.trim() : 'Unknown Doctor';
      results.push({
        id: appointment.id,
        type: 'appointment',
        title: `${patientName} - ${appointment.slot}`,
        subtitle: `Dr. ${doctorName}`,
        description: `Appointment • ${displayUtcDate(appointment.date)} • ${appointment.visitType || 'OPD'}`,
        icon: Calendar,
        href: `/dashboard/appointments`,
      });
    }
  } catch (e) {
    console.error('Failed to search appointments', e);
  }
  try {
    const userRes: any = await apiClient.getUsers({ search: query, limit: 3 });
    for (const user of userRes.users || userRes.data || []) {
      results.push({
        id: user.id,
        type: 'user',
        title: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || 'Unknown User',
        subtitle: user.email,
        description: `${user.role || 'User'} • ${user.specialization || 'General'}`,
        icon: User,
        href: `/dashboard/users?search=${encodeURIComponent(user.id)}`,
      });
    }
  } catch (e) {
    console.error('Failed to search users', e);
  }
  return results;
}

/**
 * @cc [owner:nareshshah139,label:product] search-dismissal
 * Escape within global search MUST dismiss results without clearing the query.
 * Pending responses MUST NOT reopen dismissed results; editing or focusing a
 * query of at least two non-whitespace characters may reopen them.
 */
/**
 * @cc [owner:nareshshah139,label:accessibility] search-results-listbox
 * Global search is a combobox whose results are options in a listbox. Arrow keys
 * move the active option without leaving the input, Enter opens the active
 * option (the first one when none is active), and clicking an option opens it.
 */
export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;
  const listShown = open && results.length > 0;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const delayed = setTimeout(async () => {
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        setResults([]);
        setOpen(false);
        setSearching(false);
        return;
      }
      setSearching(true);
      const found = await searchEverything(trimmed);
      setResults(found);
      setActiveIndex(-1);
      setSearching(false);
    }, 300);
    return () => clearTimeout(delayed);
  }, [query]);

  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${listId}-option-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, listId]);

  const openResult = (result: SearchResult) => {
    setOpen(false);
    setQuery('');
    router.push(result.href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (results.length > 0) openResult(results[activeIndex >= 0 ? activeIndex : 0]);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (results.length === 0) return;
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const from = listShown ? activeIndex : -1;
    setOpen(true);
    setActiveIndex(from < 0 ? (step > 0 ? 0 : results.length - 1) : (from + step + results.length) % results.length);
  };

  return (
    <div className="flex-1 max-w-md relative" ref={rootRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input
          type="text"
          role="combobox"
          aria-label="Search patients, appointments, doctors"
          aria-autocomplete="list"
          aria-expanded={listShown}
          aria-controls={listId}
          aria-activedescendant={listShown && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          placeholder="Search patients, appointments, doctors..."
          className="pl-10 pr-4 py-2 w-full"
          value={query}
          onChange={(e) => {
            const hasQuery = e.target.value.trim().length >= 2;
            setQuery(e.target.value);
            setOpen(hasQuery);
            setSearching(hasQuery);
          }}
          onFocus={() => setOpen(query.trim().length >= 2)}
          onKeyDown={onKeyDown}
        />
        {searching && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <Spinner className="h-4 w-4" />
          </div>
        )}
      </div>

      {listShown && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
          <ul id={listId} role="listbox" aria-label="Search results" className="max-h-96 overflow-y-auto">
            {results.map((result, index) => {
              const IconComponent = result.icon;
              return (
                <li
                  key={`${result.type}-${result.id}-${index}`}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  className="flex items-center gap-3 p-3 hover:bg-accent aria-selected:bg-muted cursor-pointer border-b border-border last:border-b-0"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => openResult(result)}
                >
                  <div className="flex-shrink-0">
                    <div className={`p-2 rounded-lg ${TYPE_TINT[result.type]}`}>
                      <IconComponent className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                    {result.subtitle && <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>}
                    {result.description && <p className="text-xs text-muted-foreground truncate">{result.description}</p>}
                  </div>
                  <div className="flex-shrink-0">
                    <Badge variant="outline" className="text-xs">{TYPE_LABEL[result.type]}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="p-3 bg-muted border-t text-xs text-muted-foreground text-center">
            ↑ ↓ to choose, Enter to open, Esc to close
          </p>
        </div>
      )}

      {open && results.length === 0 && query.length >= 2 && !searching && (
        <Card className="absolute top-full left-0 right-0 mt-1 z-50 shadow-sm">
          <CardContent className="p-4 text-center" role="status">
            <p className="text-sm text-muted-foreground">No results found for &quot;{query}&quot;</p>
            <p className="text-xs text-muted-foreground mt-1">Try searching for patient names, phone numbers, or doctor names</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
