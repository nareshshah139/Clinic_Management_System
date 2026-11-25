'use client';

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { addDays, type DayRange } from '@/lib/date-ranges';
import { displayCalendarDate } from '@/lib/date-display';

export interface DailyRevenue {
  date: string;
  revenue: number;
  invoiceCount: number;
}

export interface AgeGroup {
  ageGroup: string;
  count: number;
  percentage: number;
}

const AGE_ORDER = ['0-17', '18-30', '31-45', '46-60', '61+'];
const SERIES = 'var(--chart-2)';
const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const compactRupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumSignificantDigits: 3 });
const shortDay = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const tick = { fill: 'var(--muted-foreground)', fontSize: 12 };

/** Every clinic day in the range, so a day with no takings shows as zero instead of vanishing. */
export function everyDay(range: DayRange, days: DailyRevenue[]): DailyRevenue[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const filled: DailyRevenue[] = [];
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) filled.push(byDate.get(date) ?? { date, revenue: 0, invoiceCount: 0 });
  return filled;
}

function TooltipCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="font-medium">{title}</p>
      {lines.map((line) => <p key={line} className="tabular-nums text-muted-foreground">{line}</p>)}
    </div>
  );
}

function ChartTable({ caption, head, rows }: { caption: string; head: [string, string]; rows: [string, string][] }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
      <table className="mt-2 w-full text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b"><th className="py-1 font-medium">{head[0]}</th><th className="py-1 text-right font-medium">{head[1]}</th></tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b last:border-0"><td className="py-1">{label}</td><td className="py-1 text-right tabular-nums">{value}</td></tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function DailyRevenueChart({ range, days }: { range: DayRange; days: DailyRevenue[] }) {
  const data = everyDay(range, days);
  const best = data.reduce((top, day) => (day.revenue > top.revenue ? day : top), data[0]);
  const summary = best && best.revenue > 0
    ? `Takings per day from ${displayCalendarDate(range.from)} to ${displayCalendarDate(range.to)}. Highest was ${rupees.format(best.revenue)} on ${displayCalendarDate(best.date)}.`
    : `No takings from ${displayCalendarDate(range.from)} to ${displayCalendarDate(range.to)}.`;
  return (
    <figure>
      <div role="img" aria-label={summary} className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" tickFormatter={(date: string) => shortDay.format(new Date(`${date}T00:00:00Z`))} tick={tick} tickLine={false} axisLine={{ stroke: 'var(--border)' }} minTickGap={24} />
            <YAxis tickFormatter={(value: number) => compactRupees.format(value)} tick={tick} tickLine={false} axisLine={false} width={64} />
            <Tooltip
              cursor={{ fill: 'var(--muted)' }}
              content={({ active, payload }: TooltipContentProps<number, string>) => {
                const day = active ? (payload?.[0]?.payload as DailyRevenue | undefined) : undefined;
                return day ? <TooltipCard title={displayCalendarDate(day.date)} lines={[rupees.format(day.revenue), `${day.invoiceCount} ${day.invoiceCount === 1 ? 'payment' : 'payments'}`]} /> : null;
              }}
            />
            <Bar dataKey="revenue" fill={SERIES} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartTable caption="Takings per day" head={['Day', 'Takings']} rows={data.filter((day) => day.revenue !== 0).map((day) => [displayCalendarDate(day.date), rupees.format(day.revenue)])} />
    </figure>
  );
}

export function AgeGroupChart({ groups }: { groups: AgeGroup[] }) {
  const data = [...groups].sort((a, b) => AGE_ORDER.indexOf(a.ageGroup) - AGE_ORDER.indexOf(b.ageGroup));
  const summary = `Patients by age group: ${data.map((group) => `${group.ageGroup}, ${group.count}`).join('; ')}.`;
  return (
    <figure>
      <div role="img" aria-label={summary} className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="ageGroup" tick={tick} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
            <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              cursor={{ fill: 'var(--muted)' }}
              content={({ active, payload }: TooltipContentProps<number, string>) => {
                const group = active ? (payload?.[0]?.payload as AgeGroup | undefined) : undefined;
                return group ? <TooltipCard title={`Age ${group.ageGroup}`} lines={[`${group.count} ${group.count === 1 ? 'patient' : 'patients'}`, `${group.percentage.toFixed(1)}% of patients`]} /> : null;
              }}
            />
            <Bar dataKey="count" fill={SERIES} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey="count" position="top" fill="var(--foreground)" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartTable caption="Patients by age group" head={['Age group', 'Patients']} rows={data.map((group) => [group.ageGroup, String(group.count)])} />
    </figure>
  );
}
