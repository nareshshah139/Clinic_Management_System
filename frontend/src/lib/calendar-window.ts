export interface GridWindow {
  startHour: number;
  endHour: number;
  outsideCount: number;
}

const SLOT = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/;

export function computeGridWindow(work: { startHour: number; endHour: number }, slots: string[]): GridWindow {
  const workStart = work.startHour * 60;
  const workEnd = work.endHour * 60;
  let start = workStart;
  let end = workEnd;
  let outsideCount = 0;
  for (const slot of slots) {
    const m = SLOT.exec(slot);
    if (!m) continue;
    const s = Number(m[1]) * 60 + Number(m[2]);
    const e = Number(m[3]) * 60 + Number(m[4]);
    if (e <= s) continue;
    start = Math.min(start, s);
    end = Math.max(end, e);
    if (s < workStart || e > workEnd) outsideCount++;
  }
  return {
    startHour: Math.max(0, Math.floor(start / 60)),
    endHour: Math.min(24, Math.ceil(end / 60)),
    outsideCount,
  };
}
