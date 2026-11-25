'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { formatDisplayDay } from '@/lib/date-ranges';
import { plural } from '@/lib/labels';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useRegisterQuery } from '@/components/register/useRegisterQuery';
import { RegisterDateTime, RegisterDenied, RegisterGrid, type RegisterColumn } from '@/components/register/RegisterGrid';
import { ClearFilters, DateRangeFilter, FilterBar, FilterSelect } from '@/components/register/RegisterFilters';
import { RegisterFooter } from '@/components/register/RegisterFooter';
import { AuditEntryDialog } from './AuditEntryDialog';
import {
  AUDIT_QUERY,
  fetchAuditPage,
  fetchFilterOptions,
  fetchStaff,
  fieldChanges,
  summary,
  type AuditEntry,
  type AuditFilter,
  type Option,
} from './audit-log-model';

const NO_MORE: readonly AuditFilter[] = [];
const FORMER_STAFF = 'Former staff member';

function changedFields(entry: AuditEntry) {
  const labels = fieldChanges(entry).map((change) => change.label);
  if (!labels.length) return <span className="text-muted-foreground">—</span>;
  const shown = labels.slice(0, 3).join(', ');
  return labels.length > 3 ? `${shown} and ${labels.length - 3} more` : shown;
}

const keepSelected = (options: Option[], value: string, label: string) =>
  value && !options.some((option) => option.value === value) ? [...options, { value, label }] : options;

export function AuditLogRegister({
  searchParams,
  onParamsChange,
}: {
  searchParams: Pick<URLSearchParams, 'get' | 'toString'>;
  onParamsChange: (params: URLSearchParams) => void;
}) {
  const { today, query, dispatch, load, reload, view, tableRef, clearAll, goToPage } = useRegisterQuery({
    config: AUDIT_QUERY,
    more: NO_MORE,
    searchParams,
    onParamsChange,
    fetchPage: fetchAuditPage,
  });
  const [staff, setStaff] = useState<Option[]>([]);
  const [options, setOptions] = useState<{ actions: Option[]; entities: Option[] }>({ actions: [], entities: [] });
  const [open, setOpen] = useState<AuditEntry | null>(null);

  useEffect(() => {
    fetchStaff().then(setStaff, () => setStaff([]));
  }, []);

  useEffect(() => {
    let current = true;
    fetchFilterOptions(query.from, query.to).then(
      (next) => current && setOptions(next),
      () => current && setOptions({ actions: [], entities: [] }),
    );
    return () => {
      current = false;
    };
  }, [query.from, query.to]);

  if (load.status === 'denied') return <RegisterDenied noun="the audit log" />;

  const who = (entry: AuditEntry) => staff.find((person) => person.value === entry.userId)?.label ?? FORMER_STAFF;
  const data = load.data;
  const rows = data?.rows ?? [];
  const what = (entry: AuditEntry) => (
    <button
      type="button"
      onClick={() => setOpen(entry)}
      aria-label={`${summary(entry)}, show details`}
      className="rounded-sm text-left font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {summary(entry)}
    </button>
  );
  const columns: RegisterColumn<AuditEntry, 'timestamp'>[] = [
    { key: 'when', label: 'When', sort: 'timestamp', pinned: true, cell: (entry) => <RegisterDateTime value={entry.timestamp} today={today} /> },
    { key: 'who', label: 'Who', cell: who },
    { key: 'what', label: 'What happened', interactive: true, cell: what },
    { key: 'fields', label: 'Fields changed', cell: changedFields },
  ];
  const card = (entry: AuditEntry) => (
    <div className="flex flex-col gap-0.5">
      {what(entry)}
      <span className="text-sm">
        {who(entry)} · <RegisterDateTime value={entry.timestamp} today={today} />
      </span>
      <span className="text-sm text-muted-foreground">{changedFields(entry)}</span>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <FilterBar count={view.barCount} search={null}>
        <DateRangeFilter range={{ from: query.from, to: query.to }} today={today} onChange={(range) => dispatch({ type: 'range', ...range })} />
        <FilterSelect
          label="Who"
          allLabel="Anyone"
          value={query.filters.user}
          options={keepSelected(staff, query.filters.user, FORMER_STAFF)}
          onChange={(value) => dispatch({ type: 'filter', key: 'user', value })}
        />
        <FilterSelect
          label="What happened"
          allLabel="Anything"
          value={query.filters.action}
          options={keepSelected(options.actions, query.filters.action, 'Selected action')}
          onChange={(value) => dispatch({ type: 'filter', key: 'action', value })}
        />
        <FilterSelect
          label="Record"
          allLabel="Any record"
          value={query.filters.entity}
          options={keepSelected(options.entities, query.filters.entity, 'Selected record')}
          onChange={(value) => dispatch({ type: 'filter', key: 'entity', value })}
        />
        {view.filtered && <ClearFilters onClear={clearAll} />}
      </FilterBar>
      <RegisterGrid
        label="Audit log"
        noun="the audit log"
        columns={columns}
        rows={rows}
        load={load}
        sort={{ by: query.sortBy, dir: query.sortDir }}
        onSort={(key) => dispatch({ type: 'sort', key })}
        onRowClick={setOpen}
        onRetry={() => void reload()}
        containerRef={tableRef}
        compact
        card={card}
        empty={
          <EmptyState
            icon={History}
            title={view.searching ? 'No changes match these filters' : 'No changes recorded in this period'}
            description={`Nothing was recorded between ${formatDisplayDay(query.from)} and ${formatDisplayDay(query.to)}${view.searching ? ' with these filters' : ''}.`}
            action={
              view.filtered ? (
                <Button variant="outline" onClick={clearAll}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        }
      />
      <RegisterFooter
        summary={load.status === 'error' ? 'Count not available' : data ? plural(data.total, 'change') : 'Loading…'}
        page={query.page}
        limit={data?.limit ?? 50}
        total={load.status === 'error' ? 0 : (data?.total ?? 0)}
        unit="change"
        label="Audit log pages"
        busy={load.status === 'loading' && !!data}
        onPage={goToPage}
      />
      <AuditEntryDialog entry={open} who={open ? who(open) : ''} onClose={() => setOpen(null)} />
    </div>
  );
}
