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
        <PageHeader title="Patients" actions={<QuickGuide
            title="Patients guide"
            sections={[
              {
                title: "New patient",
                items: [
                  "Click 'New patient' and enter the name, phone, age and gender",
                  "'Book for today' puts the patient on today's list for the doctor you choose. 'Register only' just saves the patient",
                  "Address, email, ABHA ID and other details are under 'More details'"
                ]
              },
              {
                title: "Search",
                items: [
                  "Type a name or phone number in the search box",
                  "Narrow the list by gender, consultation type or date",
                  "Click a patient to open their page"
                ]
              },
              {
                title: "Patient page",
                items: [
                  "The last visit, with medicines and review advice, is at the top",
                  "Click 'Edit' to change the patient's details",
                  "Book an appointment or start a visit from the buttons at the top, and find earlier visits and photos below"
                ]
              }
            ]}
          />} />
        <PatientsManagement />
      </div>
    </Suspense>
  );
} 