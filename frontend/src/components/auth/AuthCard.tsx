import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

/** The centered card shared by the sign-in and password-reset pages. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-gradient-soft px-4 py-16">
      <Card className="w-full max-w-md border-border/70 bg-card">
        <CardHeader className="items-center pb-2">
          <h1 className="text-center text-2xl font-semibold tracking-tight">{title}</h1>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  );
}
