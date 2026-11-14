"use client";

import { LoadingSkeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { Suspense } from 'react';
import PatientsManagement from '@/components/patients/PatientsManagement';
import { QuickGuide } from '@/components/common/QuickGuide';

export default function PatientsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton label="Loading patients…" />}>
      <div className="space-y-4">
        <PageHeader title={<>Patients</>} actions={<><QuickGuide
            title="Patients guide"
            sections={[
              {
                title: "Adding Patients",
                items: [
                  "Click 'Add Patient' to create a new patient record",
                  "Fill in required fields: name, contact, date of birth",
                  "Add optional information like address, medical history, and insurance details"
                ]
              },
              {
                title: "Search & Filter",
                items: [
                  "Use the search bar to find patients by name, phone, or email",
                  "Filter patients by status, gender, or date range",
                  "Click on a patient row to view their detailed profile"
                ]
              },
              {
                title: "Patient Records",
                items: [
                  "View complete visit history and medical records",
                  "Track patient progress and treatment plans",
                  "Access photos, prescriptions, and invoices from patient profile"
                ]
              }
            ]}
          /></>} />
        <PatientsManagement />
      </div>
    </Suspense>
  );
} 