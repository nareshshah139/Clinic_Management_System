export function HistoryVisibilityControl({ hiddenCount, showEmpty, onChange }: { hiddenCount: number; showEmpty: boolean; onChange: (show: boolean) => void }) {
  if (!hiddenCount) return null;
  return <label className="flex items-center gap-2 py-2 text-sm text-slate-600"><input type="checkbox" checked={showEmpty} onChange={e => onChange(e.target.checked)} />Show {hiddenCount} empty records (no clinical details saved)</label>;
}
