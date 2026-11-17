'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import {
  buildContext,
  buildIssueFormData,
  initialReportState,
  installErrorCapture,
  newScreenshotId,
  preloadScreenCapture,
  reportReducer,
  startViewportCapture,
  submitBlocker,
  type ReportPrefill,
} from '@/lib/issue-report';
import { ReportIssueDialog } from './ReportIssueDialog';

interface ReportIssueContextValue {
  enabled: boolean;
  openReport: (prefill?: ReportPrefill) => void;
}

const ReportIssueContext = createContext<ReportIssueContextValue | undefined>(undefined);

export function ReportIssueProvider({ children }: { children: ReactNode }) {
  const { user } = useDashboardUser();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [state, dispatch] = useReducer(reportReducer, undefined, initialReportState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const opening = useRef(false);

  useEffect(() => installErrorCapture(), []);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    apiClient.getIssueReportStatus().then(
      (status) => !cancelled && setEnabled(Boolean(status?.enabled)),
      () => !cancelled && setEnabled(false),
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (enabled) void preloadScreenCapture().catch(() => undefined);
  }, [enabled]);

  const openReport = useCallback(async (prefill?: ReportPrefill) => {
    if (stateRef.current.open || opening.current) return;
    opening.current = true;
    try {
      const { draft } = stateRef.current;
      const capture = draft.screenshots.length === 0 ? await startViewportCapture().catch(() => null) : null;
      const errors = prefill?.error ? [...draft.errors, prefill.error] : draft.errors;
      dispatch({ type: 'opened', context: buildContext(errors), prefill });
      if (capture) {
        const id = newScreenshotId();
        dispatch({ type: 'captureStarted', id });
        capture.image.then(
          (blob) => dispatch({ type: 'captureFinished', id, blob }),
          () => dispatch({ type: 'captureFailed', id }),
        );
      }
    } finally {
      opening.current = false;
    }
  }, []);

  const submit = useCallback(async () => {
    const { draft, context, status } = stateRef.current;
    if (submitBlocker(draft) || status.phase === 'submitting') return;
    dispatch({ type: 'submitStarted' });
    try {
      const created = await apiClient.submitIssueReport(buildIssueFormData(draft, context));
      dispatch({ type: 'submitSucceeded', number: created.number, url: created.url });
      if (!stateRef.current.open) {
        dispatch({ type: 'closed' });
        toast({ variant: 'success', title: `Report #${created.number} sent`, description: "Thanks, we've got it." });
      }
    } catch (error) {
      const message = getErrorMessage(error);
      dispatch({ type: 'submitFailed', message });
      if (!stateRef.current.open) {
        toast({
          variant: 'warning',
          title: "Your report wasn't sent",
          description: `${message} Open "Report a problem" to try again; your draft is still there.`,
        });
      }
    }
  }, [toast]);

  const value = useMemo(() => ({ enabled, openReport: (prefill?: ReportPrefill) => void openReport(prefill) }), [enabled, openReport]);

  return (
    <ReportIssueContext.Provider value={value}>
      {children}
      {enabled && <ReportIssueDialog state={state} dispatch={dispatch} onSubmit={() => void submit()} />}
    </ReportIssueContext.Provider>
  );
}

export function useReportIssue(): ReportIssueContextValue {
  const ctx = useContext(ReportIssueContext);
  if (!ctx) throw new Error('useReportIssue must be used within a ReportIssueProvider');
  return ctx;
}
