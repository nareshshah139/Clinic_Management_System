# Appointment Tiles Enhancement

## Summary
Enhanced appointment tiles in both the Appointments Calendar and Room Calendar to display additional patient information and improved visual feedback for past appointments.

## Changes Implemented

### 1. Type Updates (`frontend/src/lib/types.ts`)
- Updated `AppointmentInSlot` interface to include:
  - Patient age, gender, and date of birth
  - `isFollowUp` flag to indicate existing patients
- Updated `RoomSchedule` interface to include the same patient enrichment fields

### 2. Utility Functions (`frontend/src/lib/utils.ts`)
- Added `calculateAge()` function to compute patient age from date of birth
- Handles edge cases for birthdays and invalid dates

### 3. Doctor Day Calendar (`frontend/src/components/appointments/DoctorDayCalendar.tsx`)
#### Data Enrichment
- Modified `fetchSchedule()` to fetch full patient details for each appointment
- Retrieves patient visit history to determine follow-up status
- Calculates patient age from date of birth

#### Visual Enhancements
- **Color Coding**: All appointment colors now use soft, light tones:
  - **Normal Appointments:**
    - OPD: `rgba(219, 234, 254, 0.95)` (light blue)
    - Procedure: `rgba(237, 233, 254, 0.95)` (light purple)
    - Telemedicine: `rgba(243, 244, 246, 0.95)` (light gray)
  - **Past Appointments** (even lighter):
    - OPD: `rgba(239, 246, 255, 0.95)` (very light blue)
    - Procedure: `rgba(245, 237, 254, 0.95)` (very light purple)
    - Telemedicine: `rgba(249, 250, 251, 0.95)` (very light gray)
  - **Completed**: `rgba(226, 232, 240, 0.95)` (light gray)
  
- **Enhanced Appointment Labels**: Now display:
  - Time slot and patient name (primary line)
  - FOLLOW-UP indicator (if applicable)
  - Visit type (OPD/PROCEDURE/TELEMED)
  - Patient age (e.g., "25y")
  - Patient sex (first letter: M/F/O)
  - Room name (if applicable)

#### Dialog Updates
- Appointment details dialog now shows:
  - Patient age
  - Patient sex
  - Follow-up badge for existing patients

### 4. Room Calendar (`frontend/src/components/rooms/RoomCalendar.tsx`)
#### Hover-Reveal with Comprehensive Tooltip
- **Clean display** preventing overlap issues:
  - Shows patient name by default (prominent, semibold)
  - Shows doctor name only on hover (smaller, 75% opacity)
  - **Comprehensive hover tooltip**: Detailed appointment card appears to the right on hover
  - Smooth 200ms transitions for professional interaction
  - No action buttons or appointment details dialog in main view
- **Performance optimized**: No patient detail enrichment API calls
- **Smart styling**: Single-line default with rich hover information card

#### Legend Updates
- Added legend entries for past appointments:
  - "Past (OPD)" - light blue
  - "Past (Procedure)" - light purple

### 5. Appointments Calendar (`frontend/src/components/appointments/AppointmentsCalendar.tsx`)
- Updated legend to include past appointment colors
- Maintains consistency with other calendar views

## Features Added

### 1. Follow-Up Detection
- System automatically detects if a patient has previous visits
- Displays "FOLLOW-UP" badge on appointment tiles
- Helps staff identify new vs. returning patients at a glance

### 2. Patient Demographics
- **Age**: Calculated and displayed in years
- **Sex**: Displayed as single letter (M/F/O)
- Both visible directly on appointment tiles without opening details

### 3. Visit Type Classification
- Clear indication of appointment type:
  - **OPD**: Outpatient consultation
  - **PROCEDURE**: Medical procedure
  - **TELEMED**: Telemedicine consultation

### 4. Visual Past Appointment Handling
- Past appointments automatically fade to lighter shades
- Maintains color scheme differentiation
- Makes it easy to distinguish past from current/future appointments
- Completed appointments maintain their distinct gray color

### 5. Enhanced Display Format

#### Doctor Calendar - Excel-Style Spaced Layout
**Doctor Calendar** shows detailed information with distributed layout:
```
09:00-09:30  John Doe        FOLLOW-UP  OPD        45y  M  Room: Room 201
[Time]       [Patient]    [Status]    [Type]     [Age][Sex] [Room]
```

**Layout Design:**
- **Three-Section Layout**: Left (Time + Patient) | Center (Status + Type) | Right (Demographics + Location)
- **Justify-Between**: Information spreads across the full width like Excel cells

#### Room Calendar - Hover-Reveal with Tooltip Card
**Room Calendar** shows essential information with hover interactions:

**Default state:**
```
John Doe
```

**On hover:**
```
John Doe                    [Detailed Card]
Dr. Smith Johnson     →     ┌─────────────────────┐
                           │ John Doe            │
                           │ Jan 15, 2024 • 09:00-09:30 │
                           │                     │
                           │ Phone: +1234567890  │
                           │ Email: john@email.com│
                           │                     │
                           │ Doctor: Dr. Smith   │
                           │ Type: OPD           │
                           │ Status: CONFIRMED   │
                           │                     │
                           │ Room: Room 101 (Consultation) │
                           └─────────────────────┘
```

**Layout Design:**
- **Single line by default**: Patient name only to prevent overlap
- **Two-line on hover**: Patient name + doctor name revealed on hover
- **Comprehensive tooltip card**: Appears to the right showing full appointment details
- **Smooth transitions**: 200ms fade-in/out for professional feel
- **Centered**: Clean, focused display without clutter
- **Rich information**: Complete appointment context available on demand

#### Doctor Calendar Color-Coded Elements:
- **Time**: Blue (#1d4ed8) - Bold for prominence
- **Patient Name**: Black - Semibold
- **Follow-Up Text**: Amber (#d97706) - "FOLLOW-UP" for visibility
- **Visit Type**: Purple (#9333ea) - OPD/PROCEDURE/TELEMED
- **Age**: Gray (#4b5563) - Subtle but readable
- **Gender**: Gray with light background badge
- **Room**: Green (#059669) - "Room:" prefix with room name

#### Room Calendar Color-Coded Elements:
- **Patient Name**: Black text (#000000) - Semibold and always visible
- **Doctor Name**: Black text (#000000) - Small text, 75% opacity, visible only on hover

**Typography Enhancements:**
- **Font Size**: 0.875rem (14px) - increased for better readability
- **Font Weight**: Semibold for visual prominence
- **Text Color**: Color-coded elements for instant recognition
- **No Shadow**: Clean text without shadow for crisp, modern appearance
- **Flexible Layout**: Auto-adjusts to content while maintaining spacing
- **Visual Hierarchy**: Different colors and weights for information priority

## User Experience Improvements

### Doctor Calendar Enhancements:
1. **At-a-Glance Information**: Staff can see critical patient information without clicking on appointments
2. **Excel-Style Layout**: Distributed layout with color-coded elements makes information instantly scannable
3. **Follow-Up Awareness**: Immediate visibility of patient visit history with "FOLLOW-UP" text label
4. **Demographic Awareness**: Age and sex visible for better patient identification
5. **Visual Clarity**: Color-coded elements provide excellent contrast and instant recognition
6. **Distributed Layout**: Information spreads across full tile width like Excel cells, eliminating crowding

### Room Calendar (Hover-Reveal with Tooltip):
1. **Smart Information Display**: Shows patient name always, doctor name on hover to prevent overlap
2. **Clean Default State**: Single-line display prevents visual clutter and overlap issues
3. **Interactive Enhancement**: Smooth hover transitions reveal additional context when needed
4. **Comprehensive Tooltip**: Right-positioned card shows complete appointment details on hover
5. **Rich Context**: Full patient info, doctor details, visit type, status, and room information available on demand
6. **Optimal Performance**: No additional API calls or patient detail enrichment
7. **Flexible Recognition**: Always see patient name, hover for complete appointment context

### Shared Improvements (Doctor Calendar Only):
1. **Better Time Management**: Lighter colors for past appointments help focus on upcoming appointments
2. **Clean Modern Design**: Shadow-free text for a crisp, professional appearance  
3. **Soft Color Palette**: All colors are now 3 shades lighter for a gentler, more pleasant visual experience
4. **Long Press Interaction**: Press and hold an appointment tile for 500ms to open detailed information (Doctor Calendar only)
5. **Button-Based Actions**: Hover over appointment tiles to reveal quick action buttons (Doctor Calendar only)

## Interaction Model

### Room Calendar Hover Tooltip (New)
**Desktop:**
- Hover over any appointment tile to see comprehensive appointment details
- Tooltip card appears to the right of the appointment tile
- Contains complete patient information, doctor details, visit type, status, and room info
- Smooth 200ms fade-in/out transitions
- Automatically disappears when mouse moves away
- **High-layer positioning**: Uses z-index 9999 to ensure tooltip appears above all other content
- **Overflow handling**: Parent containers configured with `overflow: visible` to prevent clipping
- **Enhanced visibility**: Fully opaque white background with padding buffer that completely obscures content behind it
- **Complete coverage**: 320px minimum width and 200px minimum height ensures substantial coverage area
- **Solid background**: Container-level white background with padding creates buffer zone for complete obscuring

**Benefits:**
- **No clicking required**: Instant access to full appointment context
- **Non-intrusive**: Doesn't interfere with calendar navigation
- **Comprehensive**: Shows all relevant appointment information in one view
- **Professional**: Smooth animations and clean design
- **Space-efficient**: Appears beside tile without covering other appointments

### Long Press to View Details (Doctor Calendar Only)
**Desktop:**
- Click and hold on an appointment tile for 500ms
- The appointment details dialog will open automatically
- Release before 500ms to cancel

**Mobile/Touch:**
- Tap and hold on an appointment tile for 500ms
- The appointment details dialog will open automatically
- Supports all standard touch gestures (touchstart, touchend, touchcancel)

**Smart Behavior:**
- Moving the mouse/finger outside the tile cancels the long press
- Compatible with existing drag-to-select for booking new appointments
- Timer is cleaned up automatically on component unmount
- Visual hint in tooltip: "Long press to view details"

### Button-Based Quick Actions
**Hover to Reveal Actions:**
- Hover over any appointment tile to reveal action buttons
- Buttons appear with smooth fade-in animation (200ms)
- Three distinct actions available on every appointment

**Action Buttons:**
1. **INFO** (Gray button)
   - Opens appointment details dialog
   - Shows patient info, visit type, follow-up status, age, sex
   - Provides "Start Visit" and "Reschedule" options

2. **RESCHED** (Amber button)
   - **Doctor Calendar**: Activates reschedule mode with visual feedback
   - **Room Calendar**: Shows reschedule banner and enters selection mode
   - Click on any available slot to move the appointment
   - Cancel anytime with escape or cancel button

3. **START/CONT** (Blue button)
   - **START**: For appointments without active visits
   - **CONT**: For appointments with existing visits
   - Navigates directly to the Visits page with appointment context
   - Auto-populates patient and appointment information

**Visual Design:**
- Compact buttons (text-xs, small padding) to fit within appointment tiles
- Distinct colors for instant recognition
- Hover effects with darker shades for feedback
- Shadow styling for depth and clickability
- Disabled state for optimistic appointments

## Technical Details

### Performance Considerations
- Patient data enrichment happens during schedule fetch
- Uses parallel API calls with `Promise.all()` for efficiency
- Graceful error handling if patient details unavailable
- Caches enriched data in component state

### Long Press Implementation
- 500ms threshold for long press detection
- Uses `setTimeout` with proper cleanup on mouseup/touchend/mouseleave
- State management prevents conflicts with drag-to-select functionality
- Supports both mouse and touch events for cross-platform compatibility
- Cleanup hook ensures no memory leaks from lingering timers

### Button-Based Actions Implementation
**Hover Detection:**
- CSS group/group-hover classes for efficient hover state management
- Smooth opacity transitions (200ms) for professional feel
- Buttons positioned with flexbox for consistent alignment

**Event Handling:**
- `stopPropagation()` prevents conflicts with tile interactions
- Separate click handlers for each action type
- State management for reschedule mode and dialog visibility

**Dialog Integration:**
- Reuses existing appointment details dialog in DoctorDayCalendar
- Added new dialog implementation to RoomCalendar for consistency
- Proper state cleanup on dialog close

**Navigation Integration:**
- Uses Next.js router for seamless navigation to Visits page
- Passes appointment context via URL parameters
- Supports both new visits and continuing existing visits

### Data Flow
1. Fetch appointments from backend
2. For each appointment, fetch full patient details
3. Fetch patient visit history to determine follow-up status
4. Calculate age from date of birth
5. Enrich appointment object with additional fields
6. Display enriched data in calendar tiles

### Backward Compatibility
- All new fields are optional
- System gracefully handles missing data
- Existing functionality remains unchanged
- No breaking changes to API contracts

## Testing Recommendations

1. **Visual Testing**
   - Verify colors for past appointments are 3 shades lighter
   - Check that follow-up badges appear correctly
   - Ensure age and sex display properly

2. **Data Accuracy**
   - Verify age calculation is correct
   - Check follow-up detection works for patients with visit history
   - Confirm gender displays correctly

3. **Error Handling**
   - Test with missing patient data
   - Verify graceful degradation if API calls fail
   - Check behavior with patients without DOB

4. **Performance**
   - Monitor load times with multiple appointments
   - Verify parallel API calls are working
   - Check for any UI lag or freezing

5. **Long Press Interaction**
   - Test on desktop: Click and hold for 500ms should open details dialog
   - Test on mobile: Tap and hold for 500ms should open details dialog
   - Verify cancellation: Moving mouse/finger away cancels the long press
   - Verify short clicks don't trigger: Clicking and releasing quickly should not open dialog
   - Check drag-to-select still works on empty slots
   - Verify timer cleanup: No memory leaks or lingering timers

6. **Button-Based Actions**
   - **Hover Behavior**: Verify buttons appear on hover and fade in smoothly
   - **View Details Button**: Should open appointment details dialog with all patient info
   - **Reschedule Button**: Should activate reschedule mode with proper visual feedback
   - **Visit Button**: Should navigate to visits page with correct parameters
   - **State Management**: Check that dialogs close properly and state is cleaned up
   - **Visual Feedback**: Verify button hover effects and disabled states work correctly
   - **Mobile Compatibility**: Test button interactions on touch devices

## Future Enhancements

1. Cache patient details to reduce API calls
2. Add tooltips with more detailed patient information
3. Make information fields configurable by clinic
4. Add patient photo thumbnails if available
5. Include insurance status or payment information

