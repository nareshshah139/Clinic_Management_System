'use client';

import { useEffect, useId, useRef, useState, type ComponentType } from 'react';
import { UserRole } from '@cms/shared-types';
import { useRouter } from 'next/navigation';
import { Calendar, Search, User, Users, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { apiClient } from '@/lib/api';
import { displayUtcDate } from '@/lib/date-display';
import { cn, formatAge } from '@/lib/utils';
import { enumLabel } from '@/lib/labels';
import { appointmentsHref } from '@/lib/appointments-link';
import { APPOINTMENT_READ_ROLES } from '@/lib/appointment-access';
import { doctorLabel } from './doctor-label';

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

const STAFF_DIRECTORY_ROLES: string[] = [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER];

async function searchPatients(query: string): Promise<SearchResult[]> {
  const response: any = await apiClient.getPatients({ search: query, limit: 5 });
  return (response.data || response.patients || []).map((patient: any) => ({
    id: patient.id,
    type: 'patient',
    title: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || patient.name || 'Unknown Patient',
    subtitle: patient.phone || patient.email,
    description: `Patient • ${patient.gender ? enumLabel('gender', patient.gender) : 'Sex not recorded'} • ${formatAge(patient)}`,
    icon: Users,
    href: `/dashboard/patients/${encodeURIComponent(patient.id)}`,
  }));
}

async function searchAppointments(query: string): Promise<SearchResult[]> {
  const response: any = await apiClient.getAppointments({ search: query, limit: 5, sortBy: 'date', sortOrder: 'desc' });
  return (response.appointments || response.data || []).map((appointment: any) => {
    const patientName = appointment.patient?.name || `${appointment.patient?.firstName || ''} ${appointment.patient?.lastName || ''}`.trim() || 'Unknown Patient';
    const doctorName = `${appointment.doctor?.firstName || ''} ${appointment.doctor?.lastName || ''}`;
    return {
      id: appointment.id,
      type: 'appointment',
      title: `${patientName} - ${appointment.slot}`,
      subtitle: doctorLabel(doctorName) || undefined,
      description: `Appointment • ${displayUtcDate(appointment.date)} • ${enumLabel('visitType', appointment.visitType || 'OPD')}`,
      icon: Calendar,
      href: appointmentsHref(String(appointment.date || '').slice(0, 10), appointment.doctorId),
    };
  });
}

async function searchUsers(query: string): Promise<SearchResult[]> {
  const response: any = await apiClient.getUsers({ search: query, limit: 3 });
  return (response.users || response.data || []).map((user: any) => ({
    id: user.id,
    type: 'user',
    title: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || 'Unknown User',
    subtitle: user.email,
    description: `${user.role ? enumLabel('role', user.role) : 'User'} • ${user.specialization || 'General'}`,
    icon: User,
    href: `/dashboard/users?search=${encodeURIComponent(user.id)}`,
  }));
}

async function searchEverything(query: string, role?: string): Promise<SearchResult[]> {
  const searches: [string, Promise<SearchResult[]>][] = [['patients', searchPatients(query)]];
  if (role && APPOINTMENT_READ_ROLES.includes(role)) searches.push(['appointments', searchAppointments(query)]);
  if (role && STAFF_DIRECTORY_ROLES.includes(role)) searches.push(['users', searchUsers(query)]);
  const settled = await Promise.allSettled(searches.map(([, search]) => search));
  return settled.flatMap((outcome, index) => {
    if (outcome.status === 'fulfilled') return outcome.value;
    console.error(`Failed to search ${searches[index][0]}`, outcome.reason);
    return [];
  });
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
export function GlobalSearch({ role, className, autoFocus, onNavigate }: { role?: string; className?: string; autoFocus?: boolean; onNavigate?: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
    function focusOnSlash(event: KeyboardEvent) {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"]')) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], .introjs-overlay')) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener('keydown', focusOnSlash);
    return () => window.removeEventListener('keydown', focusOnSlash);
  }, []);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    let current = true;
    const delayed = setTimeout(async () => {
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        setResults([]);
        setOpen(false);
        setSearching(false);
        return;
      }
      setSearching(true);
      const found = await searchEverything(trimmed, role);
      if (!current) return;
      setResults(found);
      setActiveIndex(-1);
      setSearching(false);
    }, 300);
    return () => {
      current = false;
      clearTimeout(delayed);
    };
  }, [query, role]);

  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${listId}-option-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, listId]);

  const openResult = (result: SearchResult) => {
    setOpen(false);
    setQuery('');
    router.push(result.href);
    onNavigate?.();
  };

  const clear = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    setSearching(false);
    inputRef.current?.focus();
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
    <div className={cn('flex-1 max-w-md relative', className)} ref={rootRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-keyshortcuts="/"
          aria-label="Search patients, appointments, doctors"
          aria-autocomplete="list"
          aria-expanded={listShown}
          aria-controls={listId}
          aria-activedescendant={listShown && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          placeholder="Search patients, appointments, doctors..."
          className={cn('peer pl-10 py-2 w-full', query ? 'pr-16' : 'pr-10')}
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
          <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
            <Spinner className="h-4 w-4" />
          </div>
        )}
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={clear}
            className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <kbd aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 font-mono text-xs text-muted-foreground transition-opacity peer-focus:opacity-0 md:block">/</kbd>
        )}
      </div>

      {listShown && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
          <ul id={listId} role="listbox" aria-label="Search results" className="max-h-[min(24rem,60dvh)] overflow-y-auto">
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
        <Card className="gap-0 py-0 absolute top-full left-0 right-0 mt-1 z-50 shadow-sm">
          <CardContent className="p-4 text-center" role="status">
            <p className="text-sm text-muted-foreground">No results found for &quot;{query}&quot;</p>
            <p className="text-xs text-muted-foreground mt-1">Try searching for patient names, phone numbers, or doctor names</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
