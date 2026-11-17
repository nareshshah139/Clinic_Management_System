'use client';

import { useEffect } from 'react';
import { CloudAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReportIssue } from '@/components/issue-report/ReportIssueProvider';
import { TITLE_MAX, toCapturedError } from '@/lib/issue-report';

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { enabled, openReport } = useReportIssue();

  useEffect(() => {
    console.error(error);
  }, [error]);

  const report = () => {
    const firstLine = (error.message || '').split('\n')[0].trim();
    openReport({
      kind: 'bug',
      title: (firstLine ? `Page error: ${firstLine}` : 'This page stopped working').slice(0, TITLE_MAX),
      error: toCapturedError(error),
    });
  };

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
        <CloudAlert className="size-6 text-muted-foreground" aria-hidden="true" />
      </span>
      <h1 className="text-lg font-semibold text-foreground">This page ran into a problem</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Trying again usually fixes it. If it keeps happening, let the team know and they&apos;ll look into it.
      </p>
      {error.digest && <p className="mt-2 text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        {enabled && (
          <Button type="button" variant="outline" onClick={report}>
            Report this problem
          </Button>
        )}
      </div>
    </div>
  );
}
