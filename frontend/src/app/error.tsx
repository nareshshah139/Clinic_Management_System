'use client';

import { useEffect } from 'react';
import { CloudAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProblemScreen } from '@/components/layout/problem-screen';

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ProblemScreen
      role="alert"
      icon={CloudAlert}
      title="Something went wrong"
      description="Trying again usually fixes it. If it keeps happening, go back to the dashboard and let the team know."
      reference={error.digest}
    >
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </ProblemScreen>
  );
}
