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
                  "Press New Patient to create a patient record",
                  "First name, gender and phone are required",
                  "Age, email, address, ABHA ID, emergency contact and primary doctor are optional",
                  "For a walk-in, set Patient Type to Walk-in and choose a doctor to book their next free slot"
                ]
              },
              {
                title: "Search & Filter",
                items: [
                  "Search by name, phone, ABHA ID or email",
                  "Filter by gender, consultation type, or patients added or seen in the last week or month",
                  "Click a patient row to open their profile"
                ]
              },
              {
                title: "Patient Profile",
                items: [
                  "Info shows contact details, History lists past visits, and Uploads is where you add photos",
                  "Start a new visit, resume the last one, or book an appointment from the top of the profile"
                ]
              }
            ]}
          /></>} />
        <PatientsManagement />
      </div>
    </Suspense>
  );
} 