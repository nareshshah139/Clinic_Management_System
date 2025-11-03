/**
 * Doctor Workflow Tour Component
 * 
 * Provides a comprehensive guided tour for doctor users covering the complete
 * medical visit workflow from vitals to prescription to completion.
 * 
 * @module DoctorTour
 */

'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { HelpCircle } from 'lucide-react';
import { useIntroTour, type TourStep } from '@/hooks/useIntroTour';
import 'intro.js/introjs.css';

// Function to inject custom styles for tour tooltips
function injectTourStyles() {
  if (typeof window === 'undefined') return;
  
  const styleId = 'doctor-tour-styles';
  if (document.getElementById(styleId)) return; // Already injected
  
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
        background: linear-gradient(90deg, #10b981 0%, #3b82f6 100%) !important;
      }
      
      /* Bullets */
      .introjs-bullets ul li a {
        width: 10px !important;
        height: 10px !important;
        background: #d1d5db !important;
      }
      
      .introjs-bullets ul li a.active {
        background: #10b981 !important;
        width: 24px !important;
        border-radius: 5px !important;
      }
      
      /* Overlay */
      .introjs-overlay {
        background-color: rgba(0, 0, 0, 0.7) !important;
      }
      
      /* Highlighted element */
      .introjs-helperLayer {
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.7), 0 0 20px rgba(16, 185, 129, 0.5) !important;
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

interface DoctorTourProps {
  /** Whether to auto-start the tour on first visit */
  autoStart?: boolean;
}

/**
 * Get tour steps for the doctor visit workflow
 * This covers the complete workflow from start to finish
 */
function getDoctorVisitTourSteps(): TourStep[] {
  return [
    {
      intro: `
        <div class="space-y-3 p-1">
          <div class="flex items-center gap-2">
            <span class="text-3xl">👨‍⚕️</span>
            <h3 class="text-xl font-bold text-blue-600">Welcome to the Doctor Visit Workflow!</h3>
          </div>
          <p class="text-base leading-relaxed">
            This comprehensive tour will guide you through the complete medical visit workflow,
            from reviewing patient information to creating prescriptions and completing the visit.
          </p>
          <div class="bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
            <p class="text-sm text-blue-900">
              <strong>📚 What you'll learn:</strong> Patient context, vital signs, clinical documentation,
              SOAP notes, prescription builder, photos, labs, and visit completion.
            </p>
          </div>
          <div class="bg-green-50 border-l-4 border-green-500 p-3 rounded text-sm mt-2">
            <p class="text-green-900">
              <strong>⏱️ Estimated time:</strong> 5-7 minutes. You can exit and restart anytime!
            </p>
          </div>
        </div>
      `,
      tooltipClass: 'introjs-large-tooltip',
    },
    {
      intro: `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-2xl">🎯</span>
            <h4 class="text-lg font-semibold">The Patient Visit Lifecycle</h4>
          </div>
          <p class="text-sm leading-relaxed mb-3">
            Every medical visit follows a structured workflow to ensure comprehensive care and documentation:
          </p>
          
          <div class="space-y-2">
            <div class="flex gap-3 items-start p-2 bg-blue-50 rounded">
              <div class="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</div>
              <div class="flex-1">
                <p class="font-semibold text-sm text-blue-900">Review Patient Context</p>
                <p class="text-xs text-blue-800">Check patient history, allergies, and previous visits</p>
              </div>
            </div>
            
            <div class="flex gap-3 items-start p-2 bg-green-50 rounded">
              <div class="flex-shrink-0 w-7 h-7 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</div>
              <div class="flex-1">
                <p class="font-semibold text-sm text-green-900">Review Vitals & Photos</p>
                <p class="text-xs text-green-800">Check vital signs and clinical photos taken by staff</p>
              </div>
            </div>
            
            <div class="flex gap-3 items-start p-2 bg-purple-50 rounded">
              <div class="flex-shrink-0 w-7 h-7 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</div>
              <div class="flex-1">
                <p class="font-semibold text-sm text-purple-900">Document Visit (SOAP)</p>
                <p class="text-xs text-purple-800">Complete clinical documentation using SOAP format</p>
              </div>
            </div>
            
            <div class="flex gap-3 items-start p-2 bg-orange-50 rounded">
              <div class="flex-shrink-0 w-7 h-7 bg-orange-600 text-white rounded-full flex items-center justify-center font-bold text-sm">4</div>
              <div class="flex-1">
                <p class="font-semibold text-sm text-orange-900">Create Prescription</p>
                <p class="text-xs text-orange-800">Add medications, instructions, and follow-up plans</p>
              </div>
            </div>
            
            <div class="flex gap-3 items-start p-2 bg-red-50 rounded">
              <div class="flex-shrink-0 w-7 h-7 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm">5</div>
              <div class="flex-1">
                <p class="font-semibold text-sm text-red-900">Complete Visit</p>
                <p class="text-xs text-red-800">Save, review, and mark the visit as complete</p>
              </div>
            </div>
          </div>
          
          <div class="bg-amber-50 border-l-4 border-amber-500 p-3 rounded text-xs mt-3">
            <p class="font-semibold text-amber-900 mb-1">💡 Pro Tip:</p>
            <p class="text-amber-800">
              The system auto-saves your work as you go, so you can safely pause and resume at any time!
            </p>
          </div>
        </div>
      `,
      tooltipClass: 'introjs-large-tooltip',
    },
    {
      intro: `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-2xl">👤</span>
            <h4 class="text-lg font-semibold">Step 1: Patient Context Panel</h4>
          </div>
          <p class="text-sm leading-relaxed mb-3">
            <strong>Always start here!</strong> The patient context panel shows critical information
            you need before examining the patient.
          </p>
          
          <div class="space-y-2">
            <div class="bg-blue-50 p-3 rounded border-l-4 border-blue-500">
              <p class="font-semibold text-sm text-blue-900 mb-1">📋 Key Information:</p>
              <ul class="text-xs text-blue-800 space-y-1 ml-3">
                <li>• Patient demographics (name, age, gender)</li>
                <li>• Contact information</li>
                <li>• <strong class="text-red-700">⚠️ Allergies (if any)</strong></li>
                <li>• Medical history summary</li>
                <li>• Insurance/payment status</li>
              </ul>
            </div>
            
            <div class="bg-green-50 p-3 rounded border-l-4 border-green-500">
              <p class="font-semibold text-sm text-green-900 mb-1">📅 Recent Visits:</p>
              <p class="text-xs text-green-800">
                See the patient's last 2-3 visits with dates, diagnoses, and quick access
                to previous prescriptions and notes.
              </p>
            </div>
          </div>
          
          <div class="bg-red-50 border-l-4 border-red-500 p-3 rounded text-sm mt-3">
            <p class="font-semibold text-red-900">⚠️ Safety First:</p>
            <p class="text-xs text-red-800 mt-1">
              <strong>Always check for allergies</strong> before prescribing any medication. 
              Allergies are highlighted in red at the top of the patient context.
            </p>
          </div>
          
          <div class="text-xs text-gray-600 p-2 bg-gray-50 rounded">
            <strong>Quick tip:</strong> Click on any previous visit to view complete details in a popup.
          </div>
        </div>
      `,
      tooltipClass: 'introjs-large-tooltip',
    },
    {
      intro: `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-2xl">🗂️</span>
            <h4 class="text-lg font-semibold">Step 2: Navigation Tabs</h4>
          </div>
          <p class="text-sm leading-relaxed mb-3">
            The visit form is organized into tabs for efficient workflow. Each tab focuses on
            a specific aspect of the clinical encounter.
          </p>
          
          <div class="grid gap-2">
            <div class="flex items-center gap-3 p-2 bg-blue-50 rounded border-l-4 border-blue-500">
              <div class="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white text-xs font-bold">👁️</div>
              <div class="flex-1">
                <p class="font-semibold text-sm text-blue-900">Overview</p>
                <p class="text-xs text-blue-800">Visit summary and quick access to all sections</p>
              </div>
            </div>
            
            <div class="flex items-center gap-3 p-2 bg-green-50 rounded border-l-4 border-green-500">
              <div class="w-8 h-8 bg-green-600 rounded flex items-center justify-center text-white text-xs font-bold">🩺</div>
              <div class="flex-1">
                <p class="font-semibold text-sm text-green-900">Vitals</p>
                <p class="text-xs text-green-800">BP, HR, temperature, weight (often pre-filled by nurse)</p>
              </div>
            </div>
            
            <div class="flex items-center gap-3 p-2 bg-purple-50 rounded border-l-4 border-purple-500">
              <div class="w-8 h-8 bg-purple-600 rounded flex items-center justify-center text-white text-xs font-bold">📷</div>
              <div class="flex-1">
                <p class="font-semibold text-sm text-purple-900">Photos</p>
                <p class="text-xs text-purple-800">Clinical photos for documentation and comparison</p>
              </div>
            </div>
            
            <div class="flex items-center gap-3 p-2 bg-orange-50 rounded border-l-4 border-orange-500">
              <div class="w-8 h-8 bg-orange-600 rounded flex items-center justify-center text-white text-xs font-bold">📋</div>
              <div class="flex-1">
                <p class="font-semibold text-sm text-orange-900">Prescription ⭐</p>
                <p class="text-xs text-orange-800">Complete clinical documentation + medications (main tab)</p>
              </div>
            </div>
            
            <div class="flex items-center gap-3 p-2 bg-indigo-50 rounded border-l-4 border-indigo-500">
              <div class="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white text-xs font-bold">🧪</div>
              <div class="flex-1">
                <p class="font-semibold text-sm text-indigo-900">Lab Tests</p>
                <p class="text-xs text-indigo-800">Order labs and review results</p>
              </div>
            </div>
            
            <div class="flex items-center gap-3 p-2 bg-gray-50 rounded border-l-4 border-gray-500">
              <div class="w-8 h-8 bg-gray-600 rounded flex items-center justify-center text-white text-xs font-bold">📜</div>
              <div class="flex-1">
                <p class="font-semibold text-sm text-gray-900">History</p>
                <p class="text-xs text-gray-800">Previous visits, trends, and patient timeline</p>
              </div>
            </div>
          </div>
          
          <div class="bg-amber-50 border-l-4 border-amber-500 p-3 rounded text-xs mt-3">
            <p class="font-semibold text-amber-900 mb-1">✨ Green Indicator:</p>
            <p class="text-amber-800">
              A green dot appears on tabs when that section is complete. This helps track your progress!
            </p>
          </div>
        </div>
      `,
      tooltipClass: 'introjs-large-tooltip',
    },
    {
      intro: `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-2xl">🩺</span>
            <h4 class="text-lg font-semibold">Step 3: Vitals Tab</h4>
          </div>
          <p class="text-sm leading-relaxed mb-3">
            The Vitals tab displays essential vital signs. In most workflows, your nurse or
            medical assistant will have already filled this in before you see the patient.
          </p>
          
          <div class="space-y-2">
            <div class="bg-blue-50 p-3 rounded">
              <p class="font-semibold text-sm text-blue-900 mb-2">Standard Vitals Captured:</p>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="flex items-center gap-2">
                  <span class="text-red-600">❤️</span>
                  <span class="text-blue-800"><strong>Blood Pressure</strong> (systolic/diastolic)</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-pink-600">💗</span>
                  <span class="text-blue-800"><strong>Heart Rate</strong> (bpm)</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-orange-600">🌡️</span>
                  <span class="text-blue-800"><strong>Temperature</strong> (°F or °C)</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-green-600">⚖️</span>
                  <span class="text-blue-800"><strong>Weight</strong> (kg or lbs)</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-purple-600">📏</span>
                  <span class="text-blue-800"><strong>Height</strong> (cm or inches)</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-blue-600">🫁</span>
                  <span class="text-blue-800"><strong>Oxygen Saturation</strong> (SpO2)</span>
                </div>
              </div>
            </div>
            
            <div class="bg-green-50 p-3 rounded border-l-4 border-green-500">
              <p class="font-semibold text-sm text-green-900 mb-1">📊 Automatic Calculations:</p>
              <p class="text-xs text-green-800">
                The system automatically calculates BMI from height and weight, and flags
                abnormal values (high BP, fever, etc.) for your attention.
              </p>
            </div>
          </div>
          
          <div class="bg-yellow-50 border-l-4 border-yellow-500 p-3 rounded text-xs mt-2">
            <p class="font-semibold text-yellow-900">💡 Quick Review:</p>
            <p class="text-yellow-800 mt-1">
              Even if vitals are pre-filled, <strong>always review them</strong> before proceeding.
              Look for any red flags or abnormal values that need immediate attention.
            </p>
          </div>
        </div>
      `,
      tooltipClass: 'introjs-large-tooltip',
    },
    {
      intro: `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-2xl">📷</span>
            <h4 class="text-lg font-semibold">Step 4: Photos Tab</h4>
          </div>
          <p class="text-sm leading-relaxed mb-3">
            Clinical photography is essential for dermatology and aesthetic procedures.
            This tab helps you capture, organize, and compare patient photos over time.
          </p>
          
          <div class="space-y-2">
            <div class="bg-purple-50 p-3 rounded border-l-4 border-purple-500">
              <p class="font-semibold text-sm text-purple-900 mb-2">📸 Photo Capabilities:</p>
              <ul class="text-xs text-purple-800 space-y-1 ml-3">
                <li>• <strong>Capture photos</strong> directly from camera or upload files</li>
                <li>• <strong>Categorize photos</strong> (before/after, specific body areas)</li>
                <li>• <strong>Add annotations</strong> and notes to each photo</li>
                <li>• <strong>Compare with previous visits</strong> side-by-side</li>
                <li>• <strong>Include in prescription</strong> printout for patient records</li>
              </ul>
            </div>
            
            <div class="bg-blue-50 p-3 rounded border-l-4 border-blue-500">
              <p class="font-semibold text-sm text-blue-900 mb-1">🎯 Best Practices:</p>
              <ul class="text-xs text-blue-800 space-y-1 ml-3">
                <li>• Use consistent lighting and angles for comparison photos</li>
                <li>• Take before photos <strong>before any procedure</strong></li>
                <li>• Label photos clearly (e.g., "Face - Front View", "Lesion - Close-up")</li>
                <li>• For procedures, capture immediate after photos</li>
              </ul>
            </div>
          </div>
          
          <div class="bg-green-50 p-3 rounded text-xs mt-2">
            <p class="font-semibold text-green-900 mb-1">✨ Time-Saving Tip:</p>
            <p class="text-green-800">
              Your staff can pre-load photos before you enter. Just review, annotate, and
              add any additional angles you need during the examination.
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
            <span class="text-3xl">📋</span>
            <h3 class="text-xl font-bold text-orange-600">Step 5: Prescription Tab (The Core!)</h3>
          </div>
          <p class="text-base leading-relaxed mb-3">
            This is where you'll spend most of your time. The Prescription tab combines
            <strong>clinical documentation (SOAP notes)</strong> with <strong>prescription builder</strong>
            in one seamless interface.
          </p>
          
          <div class="bg-gradient-to-br from-orange-50 to-amber-50 p-4 rounded-lg border-2 border-orange-200">
            <p class="font-semibold text-orange-900 mb-3">The SOAP Framework:</p>
            
            <div class="space-y-2">
              <div class="flex gap-2 items-start p-2 bg-white rounded border-l-4 border-blue-500">
                <div class="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-[10px]">S</div>
                <div class="flex-1">
                  <p class="font-bold text-sm text-gray-900">Subjective</p>
                  <p class="text-xs text-gray-700">
                    <strong>Chief Complaints:</strong> What the patient tells you. 
                    Their symptoms, concerns, history of present illness.
                  </p>
                  <p class="text-[11px] text-blue-700 mt-1">
                    💡 "Patient reports acne breakouts for 3 months, worse on cheeks"
                  </p>
                </div>
              </div>
              
              <div class="flex gap-2 items-start p-2 bg-white rounded border-l-4 border-green-500">
                <div class="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-[10px]">O</div>
                <div class="flex-1">
                  <p class="font-bold text-sm text-gray-900">Objective</p>
                  <p class="text-xs text-gray-700">
                    <strong>On Examination:</strong> What you observe and measure.
                    Physical findings, test results, clinical observations.
                  </p>
                  <p class="text-[11px] text-green-700 mt-1">
                    💡 "Multiple comedones and papules on bilateral cheeks, no scarring"
                  </p>
                </div>
              </div>
              
              <div class="flex gap-2 items-start p-2 bg-white rounded border-l-4 border-purple-500">
                <div class="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-[10px]">A</div>
                <div class="flex-1">
                  <p class="font-bold text-sm text-gray-900">Assessment</p>
                  <p class="text-xs text-gray-700">
                    <strong>Diagnosis:</strong> Your clinical impression based on S + O.
                    Primary diagnosis and any differential diagnoses.
                  </p>
                  <p class="text-[11px] text-purple-700 mt-1">
                    💡 "Acne vulgaris, Grade 2 (moderate)"
                  </p>
                </div>
              </div>
              
              <div class="flex gap-2 items-start p-2 bg-white rounded border-l-4 border-orange-500">
                <div class="flex-shrink-0 w-6 h-6 bg-orange-600 text-white rounded-full flex items-center justify-center font-bold text-[10px]">P</div>
                <div class="flex-1">
                  <p class="font-bold text-sm text-gray-900">Plan</p>
                  <p class="text-xs text-gray-700">
                    <strong>Treatment Plan:</strong> Medications, procedures, follow-up.
                    Everything the patient needs to do next.
                  </p>
                  <p class="text-[11px] text-orange-700 mt-1">
                    💡 "Topical retinoid, benzoyl peroxide, follow-up in 6 weeks"
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <div class="bg-blue-50 border-l-4 border-blue-500 p-3 rounded text-sm">
            <p class="font-semibold text-blue-900 mb-1">⚡ Smart Features:</p>
            <ul class="text-xs text-blue-800 space-y-1">
              <li>• <strong>Voice transcription:</strong> Dictate notes hands-free</li>
              <li>• <strong>Auto-save:</strong> Never lose your work</li>
              <li>• <strong>Templates:</strong> Quick-fill common diagnoses and plans</li>
              <li>• <strong>Drug database:</strong> Smart search for medications</li>
            </ul>
          </div>
        </div>
      `,
      tooltipClass: 'introjs-large-tooltip',
    },
    {
      intro: `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-2xl">💊</span>
            <h4 class="text-lg font-semibold">Step 6: Adding Medications</h4>
          </div>
          <p class="text-sm leading-relaxed mb-3">
            Within the Prescription tab, you'll build the actual prescription with medications,
            dosages, and instructions. The system makes this fast and error-free.
          </p>
          
          <div class="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border-2 border-blue-200">
            <p class="font-semibold text-blue-900 mb-3">Adding a Medication (4 Quick Steps):</p>
            
            <div class="space-y-2">
              <div class="flex gap-2">
                <div class="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs">1</div>
                <div class="flex-1">
                  <p class="font-semibold text-sm text-gray-900">Search Drug Name</p>
                  <p class="text-xs text-gray-700">
                    Type the medication name. Smart search shows matching drugs instantly.
                    <span class="block text-blue-700 mt-1">→ Generic or brand name both work!</span>
                  </p>
                </div>
              </div>
              
              <div class="flex gap-2">
                <div class="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs">2</div>
                <div class="flex-1">
                  <p class="font-semibold text-sm text-gray-900">Set Dosage & Frequency</p>
                  <p class="text-xs text-gray-700">
                    Specify dose (e.g., 10 mg), frequency (twice daily), and duration (14 days).
                    <span class="block text-blue-700 mt-1">→ Common presets available for quick selection</span>
                  </p>
                </div>
              </div>
              
              <div class="flex gap-2">
                <div class="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs">3</div>
                <div class="flex-1">
                  <p class="font-semibold text-sm text-gray-900">Add Instructions</p>
                  <p class="text-xs text-gray-700">
                    Patient-friendly instructions like "Take with food" or "Apply after washing face".
                    <span class="block text-blue-700 mt-1">→ Templates available for common instructions</span>
                  </p>
                </div>
              </div>
              
              <div class="flex gap-2">
                <div class="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs">4</div>
                <div class="flex-1">
                  <p class="font-semibold text-sm text-gray-900">Review & Add</p>
                  <p class="text-xs text-gray-700">
                    The drug appears in your prescription list. Repeat for all medications!
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <div class="space-y-2 mt-3">
            <div class="bg-green-50 p-2 rounded text-xs border-l-4 border-green-500">
              <p class="font-semibold text-green-900">✅ Safety Features:</p>
              <p class="text-green-800">System checks for drug interactions and alerts if patient has allergies</p>
            </div>
            
            <div class="bg-purple-50 p-2 rounded text-xs border-l-4 border-purple-500">
              <p class="font-semibold text-purple-900">📋 Multi-Language:</p>
              <p class="text-purple-800">Print prescriptions in English, Hindi, or Telugu for patient comfort</p>
            </div>
          </div>
        </div>
      `,
      tooltipClass: 'introjs-large-tooltip',
    },
    {
      intro: `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-2xl">🌡️</span>
            <h4 class="text-lg font-semibold">Step 7: Dermatology-Specific Features</h4>
          </div>
          <p class="text-sm leading-relaxed mb-3">
            For skin-related visits, the Prescription tab includes specialized dermatology
            assessment tools to document skin conditions thoroughly.
          </p>
          
          <div class="space-y-2">
            <div class="bg-purple-50 p-3 rounded border-l-4 border-purple-500">
              <p class="font-semibold text-sm text-purple-900 mb-2">🔬 Dermatology Exam Fields:</p>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="space-y-1">
                  <p class="text-purple-800"><strong>• Skin Type</strong> (Fitzpatrick I-VI)</p>
                  <p class="text-purple-800"><strong>• Morphology</strong> (macule, papule, etc.)</p>
                  <p class="text-purple-800"><strong>• Distribution</strong> (face, trunk, limbs)</p>
                </div>
                <div class="space-y-1">
                  <p class="text-purple-800"><strong>• Acne Severity</strong> (Grade 1-4)</p>
                  <p class="text-purple-800"><strong>• Itch Score</strong> (0-10 scale)</p>
                  <p class="text-purple-800"><strong>• Common Diagnoses</strong> (quick-select)</p>
                </div>
              </div>
            </div>
            
            <div class="bg-blue-50 p-3 rounded border-l-4 border-blue-500">
              <p class="font-semibold text-sm text-blue-900 mb-1">🎯 Procedure Documentation:</p>
              <p class="text-xs text-blue-800">
                For laser treatments, chemical peels, or other procedures, document specific
                parameters like fluence, wavelength, spot size, and number of passes.
              </p>
            </div>
            
            <div class="bg-orange-50 p-3 rounded border-l-4 border-orange-500">
              <p class="font-semibold text-sm text-orange-900 mb-1">📋 Topical Application Details:</p>
              <p class="text-xs text-orange-800">
                For topical treatments, specify application site, day part (morning/evening),
                leave-on time, and washing instructions.
              </p>
            </div>
          </div>
          
          <div class="bg-amber-50 border-l-4 border-amber-500 p-3 rounded text-xs mt-2">
            <p class="font-semibold text-amber-900">💡 Optional but Valuable:</p>
            <p class="text-amber-800 mt-1">
              These fields are optional, but filling them creates a detailed record that helps
              track treatment progress and makes future follow-ups much easier!
            </p>
          </div>
        </div>
      `,
      tooltipClass: 'introjs-large-tooltip',
    },
    {
      intro: `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-2xl">🧪</span>
            <h4 class="text-lg font-semibold">Step 8: Lab Tests Tab</h4>
          </div>
          <p class="text-sm leading-relaxed mb-3">
            Order laboratory tests and record results all in one place. The system helps you
            track pending tests and flag abnormal results.
          </p>
          
          <div class="space-y-2">
            <div class="bg-indigo-50 p-3 rounded border-l-4 border-indigo-500">
              <p class="font-semibold text-sm text-indigo-900 mb-2">🔬 Lab Capabilities:</p>
              <ul class="text-xs text-indigo-800 space-y-1 ml-3">
                <li>• <strong>Order tests:</strong> Common panels (CBC, LFT, lipid panel, etc.)</li>
                <li>• <strong>Record results:</strong> Enter lab values when reports arrive</li>
                <li>• <strong>Track status:</strong> Pending, completed, or reviewed</li>
                <li>• <strong>Flag abnormals:</strong> System highlights out-of-range values</li>
                <li>• <strong>Historical trends:</strong> Compare results with previous tests</li>
              </ul>
            </div>
            
            <div class="bg-green-50 p-3 rounded border-l-4 border-green-500">
              <p class="font-semibold text-sm text-green-900 mb-1">📋 Common Lab Panels:</p>
              <div class="grid grid-cols-2 gap-1 text-xs text-green-800 mt-2">
                <p>• Complete Blood Count (CBC)</p>
                <p>• Liver Function Tests (LFT)</p>
                <p>• Kidney Function (RFT)</p>
                <p>• Lipid Profile</p>
                <p>• Thyroid Panel (T3, T4, TSH)</p>
                <p>• HbA1c (Diabetes)</p>
                <p>• Vitamin D, B12</p>
                <p>• Custom tests</p>
              </div>
            </div>
          </div>
          
          <div class="bg-yellow-50 border-l-4 border-yellow-500 p-3 rounded text-xs mt-2">
            <p class="font-semibold text-yellow-900">💡 Best Practice:</p>
            <p class="text-yellow-800 mt-1">
              Order labs at the end of the visit if needed for diagnosis or monitoring.
              The system can print lab requisition forms along with the prescription.
            </p>
          </div>
        </div>
      `,
      tooltipClass: 'introjs-large-tooltip',
    },
    {
      intro: `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-2xl">📜</span>
            <h4 class="text-lg font-semibold">Step 9: Patient History Tab</h4>
          </div>
          <p class="text-sm leading-relaxed mb-3">
            The History tab gives you a complete timeline of the patient's visits, treatments,
            and progress. Essential for continuity of care!
          </p>
          
          <div class="space-y-2">
            <div class="bg-gray-50 p-3 rounded border-l-4 border-gray-500">
              <p class="font-semibold text-sm text-gray-900 mb-2">📅 What You'll See:</p>
              <ul class="text-xs text-gray-700 space-y-1 ml-3">
                <li>• <strong>Visit timeline:</strong> All previous visits in chronological order</li>
                <li>• <strong>Diagnoses history:</strong> Track condition progression</li>
                <li>• <strong>Treatment history:</strong> What medications were prescribed when</li>
                <li>• <strong>Procedure history:</strong> Past treatments and their outcomes</li>
                <li>• <strong>Photo comparisons:</strong> Before/after across multiple visits</li>
              </ul>
            </div>
            
            <div class="bg-blue-50 p-3 rounded border-l-4 border-blue-500">
              <p class="font-semibold text-sm text-blue-900 mb-1">🔍 Quick Actions:</p>
              <p class="text-xs text-blue-800">
                Click any historical visit to view full details. Use "Copy from previous visit"
                to quickly populate common fields for follow-up visits.
              </p>
            </div>
          </div>
          
          <div class="bg-green-50 border-l-4 border-green-500 p-3 rounded text-xs mt-2">
            <p class="font-semibold text-green-900">✨ Time-Saver:</p>
            <p class="text-green-800 mt-1">
              For follow-up visits, reference the history tab to see what was prescribed last time
              and what the patient's response was. Helps maintain treatment continuity!
            </p>
          </div>
        </div>
      `,
      tooltipClass: 'introjs-large-tooltip',
    },
    {
      intro: `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-2xl">💾</span>
            <h4 class="text-lg font-semibold">Step 10: Saving Your Work</h4>
          </div>
          <p class="text-sm leading-relaxed mb-3">
            The system provides multiple ways to save and manage your clinical documentation.
            Understanding these options helps you work efficiently!
          </p>
          
          <div class="space-y-2">
            <div class="bg-green-50 p-3 rounded border-l-4 border-green-500">
              <p class="font-semibold text-sm text-green-900 mb-2">💾 Save Options:</p>
              
              <div class="space-y-2">
                <div class="bg-white p-2 rounded border-l-2 border-green-400">
                  <p class="font-bold text-xs text-gray-900">Auto-Save (Automatic)</p>
                  <p class="text-xs text-gray-700 mt-1">
                    The system saves your work every 30 seconds as you type. You'll see
                    "Saved" indicator at the top. <strong>No action needed!</strong>
                  </p>
                </div>
                
                <div class="bg-white p-2 rounded border-l-2 border-blue-400">
                  <p class="font-bold text-xs text-gray-900">Manual Save (Draft)</p>
                  <p class="text-xs text-gray-700 mt-1">
                    Click "Save Draft" to immediately save your current work. Use this when
                    you need to step away mid-visit. Visit status stays "In Progress".
                  </p>
                </div>
                
                <div class="bg-white p-2 rounded border-l-2 border-orange-400">
                  <p class="font-bold text-xs text-gray-900">Complete Visit</p>
                  <p class="text-xs text-gray-700 mt-1">
                    Click "Complete Visit" when done. This marks the visit as finished,
                    updates the appointment status, and makes it ready for billing.
                  </p>
                </div>
              </div>
            </div>
            
            <div class="bg-blue-50 p-3 rounded border-l-4 border-blue-500">
              <p class="font-semibold text-sm text-blue-900 mb-1">📱 Status Indicator:</p>
              <p class="text-xs text-blue-800">
                Watch the top-right corner for save status:
                <span class="block mt-1">
                  <strong>Saving...</strong> → Work in progress<br/>
                  <strong>Saved</strong> → All changes saved<br/>
                  <strong>Error</strong> → Network issue, retry needed
                </span>
              </p>
            </div>
          </div>
          
          <div class="bg-amber-50 border-l-4 border-amber-500 p-3 rounded text-xs mt-2">
            <p class="font-semibold text-amber-900">⚡ Pro Tip:</p>
            <p class="text-amber-800 mt-1">
              You can safely switch between tabs or even close the browser - your draft is saved!
              Come back anytime to resume where you left off.
            </p>
          </div>
        </div>
      `,
      tooltipClass: 'introjs-large-tooltip',
    },
    {
      intro: `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-2xl">🖨️</span>
            <h4 class="text-lg font-semibold">Step 11: Preview & Print Prescription</h4>
          </div>
          <p class="text-sm leading-relaxed mb-3">
            Before completing the visit, preview the prescription to ensure everything looks
            perfect for the patient. The system offers powerful print customization!
          </p>
          
          <div class="space-y-2">
            <div class="bg-blue-50 p-3 rounded border-l-4 border-blue-500">
              <p class="font-semibold text-sm text-blue-900 mb-2">🎨 Print Features:</p>
              <ul class="text-xs text-blue-800 space-y-1 ml-3">
                <li>• <strong>Live preview:</strong> See exactly how it will print</li>
                <li>• <strong>Custom letterhead:</strong> Upload your clinic logo/header</li>
                <li>• <strong>Multi-language:</strong> English, Hindi, or Telugu</li>
                <li>• <strong>Adjustable margins:</strong> Perfect for pre-printed prescription pads</li>
                <li>• <strong>Include/exclude sections:</strong> Hide sensitive info if needed</li>
                <li>• <strong>Multiple copies:</strong> Patient copy, file copy, pharmacy copy</li>
              </ul>
            </div>
            
            <div class="bg-purple-50 p-3 rounded border-l-4 border-purple-500">
              <p class="font-semibold text-sm text-purple-900 mb-1">📋 What Gets Printed:</p>
              <div class="grid grid-cols-2 gap-1 text-xs text-purple-800 mt-2">
                <p>✓ Patient demographics</p>
                <p>✓ Visit date & doctor name</p>
                <p>✓ Chief complaints</p>
                <p>✓ Diagnosis</p>
                <p>✓ Medications list</p>
                <p>✓ Dosage instructions</p>
                <p>✓ Follow-up date</p>
                <p>✓ Doctor signature (if uploaded)</p>
              </div>
            </div>
            
            <div class="bg-green-50 p-3 rounded border-l-4 border-green-500">
              <p class="font-semibold text-sm text-green-900 mb-1">🎯 Customization Tab:</p>
              <p class="text-xs text-green-800">
                Go to the "Customization" tab to set up your prescription template once.
                Settings are saved per-doctor, so you only configure it once!
              </p>
            </div>
          </div>
          
          <div class="bg-orange-50 border-l-4 border-orange-500 p-3 rounded text-xs mt-2">
            <p class="font-semibold text-orange-900">💡 Best Practice:</p>
            <p class="text-orange-800 mt-1">
              Always click "Preview" before printing to catch any typos or formatting issues.
              Patients appreciate clean, professional prescriptions!
            </p>
          </div>
        </div>
      `,
      tooltipClass: 'introjs-large-tooltip',
    },
    {
      intro: `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-2xl">✅</span>
            <h4 class="text-lg font-semibold">Step 12: Completing the Visit</h4>
          </div>
          <p class="text-sm leading-relaxed mb-3">
            Once you've documented everything and printed the prescription, it's time to
            mark the visit as complete. This updates the system and triggers billing.
          </p>
          
          <div class="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-lg border-2 border-green-200">
            <p class="font-semibold text-green-900 mb-3">Completing Visit Checklist:</p>
            
            <div class="space-y-2">
              <div class="flex items-start gap-2">
                <div class="flex-shrink-0 w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs">✓</div>
                <p class="text-xs text-green-900">
                  <strong>All key sections filled:</strong> Chief complaints, diagnosis, and at least
                  one medication (or explanation why no Rx needed)
                </p>
              </div>
              
              <div class="flex items-start gap-2">
                <div class="flex-shrink-0 w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs">✓</div>
                <p class="text-xs text-green-900">
                  <strong>Follow-up date set:</strong> When should the patient return?
                </p>
              </div>
              
              <div class="flex items-start gap-2">
                <div class="flex-shrink-0 w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs">✓</div>
                <p class="text-xs text-green-900">
                  <strong>Prescription printed:</strong> Patient has their copy
                </p>
              </div>
              
              <div class="flex items-start gap-2">
                <div class="flex-shrink-0 w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs">✓</div>
                <p class="text-xs text-green-900">
                  <strong>Patient counseled:</strong> Instructions given verbally
                </p>
              </div>
            </div>
          </div>
          
          <div class="space-y-2 mt-3">
            <div class="bg-blue-50 p-3 rounded border-l-4 border-blue-500">
              <p class="font-semibold text-sm text-blue-900 mb-1">🔄 What Happens Next:</p>
              <ol class="text-xs text-blue-800 space-y-1 ml-4 list-decimal">
                <li>Visit status changes to "Completed"</li>
                <li>Appointment status updates to "Completed"</li>
                <li>Billing team gets notified to process payment</li>
                <li>Patient moves out of waiting room queue</li>
                <li>Visit is locked (prevents accidental changes)</li>
              </ol>
            </div>
            
            <div class="bg-purple-50 p-3 rounded border-l-4 border-purple-500">
              <p class="font-semibold text-sm text-purple-900 mb-1">🔓 Need to Edit Later?</p>
              <p class="text-xs text-purple-800">
                Completed visits can be reopened if you need to add or correct something.
                Just click "Edit Visit" from the visit history.
              </p>
            </div>
          </div>
        </div>
      `,
      tooltipClass: 'introjs-large-tooltip',
    },
    {
      intro: `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-2xl">🎤</span>
            <h4 class="text-lg font-semibold">Pro Feature: Voice Transcription</h4>
          </div>
          <p class="text-sm leading-relaxed mb-3">
            Speed up documentation with voice-to-text! Dictate your clinical notes hands-free
            while examining the patient or immediately after the consultation.
          </p>
          
          <div class="space-y-2">
            <div class="bg-indigo-50 p-3 rounded border-l-4 border-indigo-500">
              <p class="font-semibold text-sm text-indigo-900 mb-2">🎙️ How It Works:</p>
              <ol class="text-xs text-indigo-800 space-y-1 ml-4 list-decimal">
                <li>Look for the microphone icon in any text field (Chief Complaints, Objective, etc.)</li>
                <li>Click the mic to start recording your voice</li>
                <li>Speak naturally - the AI transcribes in real-time</li>
                <li>Click again to stop. Text appears in the field automatically!</li>
              </ol>
            </div>
            
            <div class="bg-green-50 p-3 rounded border-l-4 border-green-500">
              <p class="font-semibold text-sm text-green-900 mb-1">✨ Smart Features:</p>
              <ul class="text-xs text-green-800 space-y-1 ml-3">
                <li>• <strong>Medical terminology:</strong> Recognizes clinical terms accurately</li>
                <li>• <strong>Auto-punctuation:</strong> Adds periods, commas automatically</li>
                <li>• <strong>Edit after:</strong> Clean up any errors after transcription</li>
                <li>• <strong>Multiple languages:</strong> Supports English, Hindi (coming soon)</li>
              </ul>
            </div>
          </div>
          
          <div class="bg-amber-50 border-l-4 border-amber-500 p-3 rounded text-xs mt-2">
            <p class="font-semibold text-amber-900">💡 Best Use Cases:</p>
            <div class="space-y-1 mt-1 text-amber-800">
              <p>• <strong>Chief Complaints:</strong> "Patient complains of severe acne on face for past 3 months"</p>
              <p>• <strong>Objective:</strong> "On examination bilateral cheeks show multiple comedones and papules"</p>
              <p>• <strong>Plan:</strong> "Advised topical retinoid nightly and benzoyl peroxide wash morning"</p>
            </div>
          </div>
        </div>
      `,
      tooltipClass: 'introjs-large-tooltip',
    },
    {
      intro: `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-2xl">⚡</span>
            <h4 class="text-lg font-semibold">Keyboard Shortcuts & Speed Tips</h4>
          </div>
          <p class="text-sm leading-relaxed mb-3">
            Master these shortcuts to work faster and see more patients without compromising
            documentation quality!
          </p>
          
          <div class="space-y-2">
            <div class="bg-gray-50 p-3 rounded border-l-4 border-gray-500">
              <p class="font-semibold text-sm text-gray-900 mb-2">⌨️ Essential Shortcuts:</p>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="bg-white p-2 rounded border">
                  <p class="font-mono text-blue-600 font-bold">Ctrl/Cmd + S</p>
                  <p class="text-gray-700 mt-1">Quick save draft</p>
                </div>
                <div class="bg-white p-2 rounded border">
                  <p class="font-mono text-blue-600 font-bold">Tab</p>
                  <p class="text-gray-700 mt-1">Move between fields</p>
                </div>
                <div class="bg-white p-2 rounded border">
                  <p class="font-mono text-blue-600 font-bold">Ctrl/Cmd + P</p>
                  <p class="text-gray-700 mt-1">Preview prescription</p>
                </div>
                <div class="bg-white p-2 rounded border">
                  <p class="font-mono text-blue-600 font-bold">Ctrl/Cmd + Enter</p>
                  <p class="text-gray-700 mt-1">Complete visit</p>
                </div>
              </div>
            </div>
            
            <div class="bg-blue-50 p-3 rounded border-l-4 border-blue-500">
              <p class="font-semibold text-sm text-blue-900 mb-2">🚀 Speed Tips:</p>
              <ul class="text-xs text-blue-800 space-y-1 ml-3">
                <li>• Use <strong>common diagnosis shortcuts</strong> (type "acne" → selects from list)</li>
                <li>• <strong>Copy from last visit</strong> for follow-ups (one click)</li>
                <li>• Set up <strong>favorite medications</strong> for quick prescription</li>
                <li>• Use <strong>templates</strong> for common conditions</li>
                <li>• <strong>Batch similar visits</strong> (e.g., all follow-ups together)</li>
              </ul>
            </div>
            
            <div class="bg-green-50 p-3 rounded border-l-4 border-green-500">
              <p class="font-semibold text-sm text-green-900 mb-1">📊 Workflow Optimization:</p>
              <p class="text-xs text-green-800">
                Most doctors complete a routine follow-up visit in <strong>3-5 minutes</strong> and
                a new patient visit in <strong>8-12 minutes</strong> once familiar with the system!
              </p>
            </div>
          </div>
        </div>
      `,
      tooltipClass: 'introjs-large-tooltip',
    },
    {
      intro: `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-2xl">🔒</span>
            <h4 class="text-lg font-semibold">Data Safety & Compliance</h4>
          </div>
          <p class="text-sm leading-relaxed mb-3">
            Your clinical documentation is protected with enterprise-grade security and
            complies with medical record regulations.
          </p>
          
          <div class="space-y-2">
            <div class="bg-blue-50 p-3 rounded border-l-4 border-blue-500">
              <p class="font-semibold text-sm text-blue-900 mb-2">🔐 Security Features:</p>
              <ul class="text-xs text-blue-800 space-y-1 ml-3">
                <li>• <strong>Encrypted storage:</strong> All data encrypted at rest and in transit</li>
                <li>• <strong>Audit logs:</strong> Every access and edit is logged with timestamp</li>
                <li>• <strong>Role-based access:</strong> Staff can only see what they need</li>
                <li>• <strong>Automatic backups:</strong> Daily backups to prevent data loss</li>
                <li>• <strong>HIPAA-aligned:</strong> Follows international medical privacy standards</li>
              </ul>
            </div>
            
            <div class="bg-purple-50 p-3 rounded border-l-4 border-purple-500">
              <p class="font-semibold text-sm text-purple-900 mb-1">📋 Legal Compliance:</p>
              <p class="text-xs text-purple-800">
                All prescriptions include legally required fields (doctor registration number,
                clinic address, date/time) and are stored for the mandated 3-year minimum period.
              </p>
            </div>
            
            <div class="bg-green-50 p-3 rounded border-l-4 border-green-500">
              <p class="font-semibold text-sm text-green-900 mb-1">🔄 Version Control:</p>
              <p class="text-xs text-green-800">
                If you edit a completed visit, the system keeps both versions so you can see
                what changed and when. Full audit trail maintained.
              </p>
            </div>
          </div>
          
          <div class="bg-gray-50 p-2 rounded text-xs mt-2">
            <p class="text-gray-700">
              <strong>Note:</strong> Your clinic admin controls user access and can generate audit
              reports anytime for compliance reviews.
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
            <h3 class="text-2xl font-bold text-green-600">You're Ready to Go!</h3>
            <span class="text-4xl">🎉</span>
          </div>
          
          <div class="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-xl border-2 border-green-300">
            <p class="text-base text-gray-800 text-center leading-relaxed mb-3">
              You now have a complete understanding of the doctor visit workflow!
              From patient context to prescription to completion, you're equipped to
              provide excellent care with efficient documentation.
            </p>
            
            <div class="bg-white p-4 rounded-lg shadow-sm">
              <p class="font-bold text-green-900 mb-3 text-center">📚 Quick Workflow Recap:</p>
              <div class="grid grid-cols-3 gap-2 text-xs">
                <div class="text-center p-2 bg-blue-50 rounded">
                  <div class="font-bold text-blue-900">1️⃣ Patient Context</div>
                  <div class="text-blue-700">Review history & allergies</div>
                </div>
                <div class="text-center p-2 bg-green-50 rounded">
                  <div class="font-bold text-green-900">2️⃣ Vitals & Photos</div>
                  <div class="text-green-700">Check pre-filled data</div>
                </div>
                <div class="text-center p-2 bg-purple-50 rounded">
                  <div class="font-bold text-purple-900">3️⃣ SOAP Notes</div>
                  <div class="text-purple-700">Document S-O-A-P</div>
                </div>
                <div class="text-center p-2 bg-orange-50 rounded">
                  <div class="font-bold text-orange-900">4️⃣ Prescription</div>
                  <div class="text-orange-700">Add medications</div>
                </div>
                <div class="text-center p-2 bg-pink-50 rounded">
                  <div class="font-bold text-pink-900">5️⃣ Print & Review</div>
                  <div class="text-pink-700">Preview before patient</div>
                </div>
                <div class="text-center p-2 bg-red-50 rounded">
                  <div class="font-bold text-red-900">6️⃣ Complete</div>
                  <div class="text-red-700">Mark as done</div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="space-y-2">
            <div class="bg-blue-50 p-3 rounded border-l-4 border-blue-500">
              <p class="font-semibold text-blue-900 mb-1">⚡ Remember:</p>
              <p class="text-sm text-blue-800">
                Auto-save protects your work. Take your time, be thorough, and the system
                will help you be both efficient and comprehensive!
              </p>
            </div>
            
            <div class="bg-purple-600 text-white p-4 rounded-lg text-center">
              <p class="font-semibold mb-2">Need Help Later?</p>
              <p class="text-sm">
                Click the <strong>"Start Tour"</strong> button anytime to replay this guide!
                Or check the help section for quick reference guides.
              </p>
            </div>
          </div>
          
          <div class="text-center">
            <p class="text-lg font-semibold text-gray-700">Happy Doctoring! 🩺</p>
            <p class="text-sm text-gray-600 mt-1">
              Focus on your patients - we've got the paperwork covered.
            </p>
          </div>
        </div>
      `,
      tooltipClass: 'introjs-large-tooltip',
    },
  ];
}

/**
 * Doctor Tour Component
 * 
 * Displays a help button that starts an interactive tour for the doctor visit workflow.
 * Can be configured to auto-start on first visit.
 */
export function DoctorTour({ autoStart = false }: DoctorTourProps) {
  const pathname = usePathname();
  const [hasSeenTour, setHasSeenTour] = useState(true);
  
  const steps = getDoctorVisitTourSteps();
  
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
      const tourKey = `tour-seen-doctor-visits`;
      const seen = localStorage.getItem(tourKey) === 'true';
      setHasSeenTour(seen);
      
      // Auto-start tour if enabled and not seen before
      if (autoStart && !seen) {
        // Small delay to ensure page is fully loaded
        const timer = setTimeout(() => {
          injectTourStyles();
          start();
          localStorage.setItem(tourKey, 'true');
        }, 1500);
        
        return () => clearTimeout(timer);
      }
    }
  }, [pathname, autoStart, start]);

  const handleStartTour = () => {
    // Inject styles before starting tour
    injectTourStyles();
    
    start();
    if (typeof window !== 'undefined') {
      const tourKey = `tour-seen-doctor-visits`;
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
      <span className="hidden sm:inline">Visit Workflow Tour</span>
      <span className="sm:hidden">Tour</span>
    </Button>
  );
}

