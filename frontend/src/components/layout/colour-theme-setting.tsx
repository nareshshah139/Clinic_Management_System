'use client';

import { useState } from 'react';
import { NativeSelect } from '@/components/ui/native-select';
import { PALETTES, activePalette, choosePalette, isPalette, type Palette } from '@/lib/palette';

export function ColourThemeSetting() {
  const [palette, setPalette] = useState<Palette>(activePalette);

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border p-3">
      <div>
        <label htmlFor="colour-theme" className="font-medium">Colour theme</label>
        <p id="colour-theme-hint" className="text-xs text-muted-foreground">Saved for this browser only.</p>
      </div>
      <NativeSelect
        id="colour-theme"
        aria-describedby="colour-theme-hint"
        className="w-36 shrink-0"
        value={palette}
        onChange={(event) => {
          const next = event.target.value;
          if (!isPalette(next)) return;
          choosePalette(next);
          setPalette(next);
        }}
      >
        {Object.entries(PALETTES).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </NativeSelect>
    </div>
  );
}
