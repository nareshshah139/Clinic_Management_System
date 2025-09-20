'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PharmacyInvoiceBuilder } from '@/components/pharmacy/PharmacyInvoiceBuilder';
import { 
  Receipt,
  Pill,
  Users,
  DollarSign,
  TrendingUp,
  Package
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PharmacyPage() {
  const router = useRouter();
  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Pharmacy Billing</h2>
          <p className="text-muted-foreground">Create pharmacy invoices and manage prescriptions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/dashboard/pharmacy/invoices')}>
            <Receipt className="h-4 w-4 mr-2" />
            View Invoices
          </Button>
          <Button variant="outline" onClick={() => router.push('/dashboard/pharmacy/drugs')}>
            <Pill className="h-4 w-4 mr-2" />
            Manage Drugs
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Today's Sales</p>
                <p className="text-2xl font-bold">₹12,450</p>
                <p className="text-xs text-green-600 flex items-center">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +15% from yesterday
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Invoices Today</p>
                <p className="text-2xl font-bold">24</p>
                <p className="text-xs text-muted-foreground">8 pending</p>
              </div>
              <Receipt className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Available Drugs</p>
                <p className="text-2xl font-bold">253K+</p>
                <p className="text-xs text-orange-600">23 low stock</p>
              </div>
              <Pill className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Patients Served</p>
                <p className="text-2xl font-bold">156</p>
                <p className="text-xs text-muted-foreground">This month</p>
              </div>
              <Users className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Invoice Builder */}
      <PharmacyInvoiceBuilder />
    </div>
  );
} 