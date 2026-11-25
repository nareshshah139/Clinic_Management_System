'use client';

import type { TourStep } from '@/hooks/useIntroTour';
import { COMPLETION_RULE } from '@/lib/visit-completion';
import { TourButton } from './TourButton';

export const DOCTOR_VISIT_TOUR: readonly TourStep[] = [
  {
    title: 'The visit screen',
    intro: 'A short walk around the parts of this screen you use in every visit. Next or the right arrow key moves on. Esc or Skip tour stops it.',
  },
  {
    element: '[data-tour="visit-bar"]',
    title: 'Patient and visit',
    intro: 'The patient, their allergies and history stay pinned here while you scroll. Allergies show in red. The consultation type is set here too.',
  },
  {
    element: '[data-tour="visit-save"]',
    title: 'Saving',
    intro: 'Your draft saves itself about 8 seconds after you stop typing, and this line says when it last saved. Save Draft (Ctrl+S, or Cmd+S on a Mac) saves now. The ⋯ menu lists every keyboard shortcut.',
  },
  {
    element: '[data-tour="visit-checklist"]',
    title: 'Completing the visit',
    intro: `${COMPLETION_RULE} Each item turns green once it is recorded, and then Complete Visit (Ctrl+Shift+S) is ready.`,
  },
  {
    element: '[data-tour="visit-tabs"]',
    title: 'Tabs',
    intro: 'Consultation is where you write the visit. Photos holds clinical photos, History the patient’s earlier visits, and Print setup the prescription paper layout.',
  },
  {
    element: '[data-tour="consult-clinical"]',
    title: 'Consultation, top to bottom',
    intro: 'Vitals come first, then complaints, diagnosis, history and examination, treatment, investigations and follow-up. On a wide screen the list on the left jumps to each section.',
    position: 'top',
  },
  {
    element: '[data-tour="consult-treatment"]',
    title: 'Medicines',
    intro: 'Add Row, type the medicine name and pick it, then set frequency, when, duration and instructions. Copy brings in the patient’s last prescription.',
    position: 'top',
  },
  {
    element: '[data-tour="rx-templates"]',
    title: 'Templates',
    intro: 'Load a template to fill the prescription in one step. Undo and Redo step through your edits, and the ⋯ menu saves the current prescription as a template.',
  },
  {
    element: '[data-tour="rx-actions"]',
    title: 'Print and pharmacy',
    intro: 'Print Preview shows the prescription as it will print. Create Prescription saves it to this visit. Once medicines are added, Go to Pharmacy opens a pharmacy bill with them.',
    position: 'top',
  },
  {
    element: 'section[aria-label="Voice bar"]',
    title: 'Voice bar',
    intro: 'Say or type what happened, such as the complaint and medicines. Press Speak, or Ctrl+/ to jump here. Tick the lines you want and press Add to form. Nothing is saved until you save the visit.',
    position: 'top',
  },
  {
    element: '[data-tour="help-button"]',
    title: 'Run it again',
    intro: 'Press Tour any time to see this again.',
  },
];

export function DoctorTour(_props: { autoStart?: false }) {
  return <TourButton steps={DOCTOR_VISIT_TOUR} label="Visit workflow tour">Tour</TourButton>;
}
