'use client';

import { useEffect } from 'react';
import { CloudAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProblemScreen } from '@/components/layout/problem-screen';
import { DEFAULT_PALETTE } from '@/lib/palette';
import './globals.css';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" data-palette={DEFAULT_PALETTE}>
      <body className="bg-background antialiased">
        <ProblemScreen
          role="alert"
          icon={CloudAlert}
          title="Linaé couldn't load"
          description="Trying again usually fixes it. If it keeps happening, reload the dashboard and let the team know."
          reference={error.digest}
        >
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        </ProblemScreen>
      </body>
    </html>
  );
}
