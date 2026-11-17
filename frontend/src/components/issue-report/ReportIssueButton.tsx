'use client';

import { MessageSquareWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useReportIssue } from './ReportIssueProvider';

export function ReportIssueButton({ className }: { className?: string }) {
  const { enabled, openReport } = useReportIssue();
  if (!enabled) return null;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Report a problem"
            className={className}
            onClick={() => openReport()}
          >
            <MessageSquareWarning className="size-5" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Report a problem</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
