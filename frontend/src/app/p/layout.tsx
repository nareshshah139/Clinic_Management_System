export const dynamic = 'force-dynamic';

export const metadata = { title: 'Patient portal', referrer: 'no-referrer' as const, robots: { index: false, follow: false } };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen w-full max-w-md bg-background px-4 py-6 text-foreground">{children}</main>;
}
