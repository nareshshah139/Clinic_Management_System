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

// Custom styles for enhanced tour tooltips
if (typeof window !== 'undefined') {
  const styleId = 'receptionist-tour-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Enhanced tooltip sizes */
      .introjs-tooltip.introjs-large-tooltip {
        max-width: 650px !important;
        min-width: 500px !important;
      }
      
      .introjs-tooltip.introjs-medium-tooltip {
        max-width: 450px !important;
        min-width: 350px !important;
      }
      
      /* Improved tooltip styling */
      .introjs-tooltip {
        border-radius: 12px !important;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15) !important;
        padding: 0 !important;
        overflow: hidden !important;
        max-height: 80vh !important;
      }
      .introjs-tooltiptext {
        overflow: auto !important;
        max-height: calc(80vh - 120px) !important; /* leave room for buttons */
        -webkit-overflow-scrolling: touch !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
      }
      
      /* Ensure tour overlay and tooltips are always above app UI */
      .introjs-overlay,
      .introjs-helperLayer,
      .introjs-tooltip {
        z-index: 2147483647 !important;
      }
      
      .introjs-tooltiptext {
        padding: 20px !important;
        font-size: 14px !important;
        line-height: 1.6 !important;
      }
      
      /* Button styling */
      .introjs-button {
        border-radius: 8px !important;
        padding: 10px 20px !important;
        font-weight: 600 !important;
        text-shadow: none !important;
        transition: all 0.2s !important;
        font-size: 14px !important;
        margin: 0 4px !important;
      }
      
      /* Button container */
      .introjs-tooltipbuttons {
        border-top: 1px solid #e5e7eb !important;
        padding: 16px 20px !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        gap: 8px !important;
        background-color: #fafafa !important;
        border-bottom-left-radius: 12px !important;
        border-bottom-right-radius: 12px !important;
        margin: 0 !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      
      .introjs-nextbutton {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
        border: none !important;
      }
      
      .introjs-nextbutton:hover {
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%) !important;
        transform: translateY(-1px) !important;
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4) !important;
      }
      
      .introjs-prevbutton {
        background: #f3f4f6 !important;
        color: #374151 !important;
        border: 1px solid #d1d5db !important;
      }
      
      .introjs-prevbutton:hover {
        background: #e5e7eb !important;
        transform: translateY(-1px) !important;
      }
      
      .introjs-skipbutton {
        background: #ef4444 !important;
        color: #ffffff !important;
        font-weight: 700 !important;
        border: 2px solid #ef4444 !important;
        border-radius: 50% !important;
        padding: 8px !important;
        width: 36px !important;
        height: 36px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: all 0.2s !important;
        text-shadow: none !important;
        font-size: 18px !important;
        cursor: pointer !important;
        position: static !important;
        margin: 0 4px !important;
        white-space: nowrap !important;
        min-width: unset !important;
      }
      
      .introjs-skipbutton:hover {
        background: #dc2626 !important;
        color: #ffffff !important;
        transform: translateY(-1px) scale(1.05) !important;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.5) !important;
        border-color: #dc2626 !important;
      }
      
      .introjs-skipbutton:before {
        content: "✕" !important;
        font-weight: 700 !important;
        font-size: 20px !important;
      }
      
      /* Button navigation wrapper */
      .introjs-tooltipbuttons::after {
        content: none !important;
      }
      
      .introjs-tooltipbuttons > a,
      .introjs-tooltipbuttons > button {
        position: static !important;
        float: none !important;
      }
      
      /* Ensure no overflow from buttons */
      .introjs-tooltip * {
        box-sizing: border-box !important;
      }
      
      /* Progress bar */
      .introjs-progress {
        background-color: #e5e7eb !important;
      }
      
      .introjs-progressbar {
        background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%) !important;
      }
      
      /* Bullets */
      .introjs-bullets ul li a {
        width: 10px !important;
        height: 10px !important;
        background: #d1d5db !important;
      }
      
      .introjs-bullets ul li a.active {
        background: #3b82f6 !important;
        width: 24px !important;
        border-radius: 5px !important;
      }
      
      /* Overlay */
      .introjs-overlay {
        background-color: rgba(0, 0, 0, 0.7) !important;
      }
      
      /* Highlighted element */
      .introjs-helperLayer {
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.7), 0 0 20px rgba(59, 130, 246, 0.5) !important;
        border-radius: 8px !important;
      }
      
      /* Arrow styling */
      .introjs-arrow {
        border-width: 8px !important;
      }
      
      /* Responsive adjustments */
      @media (max-width: 768px) {
        .introjs-tooltip { max-width: 92vw !important; min-width: auto !important; }
        .introjs-tooltip.introjs-large-tooltip,
        .introjs-tooltip.introjs-medium-tooltip { max-width: 92vw !important; min-width: auto !important; }
        
        .introjs-tooltiptext {
          padding: 15px !important;
          font-size: 13px !important;
        }
        
        .introjs-tooltipbuttons {
          flex-wrap: wrap !important;
          padding: 12px 15px !important;
          width: 100% !important;
          margin: 0 !important;
        }
        
        .introjs-button {
          padding: 8px 16px !important;
          font-size: 13px !important;
          margin: 4px 2px !important;
          max-width: calc(50% - 8px) !important;
        }
        
        .introjs-skipbutton {
          order: -1 !important;
          flex: 1 1 100% !important;
          margin: 0 0 8px 0 !important;
          max-width: 100% !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

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
          <div class="space-y-3 p-1">
            <div class="flex items-center gap-2">
              <span class="text-3xl">📅</span>
              <h3 class="text-xl font-bold text-blue-600">Welcome to Appointment Management!</h3>
            </div>
            <p class="text-base leading-relaxed">
              As a receptionist, booking and managing appointments is your core responsibility. 
              This tour will walk you through a <strong>real-world workflow</strong> - from booking 
              a new patient to handling last-minute changes.
            </p>
            <div class="bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
              <p class="text-sm text-blue-900">
                <strong>📚 What you'll learn:</strong> Doctor selection, date navigation, booking appointments, 
                managing schedules, and handling common scenarios.
              </p>
            </div>
          </div>
        `,
        tooltipClass: 'introjs-large-tooltip',
      },
      {
        element: '[data-tour="doctor-select"]',
        intro: `
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <span class="text-2xl">👨‍⚕️</span>
              <h4 class="text-lg font-semibold">Step 1: Select a Doctor</h4>
            </div>
            <p class="text-sm leading-relaxed">
              <strong>Start here every time!</strong> Choose which doctor's schedule you want to view and manage.
            </p>
            <div class="bg-amber-50 border-l-4 border-amber-500 p-3 rounded text-sm">
              <p class="font-semibold text-amber-900 mb-1">💡 Pro Tip:</p>
              <p class="text-amber-800">
                The system remembers your last selected doctor, so you don't have to re-select 
                on every visit. Great for front desk staff assigned to specific doctors!
              </p>
            </div>
            <div class="text-xs text-gray-600 mt-2 p-2 bg-gray-50 rounded">
              <strong>Try it:</strong> Click the dropdown to see all available doctors
            </div>
          </div>
        `,
        position: 'bottom',
        tooltipClass: 'introjs-medium-tooltip',
      },
      {
        element: '[data-tour="date-picker"]',
        intro: `
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <span class="text-2xl">📆</span>
              <h4 class="text-lg font-semibold">Step 2: Choose the Date</h4>
            </div>
            <p class="text-sm leading-relaxed">
              Select which day's appointments you want to view or manage. 
              <strong>Today's date is selected by default</strong> when you start your shift.
            </p>
            <div class="space-y-2 text-sm mt-3">
              <div class="flex items-start gap-2">
                <span class="text-green-600 font-bold">✓</span>
                <div>
                  <strong>Same-day appointments:</strong> Keep today's date selected
                </div>
              </div>
              <div class="flex items-start gap-2">
                <span class="text-blue-600 font-bold">✓</span>
                <div>
                  <strong>Future bookings:</strong> Pick any upcoming date (up to 3 months ahead)
                </div>
              </div>
              <div class="flex items-start gap-2">
                <span class="text-purple-600 font-bold">✓</span>
                <div>
                  <strong>Rescheduling:</strong> Change dates to find available slots
                </div>
              </div>
            </div>
            <div class="text-xs text-gray-600 mt-2 p-2 bg-gray-50 rounded">
              <strong>Quick tip:</strong> Use keyboard to type dates faster (YYYY-MM-DD format)
            </div>
          </div>
        `,
        position: 'bottom',
        tooltipClass: 'introjs-medium-tooltip',
      },
      {
        element: '[data-tour="view-tabs"]',
        intro: `
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <span class="text-2xl">👁️</span>
              <h4 class="text-lg font-semibold">Step 3: Choose Your View</h4>
            </div>
            <p class="text-sm leading-relaxed mb-3">
              Two powerful ways to visualize and manage appointments:
            </p>
            
            <div class="grid gap-3">
              <div class="bg-gradient-to-r from-blue-50 to-blue-100 p-3 rounded-lg border border-blue-200">
                <div class="flex items-center gap-2 mb-2">
                  <div class="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-white text-xs font-bold">C</div>
                  <strong class="text-blue-900">Calendar View</strong>
                  <span class="ml-auto text-xs bg-blue-600 text-white px-2 py-1 rounded">Recommended</span>
                </div>
                <ul class="text-xs text-blue-900 space-y-1 ml-8">
                  <li>• Visual timeline of the entire day</li>
                  <li>• See appointment gaps at a glance</li>
                  <li>• Drag to select custom time ranges</li>
                  <li>• Perfect for busy days</li>
                </ul>
              </div>
              
              <div class="bg-gradient-to-r from-green-50 to-green-100 p-3 rounded-lg border border-green-200">
                <div class="flex items-center gap-2 mb-2">
                  <div class="w-6 h-6 bg-green-600 rounded flex items-center justify-center text-white text-xs font-bold">S</div>
                  <strong class="text-green-900">Slots View</strong>
                </div>
                <ul class="text-xs text-green-900 space-y-1 ml-8">
                  <li>• Traditional time slot grid</li>
                  <li>• Quick 15-minute increments</li>
                  <li>• Familiar booking interface</li>
                  <li>• Great for quick bookings</li>
                </ul>
              </div>
            </div>
            
            <div class="bg-purple-50 border-l-4 border-purple-500 p-3 rounded text-xs mt-3">
              <strong class="text-purple-900">💡 When to use what:</strong>
              <p class="text-purple-800 mt-1">
                Use <strong>Calendar</strong> when the schedule is complex or you need to see the big picture. 
                Use <strong>Slots</strong> for straightforward, quick bookings.
              </p>
            </div>
          </div>
        `,
        position: 'bottom',
        tooltipClass: 'introjs-large-tooltip',
      },
      {
        intro: `
          <div class="space-y-3 p-1">
            <div class="flex items-center gap-2">
              <span class="text-3xl">➕</span>
              <h3 class="text-xl font-bold text-green-600">Booking a New Appointment</h3>
            </div>
            
            <div class="bg-gradient-to-br from-green-50 to-blue-50 p-4 rounded-lg border-2 border-green-200">
              <p class="font-semibold text-green-900 mb-3">Follow these steps in order:</p>
              
              <div class="space-y-3">
                <div class="flex gap-3">
                  <div class="flex-shrink-0 w-7 h-7 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</div>
                  <div class="flex-1">
                    <p class="font-semibold text-sm text-gray-900">Search for Patient</p>
                    <p class="text-xs text-gray-700 mt-1">
                      Look at the top of the calendar. Type patient's name or phone number in the search box.
                      <span class="block mt-1 text-green-700 font-medium">
                        → New patient? Click "Add Patient" button first
                      </span>
                    </p>
                  </div>
                </div>
                
                <div class="flex gap-3">
                  <div class="flex-shrink-0 w-7 h-7 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</div>
                  <div class="flex-1">
                    <p class="font-semibold text-sm text-gray-900">Select the Patient</p>
                    <p class="text-xs text-gray-700 mt-1">
                      Click on the patient from the search results. Their name will appear in a blue badge.
                    </p>
                  </div>
                </div>
                
                <div class="flex gap-3">
                  <div class="flex-shrink-0 w-7 h-7 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</div>
                  <div class="flex-1">
                    <p class="font-semibold text-sm text-gray-900">Click Available Time Slot</p>
                    <p class="text-xs text-gray-700 mt-1">
                      Click any <strong>empty white time slot</strong> in the calendar grid.
                      <span class="block mt-1 text-blue-700 font-medium">
                        → Advanced: Drag across multiple slots for longer appointments
                      </span>
                    </p>
                  </div>
                </div>
                
                <div class="flex gap-3">
                  <div class="flex-shrink-0 w-7 h-7 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">4</div>
                  <div class="flex-1">
                    <p class="font-semibold text-sm text-gray-900">Configure & Confirm</p>
                    <p class="text-xs text-gray-700 mt-1">
                      A dialog opens → Choose duration (15/30/45/60/90 min) → Add notes if needed → Click "Book Appointment"
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="bg-yellow-50 border-l-4 border-yellow-500 p-3 rounded text-sm">
              <p class="font-semibold text-yellow-900">⚡ Speed Booking Shortcut:</p>
              <p class="text-yellow-800 text-xs mt-1">
                Most appointments are 30 minutes. Select patient → click slot → press Enter. 
                The system auto-selects 30-min duration!
              </p>
            </div>
          </div>
        `,
        tooltipClass: 'introjs-large-tooltip',
      },
      {
        intro: `
          <div class="space-y-3 p-1">
            <div class="flex items-center gap-2">
              <span class="text-3xl">🎨</span>
              <h3 class="text-xl font-bold text-indigo-600">Understanding Appointment Colors</h3>
            </div>
            
            <p class="text-sm text-gray-700 leading-relaxed">
              Appointments in the calendar are color-coded by <strong>visit type</strong>, 
              not by status. This helps you quickly identify different types of consultations at a glance.
            </p>
            
            <div class="space-y-2 mt-3">
              <div class="flex items-center gap-3 p-3 rounded-lg" style="background-color: rgba(219, 234, 254, 0.5); border-left: 4px solid #3b82f6;">
                <div class="w-12 h-12 rounded-lg shadow-md flex items-center justify-center font-bold text-sm" 
                     style="background-color: rgba(219, 234, 254, 0.95); color: #1e40af;">OPD</div>
                <div class="flex-1">
                  <p class="font-bold text-blue-900">OPD Consultations (Light Blue)</p>
                  <p class="text-xs text-blue-800">Standard outpatient appointments for regular consultations</p>
                </div>
              </div>
              
              <div class="flex items-center gap-3 p-3 rounded-lg" style="background-color: rgba(237, 233, 254, 0.5); border-left: 4px solid #a855f7;">
                <div class="w-12 h-12 rounded-lg shadow-md flex items-center justify-center font-bold text-xs"
                     style="background-color: rgba(237, 233, 254, 0.95); color: #6b21a8;">PROC</div>
                <div class="flex-1">
                  <p class="font-bold text-purple-900">Procedures (Light Purple)</p>
                  <p class="text-xs text-purple-800">Clinical procedures, treatments, laser sessions, and aesthetic services</p>
                </div>
              </div>
              
              <div class="flex items-center gap-3 p-3 rounded-lg" style="background-color: rgba(243, 244, 246, 0.8); border-left: 4px solid #9ca3af;">
                <div class="w-12 h-12 rounded-lg shadow-md flex items-center justify-center font-bold text-xs"
                     style="background-color: rgba(243, 244, 246, 0.95); color: #374151;">TELE</div>
                <div class="flex-1">
                  <p class="font-bold text-gray-900">Telemedicine (Light Gray)</p>
                  <p class="text-xs text-gray-800">Virtual consultations via phone or video call</p>
                </div>
              </div>
              
              <div class="flex items-center gap-3 p-3 rounded-lg" style="background-color: rgba(226, 232, 240, 0.5); border-left: 4px solid #94a3b8;">
                <div class="w-12 h-12 rounded-lg shadow-md flex items-center justify-center font-bold text-xl"
                     style="background-color: rgba(226, 232, 240, 0.95); color: #475569;">✓</div>
                <div class="flex-1">
                  <p class="font-bold text-slate-900">Completed (Lighter Gray)</p>
                  <p class="text-xs text-slate-800">Doctor finished consultation - ready for billing</p>
                  <p class="text-xs text-slate-700 mt-1 font-medium">→ Your action: Process payment if not done yet</p>
                </div>
              </div>
              
              <div class="flex items-center gap-3 p-3 rounded-lg" style="background-color: rgba(34, 197, 94, 0.15); border-left: 4px solid #22c55e;">
                <div class="w-12 h-12 rounded-lg shadow-md flex items-center justify-center text-white font-bold text-xl"
                     style="background-color: #22c55e;">★</div>
                <div class="flex-1">
                  <p class="font-bold text-green-900">Newly Booked (Green Highlight)</p>
                  <p class="text-xs text-green-800">Just booked in the last few seconds - temporary visual feedback</p>
                </div>
              </div>
              
              <div class="flex items-center gap-3 p-3 rounded-lg" style="background-color: rgba(251, 191, 36, 0.15); border-left: 4px solid #fbbf24;">
                <div class="w-12 h-12 rounded-lg shadow-md flex items-center justify-center text-white font-bold text-lg"
                     style="background-color: #fbbf24;">⏳</div>
                <div class="flex-1">
                  <p class="font-bold text-amber-900">Booking In Progress (Yellow)</p>
                  <p class="text-xs text-amber-800">Someone is currently booking this slot - wait for it to complete</p>
                </div>
              </div>
            </div>
            
            <div class="p-3 rounded-lg text-xs mt-3" style="background-color: rgba(219, 234, 254, 0.5); border: 1px solid #93c5fd;">
              <p class="font-semibold text-blue-900 mb-1">ℹ️ Viewing Appointment Status:</p>
              <p class="text-blue-800">
                To see if a patient is <strong>SCHEDULED, CHECKED-IN, or IN-PROGRESS</strong>, 
                <strong>double-click the appointment</strong> to open the details dialog. 
                The status is shown as text in the dialog.
              </p>
            </div>
            
            <div class="p-3 rounded-lg text-xs mt-2" style="background-color: rgba(237, 233, 254, 0.5); border: 1px solid #d8b4fe;">
              <p class="font-semibold text-purple-900 mb-1">🔍 Finding the Legend:</p>
              <p class="text-purple-800">
                The calendar page shows a color legend at the top explaining all colors. 
                Refer to it anytime you need a reminder of what each color means!
              </p>
            </div>
            
            <div class="p-3 rounded-lg text-xs mt-2" style="background-color: rgba(251, 191, 36, 0.15); border: 1px solid #fcd34d;">
              <p class="font-semibold text-amber-900 mb-1">💡 Pro Tip:</p>
              <p class="text-amber-800">
                <strong>Past appointments</strong> show in even lighter shades. 
                <strong>Cancelled appointments</strong> don't appear in the calendar at all - 
                they're filtered out to keep the view clean!
              </p>
            </div>
          </div>
        `,
        tooltipClass: 'introjs-large-tooltip',
      },
      {
        intro: `
          <div class="space-y-3 p-1">
            <div class="flex items-center gap-2">
              <span class="text-3xl">✏️</span>
              <h3 class="text-xl font-bold text-orange-600">Modifying Appointments</h3>
            </div>
            
            <p class="text-sm text-gray-700 leading-relaxed mb-3">
              Patients call to reschedule or cancel? No problem! Here's how to manage changes:
            </p>
            
            <div class="bg-orange-50 p-4 rounded-lg border-2 border-orange-200">
              <p class="font-semibold text-orange-900 mb-3 flex items-center gap-2">
                <span class="text-lg">👆</span> Interacting with Appointments:
              </p>
              
              <div class="space-y-3 text-sm">
                <div class="bg-white p-3 rounded border-l-4 border-orange-400">
                  <p class="font-bold text-gray-900 mb-1">
                    <span class="bg-orange-200 px-2 py-1 rounded text-xs mr-2">SINGLE CLICK</span>
                    Select Appointment
                  </p>
                  <p class="text-xs text-gray-700">
                    Highlights the appointment. Shows quick info in a side panel (if available).
                  </p>
                </div>
                
                <div class="bg-white p-3 rounded border-l-4 border-orange-600">
                  <p class="font-bold text-gray-900 mb-1">
                    <span class="bg-orange-400 text-white px-2 py-1 rounded text-xs mr-2">DOUBLE CLICK</span>
                    Open Full Details
                  </p>
                  <p class="text-xs text-gray-700 mb-2">
                    Opens a dialog with complete appointment information and action buttons.
                  </p>
                  <div class="bg-orange-50 p-2 rounded text-xs mt-2">
                    <p class="font-semibold text-orange-900 mb-1">Available actions:</p>
                    <ul class="space-y-1 text-orange-800 ml-3">
                      <li>• <strong>Edit:</strong> Change time, duration, or notes</li>
                      <li>• <strong>Reschedule:</strong> Move to different date/time</li>
                      <li>• <strong>Check-in:</strong> Mark patient as arrived</li>
                      <li>• <strong>Cancel:</strong> Cancel with reason</li>
                      <li>• <strong>Complete:</strong> Mark consultation done</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="bg-gradient-to-r from-pink-50 to-purple-50 p-3 rounded-lg border border-pink-200 text-sm mt-3">
              <p class="font-bold text-pink-900 mb-2">📞 Common Receptionist Scenarios:</p>
              <div class="space-y-2 text-xs">
                <div class="flex gap-2">
                  <span class="text-pink-600 font-bold">1.</span>
                  <p class="text-pink-900">
                    <strong>"Patient running 15 mins late"</strong> → Double-click → Edit → Adjust time by 15 min
                  </p>
                </div>
                <div class="flex gap-2">
                  <span class="text-purple-600 font-bold">2.</span>
                  <p class="text-purple-900">
                    <strong>"Patient wants to reschedule"</strong> → Double-click → Reschedule → Pick new date/time
                  </p>
                </div>
                <div class="flex gap-2">
                  <span class="text-blue-600 font-bold">3.</span>
                  <p class="text-blue-900">
                    <strong>"Patient just walked in"</strong> → Double-click → Check-in button → Assign room
                  </p>
                </div>
                <div class="flex gap-2">
                  <span class="text-red-600 font-bold">4.</span>
                  <p class="text-red-900">
                    <strong>"Patient no-show"</strong> → Double-click → Cancel → Select reason "No-show"
                  </p>
                </div>
              </div>
            </div>
          </div>
        `,
        tooltipClass: 'introjs-large-tooltip',
      },
      {
        intro: `
          <div class="space-y-3 p-1">
            <div class="flex items-center gap-2">
              <span class="text-3xl">🚀</span>
              <h3 class="text-xl font-bold text-teal-600">Pro Tips & Time Savers</h3>
            </div>
            
            <p class="text-sm text-gray-700 mb-3">
              Master these techniques to work faster and more efficiently:
            </p>
            
            <div class="space-y-3">
              <div class="bg-gradient-to-r from-teal-50 to-cyan-50 p-3 rounded-lg border-l-4 border-teal-500">
                <div class="flex items-start gap-2">
                  <span class="text-2xl">🖱️</span>
                  <div class="flex-1">
                    <p class="font-bold text-teal-900 text-sm">Drag to Select Time Range</p>
                    <p class="text-xs text-teal-800 mt-1">
                      In Calendar view, <strong>click and drag</strong> across multiple time slots to book longer appointments. 
                      Perfect for initial consultations or procedures!
                    </p>
                  </div>
                </div>
              </div>
              
              <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-lg border-l-4 border-blue-500">
                <div class="flex items-start gap-2">
                  <span class="text-2xl">💾</span>
                  <div class="flex-1">
                    <p class="font-bold text-blue-900 text-sm">Auto-Save Your Preferences</p>
                    <p class="text-xs text-blue-800 mt-1">
                      The system remembers your last selected doctor and date. When you return, you'll be right where you left off!
                    </p>
                  </div>
                </div>
              </div>
              
              <div class="bg-gradient-to-r from-purple-50 to-pink-50 p-3 rounded-lg border-l-4 border-purple-500">
                <div class="flex items-start gap-2">
                  <span class="text-2xl">⏰</span>
                  <div class="flex-1">
                    <p class="font-bold text-purple-900 text-sm">Smart Slot Detection</p>
                    <p class="text-xs text-purple-800 mt-1">
                      The calendar automatically finds 15-minute slots even in larger grid views. No need to zoom in - just click where you want to book!
                    </p>
                  </div>
                </div>
              </div>
              
              <div class="bg-gradient-to-r from-amber-50 to-orange-50 p-3 rounded-lg border-l-4 border-amber-500">
                <div class="flex items-start gap-2">
                  <span class="text-2xl">🔍</span>
                  <div class="flex-1">
                    <p class="font-bold text-amber-900 text-sm">Quick Patient Search</p>
                    <p class="text-xs text-amber-800 mt-1">
                      Type just <strong>3-4 letters</strong> of a name or <strong>last 4 digits</strong> of phone number. 
                      The smart search finds patients instantly!
                    </p>
                  </div>
                </div>
              </div>
              
              <div class="bg-gradient-to-r from-green-50 to-emerald-50 p-3 rounded-lg border-l-4 border-green-500">
                <div class="flex items-start gap-2">
                  <span class="text-2xl">📋</span>
                  <div class="flex-1">
                    <p class="font-bold text-green-900 text-sm">Batch Operations</p>
                    <p class="text-xs text-green-800 mt-1">
                      Checking in multiple patients? Keep the appointment details dialog open and use keyboard shortcuts (Enter to confirm, Esc to close).
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="bg-gradient-to-br from-rose-100 via-purple-100 to-blue-100 p-4 rounded-lg border-2 border-purple-300 mt-4">
              <p class="font-bold text-purple-900 text-center mb-2 flex items-center justify-center gap-2">
                <span class="text-xl">⭐</span>
                <span>Golden Rule for Busy Days</span>
                <span class="text-xl">⭐</span>
              </p>
              <p class="text-sm text-purple-900 text-center leading-relaxed">
                Use <strong>Calendar View</strong> during peak hours to see the big picture. 
                Switch to <strong>Slots View</strong> during quiet times for quick bookings. 
                The "Quick Guide" button (Info icon) is always there if you need a refresher!
              </p>
            </div>
          </div>
        `,
        tooltipClass: 'introjs-large-tooltip',
      },
      {
        intro: `
          <div class="space-y-4 p-1">
            <div class="flex items-center gap-2 justify-center">
              <span class="text-4xl">🎉</span>
              <h3 class="text-2xl font-bold text-green-600">You're All Set!</h3>
              <span class="text-4xl">🎉</span>
            </div>
            
            <div class="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-xl border-2 border-green-300">
              <p class="text-base text-gray-800 text-center leading-relaxed mb-3">
                You now know everything you need to <strong>efficiently manage appointments</strong> like a pro! 
              </p>
              
              <div class="bg-white p-4 rounded-lg shadow-sm">
                <p class="font-bold text-green-900 mb-2 text-center">📚 Quick Recap:</p>
                <div class="grid grid-cols-2 gap-3 text-xs">
                  <div class="text-center p-2 bg-green-50 rounded">
                    <div class="font-bold text-green-900">✓ Doctor & Date</div>
                    <div class="text-green-700">Always select first</div>
                  </div>
                  <div class="text-center p-2 bg-blue-50 rounded">
                    <div class="font-bold text-blue-900">✓ Search Patient</div>
                    <div class="text-blue-700">Before clicking slots</div>
                  </div>
                  <div class="text-center p-2 bg-purple-50 rounded">
                    <div class="font-bold text-purple-900">✓ Click Slot</div>
                    <div class="text-purple-700">Or drag for longer</div>
                  </div>
                  <div class="text-center p-2 bg-orange-50 rounded">
                    <div class="font-bold text-orange-900">✓ Double-Click</div>
                    <div class="text-orange-700">To modify existing</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="bg-blue-600 text-white p-4 rounded-lg text-center">
              <p class="font-semibold mb-2">Need Help Later?</p>
              <p class="text-sm">
                Click the <strong>"Start Tour"</strong> button in the top-right corner anytime to replay this guide!
              </p>
            </div>
            
            <div class="text-center text-sm text-gray-600">
              <p>Happy scheduling! 😊</p>
            </div>
          </div>
        `,
        tooltipClass: 'introjs-large-tooltip',
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
    skipLabel: '',
    doneLabel: 'Finish',
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


