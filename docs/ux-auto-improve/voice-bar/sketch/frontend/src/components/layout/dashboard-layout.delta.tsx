// Repo path: frontend/src/components/layout/dashboard-layout.tsx  (DELTA ONLY, package C)
// Lines verified: root `h-screen flex bg-background` at :116, column at :129, <main> at :159-161.
//
// 1. import { VoiceBarProvider } from '@/components/voice/VoiceBarProvider';
//    import { VoiceBar } from '@/components/voice/VoiceBar';
// 2. Wrap the root div (inside DashboardUserProvider, :115) in <VoiceBarProvider>.
// 3. Root div class (:116):
//      before: "h-screen flex bg-background"
//      after:  "flex bg-background h-[var(--voice-shell-height,100dvh)] mt-[var(--voice-shell-offset,0px)]"
//    100dvh lets Android's keyboard shrink the shell (with the viewport export); the two variables
//    are set only on iOS while the bar's text box has focus (components/voice/visual-viewport.ts).
// 4. After </main> (:161), inside the column: <VoiceBar />. It renders null until a page registers.

/**
 * @cc [owner:nareshshah139,label:accessibility] voice-bar-in-flow
 * The voice bar MUST be mounted once, as an in-flow sibling after main inside the content column,
 * never position fixed, so main shrinks and no page footer or dialog action row is covered.
 */
import type { JSX, ReactNode } from 'react';
export declare function DashboardLayout(props: { children: ReactNode }): JSX.Element;
