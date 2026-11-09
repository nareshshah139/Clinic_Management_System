import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { ReactNode } from 'react';

export const metadata = { title: "Dashboard" };

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
} 