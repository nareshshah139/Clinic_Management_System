import { FileQuestion } from 'lucide-react';
import { ProblemScreen } from '@/components/layout/problem-screen';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <ProblemScreen
      icon={FileQuestion}
      title="We can't find that page"
      description="The link may be old or mistyped. Start again from the dashboard."
    />
  );
}
