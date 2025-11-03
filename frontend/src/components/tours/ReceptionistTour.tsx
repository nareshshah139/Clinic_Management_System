/**
 * Receptionist Workflow Tour Component
 * 
 * Provides a comprehensive guided tour for receptionist users covering
 * key workflows including appointments, patient management, billing, and rooms.
 * 
 * @module ReceptionistTour
 */

'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { HelpCircle } from 'lucide-react';
import { useIntroTour, type TourStep } from '@/hooks/useIntroTour';
import 'intro.js/introjs.css';

interface ReceptionistTourProps {
  /** Whether to auto-start the tour on first visit */
  autoStart?: boolean;
}

/**
 * Get tour steps based on the current page
 */
function getTourStepsForPage(pathname: string): TourStep[] {
  // Dashboard tour
  if (pathname === '/dashboard') {
    return [
      {
        intro: `
          <div class="space-y-2">
            <h3 class="text-lg font-semibold">Welcome to the Receptionist Dashboard! 🎉</h3>
            <p>Let's take a quick tour of your main responsibilities and how to navigate the system effectively.</p>
          </div>
        `,
        title: 'Welcome!',
      },
      {
        element: '[data-tour="sidebar"]',
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">Navigation Sidebar</h4>
            <p>Use this sidebar to access all the modules you need:</p>
            <ul class="list-disc pl-5 space-y-1 text-sm">
              <li><strong>Appointments:</strong> Schedule and manage patient appointments</li>
              <li><strong>Patients:</strong> Register and manage patient records</li>
              <li><strong>Rooms:</strong> Check room availability</li>
              <li><strong>Billing:</strong> Process payments and create invoices</li>
            </ul>
          </div>
        `,
        position: 'right',
      },
      {
        element: '[data-tour="dashboard-stats"]',
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">Today's Overview</h4>
            <p>View quick stats for today including:</p>
            <ul class="list-disc pl-5 space-y-1 text-sm">
              <li>Number of appointments scheduled</li>
              <li>Patient registrations</li>
              <li>Room occupancy status</li>
            </ul>
          </div>
        `,
        position: 'bottom',
      },
      {
        element: '[data-tour="appointments-list"]',
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">Today's Appointments</h4>
            <p>See all appointments scheduled for today. Click on any appointment to view details, reschedule, or cancel.</p>
          </div>
        `,
        position: 'top',
      },
    ];
  }

  // Appointments page tour
  if (pathname === '/dashboard/appointments') {
    return [
      {
        intro: `
          <div class="space-y-2">
            <h3 class="text-lg font-semibold">Appointments Module 📅</h3>
            <p>This is your primary workspace for managing patient appointments. Let's explore the key features!</p>
          </div>
        `,
      },
      {
        element: '[data-tour="doctor-select"]',
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">Select Doctor</h4>
            <p>Choose the doctor to view and manage their appointment schedule. This filter applies to both calendar and slot views.</p>
          </div>
        `,
        position: 'bottom',
      },
      {
        element: '[data-tour="date-picker"]',
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">Select Date</h4>
            <p>Pick the date to view appointments. You can schedule appointments for future dates or manage today's bookings.</p>
          </div>
        `,
        position: 'bottom',
      },
      {
        element: '[data-tour="view-tabs"]',
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">View Options</h4>
            <p>Switch between:</p>
            <ul class="list-disc pl-5 space-y-1 text-sm">
              <li><strong>Calendar View:</strong> Visual timeline showing all appointments</li>
              <li><strong>Slots View:</strong> Traditional time slot booking interface</li>
            </ul>
          </div>
        `,
        position: 'bottom',
      },
      {
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">Creating Appointments</h4>
            <p>To book an appointment:</p>
            <ol class="list-decimal pl-5 space-y-1 text-sm">
              <li>Search and select a patient (or create a new patient)</li>
              <li>Click on an available time slot</li>
              <li>Choose appointment duration (15/30/45/60/90 minutes)</li>
              <li>Add notes if needed and confirm</li>
            </ol>
            <p class="text-sm mt-2"><strong>💡 Tip:</strong> You can drag across multiple time slots to select a custom duration!</p>
          </div>
        `,
      },
      {
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">Managing Appointments</h4>
            <ul class="list-disc pl-5 space-y-1 text-sm">
              <li><strong>Single-click:</strong> Select an appointment</li>
              <li><strong>Double-click:</strong> Open appointment details to view, edit, reschedule, or cancel</li>
              <li><strong>Color Codes:</strong> 
                <div class="mt-1 space-y-1">
                  <div class="flex items-center gap-2">
                    <div class="w-3 h-3 bg-blue-500 rounded"></div>
                    <span>Scheduled</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="w-3 h-3 bg-yellow-500 rounded"></div>
                    <span>Checked-in</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="w-3 h-3 bg-green-500 rounded"></div>
                    <span>Completed</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="w-3 h-3 bg-red-500 rounded"></div>
                    <span>Cancelled</span>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        `,
      },
    ];
  }

  // Patients page tour
  if (pathname === '/dashboard/patients') {
    return [
      {
        intro: `
          <div class="space-y-2">
            <h3 class="text-lg font-semibold">Patient Management 👥</h3>
            <p>Register new patients, search existing records, and manage patient information efficiently.</p>
          </div>
        `,
      },
      {
        element: '[data-tour="add-patient-btn"]',
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">Add New Patient</h4>
            <p>Click here to register a new patient. You'll need to collect:</p>
            <ul class="list-disc pl-5 space-y-1 text-sm">
              <li>Full name and contact information</li>
              <li>Date of birth</li>
              <li>Address (optional but recommended)</li>
              <li>Medical history and allergies (if known)</li>
            </ul>
          </div>
        `,
        position: 'left',
      },
      {
        element: '[data-tour="search-patients"]',
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">Search Patients</h4>
            <p>Quickly find patients by typing their name, phone number, or email. The search updates in real-time!</p>
          </div>
        `,
        position: 'bottom',
      },
      {
        element: '[data-tour="patients-table"]',
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">Patient List</h4>
            <p>View all registered patients. Click on any patient row to:</p>
            <ul class="list-disc pl-5 space-y-1 text-sm">
              <li>View complete patient profile</li>
              <li>Update patient information</li>
              <li>See visit history and medical records</li>
              <li>Book a new appointment</li>
            </ul>
          </div>
        `,
        position: 'top',
      },
      {
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">💡 Pro Tips</h4>
            <ul class="list-disc pl-5 space-y-1 text-sm">
              <li>Always verify patient contact information during check-in</li>
              <li>Keep emergency contact details updated</li>
              <li>Note any changes in allergies or medical conditions</li>
              <li>Use the search feature to avoid creating duplicate records</li>
            </ul>
          </div>
        `,
      },
    ];
  }

  // Rooms page tour
  if (pathname === '/dashboard/rooms') {
    return [
      {
        intro: `
          <div class="space-y-2">
            <h3 class="text-lg font-semibold">Room Management 🚪</h3>
            <p>Track room availability and assign patients to consultation rooms.</p>
          </div>
        `,
      },
      {
        element: '[data-tour="room-calendar"]',
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">Room Calendar</h4>
            <p>View real-time room occupancy and availability. Green slots indicate available rooms, while occupied rooms show patient details.</p>
          </div>
        `,
        position: 'top',
      },
      {
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">Room Assignment</h4>
            <p>When a patient arrives:</p>
            <ol class="list-decimal pl-5 space-y-1 text-sm">
              <li>Check for available rooms</li>
              <li>Assign the patient to an appropriate room</li>
              <li>Notify the doctor about the patient's arrival</li>
              <li>Update room status when the consultation is complete</li>
            </ol>
          </div>
        `,
      },
    ];
  }

  // Billing page tour
  if (pathname === '/dashboard/billing') {
    return [
      {
        intro: `
          <div class="space-y-2">
            <h3 class="text-lg font-semibold">Billing & Payments 💳</h3>
            <p>Process payments, create invoices, and manage billing records for patients.</p>
          </div>
        `,
      },
      {
        element: '[data-tour="create-invoice-btn"]',
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">Create Invoice</h4>
            <p>Click here to generate a new invoice for a patient. You can add consultation fees, procedures, and medications.</p>
          </div>
        `,
        position: 'left',
      },
      {
        element: '[data-tour="search-invoices"]',
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">Search Invoices</h4>
            <p>Find existing invoices by patient name or invoice number. Useful for processing delayed payments or printing duplicates.</p>
          </div>
        `,
        position: 'bottom',
      },
      {
        element: '[data-tour="invoices-table"]',
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">Invoice List</h4>
            <p>View all invoices with payment status:</p>
            <ul class="list-disc pl-5 space-y-1 text-sm">
              <li><strong class="text-green-600">Paid:</strong> Payment completed</li>
              <li><strong class="text-yellow-600">Pending:</strong> Payment not yet received</li>
              <li><strong class="text-red-600">Overdue:</strong> Payment delayed beyond due date</li>
            </ul>
          </div>
        `,
        position: 'top',
      },
      {
        intro: `
          <div class="space-y-2">
            <h4 class="font-semibold">Processing Payments</h4>
            <ol class="list-decimal pl-5 space-y-1 text-sm">
              <li>Select the invoice to process</li>
              <li>Verify the amount with the patient</li>
              <li>Choose payment mode (Cash, Card, UPI, etc.)</li>
              <li>Record partial payments if needed</li>
              <li>Print receipt and provide to patient</li>
            </ol>
            <p class="text-sm mt-2"><strong>💡 Important:</strong> Always reconcile payments at the end of your shift!</p>
          </div>
        `,
      },
    ];
  }

  // Default tour for other pages
  return [
    {
      intro: `
        <div class="space-y-2">
          <h3 class="text-lg font-semibold">Receptionist Tour</h3>
          <p>The guided tour is available on these pages:</p>
          <ul class="list-disc pl-5 space-y-1 text-sm">
            <li>Dashboard</li>
            <li>Appointments</li>
            <li>Patients</li>
            <li>Rooms</li>
            <li>Billing</li>
          </ul>
          <p class="mt-2">Navigate to any of these pages and click the help button to start the tour!</p>
        </div>
      `,
    },
  ];
}

/**
 * Receptionist Tour Component
 * 
 * Displays a help button that starts an interactive tour based on the current page.
 * Automatically shows the tour on first visit if autoStart is enabled.
 */
export function ReceptionistTour({ autoStart = false }: ReceptionistTourProps) {
  const pathname = usePathname();
  const [hasSeenTour, setHasSeenTour] = useState(true);
  
  const steps = getTourStepsForPage(pathname);
  
  const { start } = useIntroTour({
    steps,
    showProgress: true,
    showBullets: true,
    exitOnEsc: true,
    exitOnOverlayClick: true,
  });

  // Check if user has seen the tour before
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const tourKey = `tour-seen-receptionist-${pathname}`;
      const seen = localStorage.getItem(tourKey) === 'true';
      setHasSeenTour(seen);
      
      // Auto-start tour if enabled and not seen before
      if (autoStart && !seen) {
        // Small delay to ensure page is fully loaded
        const timer = setTimeout(() => {
          start();
          localStorage.setItem(tourKey, 'true');
        }, 1000);
        
        return () => clearTimeout(timer);
      }
    }
  }, [pathname, autoStart, start]);

  const handleStartTour = () => {
    start();
    if (typeof window !== 'undefined') {
      const tourKey = `tour-seen-receptionist-${pathname}`;
      localStorage.setItem(tourKey, 'true');
      setHasSeenTour(true);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleStartTour}
      className="flex items-center gap-2"
      data-tour="help-button"
    >
      <HelpCircle className="h-4 w-4" />
      <span className="hidden sm:inline">Start Tour</span>
    </Button>
  );
}

