// Repo path: frontend/src/app/dashboard/layout.tsx  (DELTA ONLY, package C)
// The file is a 10-line server component today (:1-10, no 'use client'), so a viewport export is
// allowed here. The root app/layout.tsx has no viewport export (grep), so nothing merges with it.
// Scoped to /dashboard on purpose: the bar exists only inside the dashboard shell.

import type { Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',              // env(safe-area-inset-bottom) under the bar
  interactiveWidget: 'resizes-content', // Android Chrome shrinks the layout for the keyboard; iOS ignores it
};
