# Receptionist Tour Implementation Guide

## Overview

A comprehensive guided tour system has been implemented using Intro.js for Receptionist users. The tour provides context-aware, interactive guidance across all key workflows and features accessible to receptionists.

## Features Implemented

### 1. **Intro.js Integration**

**Packages Installed:**
- `intro.js` - Core tour library
- `@types/intro.js` - TypeScript definitions

**Custom Hook Created:**
- `frontend/src/hooks/useIntroTour.ts`
  - Manages Intro.js lifecycle
  - Handles dynamic imports to avoid SSR issues
  - Provides configurable tour options
  - Supports custom step definitions with HTML content

### 2. **Receptionist Tour Component**

**Component:** `frontend/src/components/tours/ReceptionistTour.tsx`

**Features:**
- **Context-Aware Tours:** Different tour content based on current page
- **Auto-Start Capability:** Optional first-time tour on page visit
- **Persistent Tour State:** Tracks which tours have been viewed using localStorage
- **Rich Content:** HTML-formatted tour steps with lists, colors, and formatting

**Tours Available:**

#### a. Dashboard Tour (`/dashboard`)
- Welcome message
- Navigation sidebar overview
- System statistics explanation
- Today's appointments section

#### b. Appointments Tour (`/dashboard/appointments`)
- Doctor selection control
- Date picker functionality
- Calendar vs Slots view toggle
- Creating appointments workflow
- Managing appointments (single-click, double-click)
- Appointment status color codes

#### c. Patients Tour (`/dashboard/patients`)
- Adding new patients
- Search functionality
- Patient list navigation
- Patient profile access
- Pro tips for patient management

#### d. Rooms Tour (`/dashboard/rooms`)
- Room calendar overview
- Room availability checking
- Room assignment workflow
- Patient check-in process

#### e. Billing Tour (`/dashboard/billing`)
- Creating invoices
- Searching invoices
- Invoice list overview
- Payment status understanding
- Processing payments workflow
- End-of-shift reconciliation reminder

### 3. **UI Integration**

**Header Component** (`frontend/src/components/layout/header.tsx`)
- Added "Start Tour" button for RECEPTION role users
- Button appears in the header toolbar
- Accessible from any page
- Styled consistently with existing UI

**Data Tour Attributes Added:**

#### Dashboard Page (`/dashboard/page.tsx`)
- `data-tour="sidebar"` - Navigation sidebar
- `data-tour="dashboard-stats"` - Statistics cards
- `data-tour="appointments-list"` - Today's appointments

#### Appointments Page (`/dashboard/appointments/page.tsx`)
- `data-tour="doctor-select"` - Doctor selection dropdown
- `data-tour="date-picker"` - Date selection input
- `data-tour="view-tabs"` - Calendar/Slots tabs

#### Patients Page (`/components/patients/PatientsManagement.tsx`)
- `data-tour="add-patient-btn"` - New Patient button
- `data-tour="search-patients"` - Patient search input
- `data-tour="patients-table"` - Patient records table

#### Billing Page (`/components/billing/BillingManagement.tsx`)
- `data-tour="create-invoice-btn"` - Create Invoice button
- `data-tour="search-invoices"` - Invoice search input
- `data-tour="invoices-table"` - Invoices table

#### Rooms Page (`/dashboard/rooms/page.tsx`)
- `data-tour="room-calendar"` - Room calendar component

### 4. **Tour Configuration**

**Default Settings:**
```typescript
{
  exitOnEsc: true,              // Allow ESC key to exit
  exitOnOverlayClick: true,     // Click outside to exit
  showStepNumbers: true,        // Display step counter
  showBullets: true,            // Show progress bullets
  showProgress: true,           // Show progress bar
  scrollToElement: true,        // Auto-scroll to elements
  overlayOpacity: 0.7,          // Semi-transparent overlay
}
```

**Custom Labels:**
- Done: "Done"
- Next: "Next →"
- Previous: "← Back"
- Skip: "Skip"

## User Experience Flow

### First-Time User Experience
1. Receptionist logs in for the first time
2. Navigates to any supported page
3. Sees "Start Tour" button in the header
4. Clicks to begin guided tour
5. Tour shows relevant steps for current page
6. Completion is tracked in localStorage

### Returning User Experience
1. "Start Tour" button always available in header
2. Can restart tour at any time
3. Each page has its own tour tracking
4. No interruptions on subsequent visits

## Technical Details

### localStorage Keys
Tours are tracked per page using keys like:
- `tour-seen-receptionist-/dashboard`
- `tour-seen-receptionist-/dashboard/appointments`
- `tour-seen-receptionist-/dashboard/patients`
- `tour-seen-receptionist-/dashboard/rooms`
- `tour-seen-receptionist-/dashboard/billing`

### Dynamic Import Strategy
```typescript
// Avoids SSR issues by loading Intro.js only on client
const introJs = (await import('intro.js')).default;
await import('intro.js/introjs.css');
```

### HTML Content in Steps
Tour steps support rich HTML content including:
- Headings (`<h3>`, `<h4>`)
- Lists (`<ul>`, `<ol>`)
- Text formatting (`<strong>`, colors)
- Icons (using colored spans)
- Multiple paragraphs

## Accessibility Features

1. **Keyboard Navigation:**
   - ESC to exit tour
   - Tab to navigate buttons
   - Enter to proceed

2. **Screen Reader Support:**
   - Intro.js provides ARIA attributes
   - Semantic HTML in tour content
   - Clear button labels

3. **Visual Indicators:**
   - Progress bullets show tour length
   - Step numbers indicate position
   - Highlighted elements with spotlight effect

## Customization Options

### Adding New Tour Steps
```typescript
// In ReceptionistTour.tsx, add to getTourStepsForPage()
if (pathname === '/your-new-page') {
  return [
    {
      intro: 'Welcome message',
      title: 'Page Title',
    },
    {
      element: '[data-tour="element-id"]',
      intro: 'Description of this element',
      position: 'bottom',
    },
  ];
}
```

### Adding Data Tour Attributes
```tsx
<Button data-tour="my-button">
  Click Me
</Button>
```

### Customizing Tour Appearance
Modify `useIntroTour.ts` options:
```typescript
overlayOpacity: 0.7,  // Change overlay darkness
showStepNumbers: true, // Show/hide step numbers
// ... other options
```

## Best Practices

### Tour Content Guidelines
1. **Keep steps concise** - 2-4 sentences per step
2. **Use action verbs** - "Click", "Select", "View"
3. **Include visual cues** - Colors, emojis (sparingly)
4. **Provide context** - Explain why, not just what
5. **Add pro tips** - Extra helpful information

### Data Attribute Placement
1. Place on **stable elements** (not dynamically rendered)
2. Use **semantic naming** - descriptive IDs
3. Avoid **deeply nested** elements
4. Test with **different screen sizes**

### Tour Flow Design
1. **Start with overview** - Orient the user
2. **Follow natural workflow** - Match user tasks
3. **End with action** - Encourage next steps
4. **Keep it short** - 5-7 steps maximum per tour

## Testing Checklist

- [x] Tours load without errors
- [x] All data-tour elements are accessible
- [x] Tours work on different screen sizes
- [x] localStorage tracking functions correctly
- [x] ESC and overlay click exit tours
- [x] Tour button only shows for RECEPTION role
- [x] HTML content renders properly
- [x] Navigation between pages doesn't break tours
- [x] No console errors or warnings

## Future Enhancements

### Potential Improvements
1. **Multi-step workflows** - Cross-page tour sequences
2. **Interactive elements** - Allow clicks during tour
3. **Video integration** - Embed tutorial videos
4. **Tour analytics** - Track completion rates
5. **Custom themes** - Branded tour styling
6. **Tooltips mode** - Always-on contextual help
7. **Search integration** - Search tour content
8. **Onboarding checklist** - Track learning progress

### Additional Tour Topics
- Payment processing detailed workflow
- Patient check-in process
- Emergency appointment booking
- Report generation
- WhatsApp integration usage
- Handling walk-in patients

## Troubleshooting

### Tour Not Starting
**Issue:** Tour doesn't start when clicking button
**Solutions:**
1. Check browser console for errors
2. Verify data-tour attributes exist on page
3. Clear localStorage and try again
4. Ensure user role is RECEPTION

### Elements Not Highlighting
**Issue:** Tour step points to wrong element or nothing
**Solutions:**
1. Verify data-tour attribute exists and is unique
2. Check element is visible (not hidden/collapsed)
3. Ensure element selector is correct
4. Try refreshing the page

### Tour Content Not Displaying
**Issue:** HTML content appears as plain text
**Solutions:**
1. Check HTML syntax in tour steps
2. Verify dangerouslySetInnerHTML is not escaped
3. Test with simpler content first
4. Review browser security settings

### localStorage Issues
**Issue:** Tour keeps restarting
**Solutions:**
1. Check browser allows localStorage
2. Verify localStorage keys are being set
3. Test in incognito/private mode
4. Clear all site data and retry

## Code References

### Key Files
```
frontend/
├── src/
│   ├── hooks/
│   │   └── useIntroTour.ts           # Custom hook for tour management
│   ├── components/
│   │   ├── tours/
│   │   │   └── ReceptionistTour.tsx  # Main tour component
│   │   └── layout/
│   │       └── header.tsx            # Tour button integration
│   ├── app/
│   │   └── dashboard/
│   │       ├── page.tsx              # Dashboard tour attributes
│   │       ├── appointments/
│   │       │   └── page.tsx          # Appointments tour attributes
│   │       ├── rooms/
│   │       │   └── page.tsx          # Rooms tour attributes
│   │       ├── patients/
│   │       │   └── page.tsx          # Patients page
│   │       └── billing/
│   │           └── page.tsx          # Billing page
│   └── components/
│       ├── patients/
│       │   └── PatientsManagement.tsx # Patients tour attributes
│       └── billing/
│           └── BillingManagement.tsx  # Billing tour attributes
└── package.json                       # Intro.js dependencies
```

## Dependencies

```json
{
  "dependencies": {
    "intro.js": "^7.x.x"
  },
  "devDependencies": {
    "@types/intro.js": "^5.x.x"
  }
}
```

## Summary

The Receptionist Tour implementation provides:
- ✅ Comprehensive guided tours for all receptionist workflows
- ✅ Context-aware content based on current page
- ✅ Easy-to-use interface with single button access
- ✅ Persistent tour state tracking
- ✅ Rich, formatted content with HTML support
- ✅ Responsive design that works on all screen sizes
- ✅ Accessible keyboard navigation
- ✅ Professional, polished user experience

The tour system significantly improves the onboarding experience for new receptionists and serves as a helpful reference for existing users learning new features.

