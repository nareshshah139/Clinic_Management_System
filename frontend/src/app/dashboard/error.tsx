'use client';

import { useEffect } from 'react';
import { CloudAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProblemScreen } from '@/components/layout/problem-screen';
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
    <ProblemScreen
      role="alert"
      icon={CloudAlert}
      title="This page ran into a problem"
      description="Trying again usually fixes it. If it keeps happening, let the team know and they'll look into it."
      reference={error.digest}
    >
      <Button type="button" onClick={reset}>
        Try again
      </Button>
      {enabled && (
        <Button type="button" variant="outline" onClick={report}>
          Report this problem
        </Button>
      )}
    </ProblemScreen>
  );
}
