'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { applyBrandPaletteToCssVariables, defaultPalette, extractBrandPaletteFromImage, type BrandPalette } from '@/lib/brand';

type BrandedContextValue = {
  brandedEnabled: boolean;
  toggleBranded: (v?: boolean) => void;
  loading: boolean;
  palette: BrandPalette | null;
};

const BrandedModeContext = createContext<BrandedContextValue | undefined>(undefined);

const STORAGE_KEY = 'cms_branded_mode';
const PALETTE_KEY = 'cms_branded_palette_v1';

export function BrandedModeProvider({ children }: { children: React.ReactNode }) {
  const [brandedEnabled, setBrandedEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [palette, setPalette] = useState<BrandPalette | null>(null);

  // Initialize from localStorage and compute palette on first mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const enabled = saved === '1';
      setBrandedEnabled(enabled);

      const cached = localStorage.getItem(PALETTE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as BrandPalette;
        setPalette(parsed);
        if (enabled) {
          applyBrandPaletteToCssVariables(parsed);
          document.documentElement.classList.add('branded');
        }
        setLoading(false);
      } else {
        // Compute from image lazily
        void (async () => {
          try {
            const pal = await extractBrandPaletteFromImage('/letterhead.png');
            setPalette(pal);
            localStorage.setItem(PALETTE_KEY, JSON.stringify(pal));
            if (enabled) {
              applyBrandPaletteToCssVariables(pal);
              document.documentElement.classList.add('branded');
            }
          } catch {
            const pal = defaultPalette();
            setPalette(pal);
            if (enabled) {
              applyBrandPaletteToCssVariables(pal);
              document.documentElement.classList.add('branded');
            }
          } finally {
            setLoading(false);
          }
        })();
      }
    } catch {
      setBrandedEnabled(false);
      setPalette(defaultPalette());
      setLoading(false);
    }
  }, []);

  const apply = useCallback((enabled: boolean, pal: BrandPalette | null) => {
    const root = document.documentElement;
    if (enabled && pal) {
      applyBrandPaletteToCssVariables(pal);
      root.classList.add('branded');
    } else {
      root.classList.remove('branded');
      // Allow CSS defaults to take over by clearing inline overrides
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-foreground');
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-foreground');
      root.style.removeProperty('--ring');
      root.style.removeProperty('--sidebar-primary');
      root.style.removeProperty('--sidebar-primary-foreground');
      root.style.removeProperty('--sidebar-ring');
    }
  }, []);

  const toggleBranded = useCallback((v?: boolean) => {
    setBrandedEnabled(prev => {
      const next = typeof v === 'boolean' ? v : !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {}
      apply(next, palette);
      return next;
    });
  }, [apply, palette]);

  const value = useMemo<BrandedContextValue>(() => ({ brandedEnabled, toggleBranded, loading, palette }), [brandedEnabled, toggleBranded, loading, palette]);

  return (
    <BrandedModeContext.Provider value={value}>
      {children}
    </BrandedModeContext.Provider>
  );
}

export function useBrandedMode(): BrandedContextValue {
  const ctx = useContext(BrandedModeContext);
  if (!ctx) throw new Error('useBrandedMode must be used within BrandedModeProvider');
  return ctx;
}


