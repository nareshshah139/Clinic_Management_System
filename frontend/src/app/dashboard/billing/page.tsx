'use client';

import BillingManagement from '@/components/billing/BillingManagement';
import { QuickGuide } from '@/components/common/QuickGuide';

export default function BillingPage() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Billing Management</h1>
          <p className="text-gray-600">Manage invoices, payments, and billing records</p>
        </div>
        <QuickGuide
          title="Billing Management Guide"
          sections={[
            {
              title: "Creating Invoices",
              items: [
                "Select a patient to create an invoice",
                "Add services, procedures, or consultation fees",
                "Apply discounts and adjust GST as needed",
                "Select payment mode and record payment"
              ]
            },
            {
              title: "Payment Tracking",
              items: [
                "Record partial payments for pending invoices",
                "Track payment status: Paid, Pending, or Overdue",
                "View payment history and transaction details",
                "Generate payment receipts for patients"
              ]
            },
            {
              title: "Invoice Management",
              items: [
                "Search invoices by patient name or invoice number",
                "Filter by payment status or date range",
                "Export invoices to PDF or print directly",
                "View detailed breakdown of charges and taxes"
              ]
            }
          ]}
        />
      </div>
      <BillingManagement />
    </div>
  );
} 