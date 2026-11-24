'use client';

import { Suspense } from 'react';
import { FollowUpsWorkspace } from '@/components/follow-ups/workspace';

export default function FollowUpsPage() {
  return (
    <Suspense fallback={null}>
      <FollowUpsWorkspace />
    </Suspense>
  );
}
