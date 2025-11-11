# Doctor Visit Workflow Testing Guide

## Test Credentials
- **Admin**: Phone: `9000000000`, Password: `password123`
- **Doctor (Shravya)**: Phone: `9000000001`, Password: `password123`
- **Doctor (Praneeta)**: Phone: `9000000002`, Password: `password123`

## Testing Steps

### Step 1: Login
1. Navigate to login page (typically `http://localhost:3000/login`)
2. Enter admin credentials:
   - Phone: `9000000000`
   - Password: `password123`
3. Click "Login"
4. ✅ **Verify**: Should redirect to dashboard

### Step 2: Navigate to Appointments
1. Go to Appointments section (usually `/dashboard/appointments`)
2. ✅ **Verify**: Should see appointment scheduler/calendar view
3. Select a doctor (e.g., Dr. Shravya or Dr. Praneeta)
4. Select today's date

### Step 3: Create an Appointment (if needed)
1. If no appointments exist, create one:
   - Select a patient (or create new patient)
   - Select a time slot
   - Choose visit type (OPD/Procedure/Telemedicine)
   - Select a room (if applicable)
   - Click "Book Appointment"
2. ✅ **Verify**: Appointment appears on calendar

### Step 4: Start Visit from Appointment
1. Find an appointment on the calendar (scheduled for today or past)
2. Click the **"START"** button on the appointment tile
   - If visit already exists, button will show **"CONT"** (Continue)
3. ✅ **Verify**: Should navigate to `/dashboard/visits` with visit form loaded
4. ✅ **Verify**: Patient and doctor should be pre-selected
5. ✅ **Verify**: Appointment ID should be linked

### Step 5: Fill Visit Form - Complaints Tab
1. ✅ **Verify**: Complaints tab is visible and active
2. Add at least one complaint:
   - Click "Add Complaint"
   - Enter complaint text (e.g., "Headache")
   - Add duration (e.g., "2 days")
   - Add severity (e.g., "Moderate")
   - Add notes (optional)
3. ✅ **Verify**: Complaint appears in list
4. ✅ **Verify**: Can add multiple complaints
5. ✅ **Verify**: Can delete complaints

### Step 6: Fill Visit Form - Vitals Tab
1. Click on "Vitals" tab
2. Fill in vital signs:
   - Blood Pressure: Systolic (e.g., 120), Diastolic (e.g., 80)
   - Heart Rate: (e.g., 72)
   - Temperature: (e.g., 36.5)
   - Weight: (e.g., 70 kg)
   - Height: (e.g., 175 cm)
   - Oxygen Saturation: (e.g., 98%)
   - Respiratory Rate: (e.g., 16)
   - Add notes (optional)
3. ✅ **Verify**: All fields accept valid input
4. ✅ **Verify**: Validation works (e.g., BP ranges, temperature ranges)
5. ✅ **Verify**: Data persists when switching tabs

### Step 7: Fill Visit Form - History Tab
1. Click on "History" tab
2. Enter patient history:
   - Medical history
   - Family history
   - Social history
   - Allergies
3. ✅ **Verify**: Text areas accept input
4. ✅ **Verify**: Data persists

### Step 8: Fill Visit Form - Examination Tab
1. Click on "Examination" tab
2. Fill examination findings:
   - General appearance
   - System-specific examinations
   - Other findings
3. ✅ **Verify**: All fields work correctly
4. ✅ **Verify**: Can add multiple findings

### Step 9: Fill Visit Form - Diagnosis Tab
1. Click on "Diagnosis" tab
2. Add diagnosis:
   - Click "Add Diagnosis"
   - Enter diagnosis name (e.g., "Tension headache")
   - Enter ICD-10 code (e.g., "G44.2")
   - Select type (Primary/Secondary)
   - Add notes
3. ✅ **Verify**: Can add multiple diagnoses
4. ✅ **Verify**: Can delete diagnoses

### Step 10: Fill Visit Form - Treatment Plan Tab
1. Click on "Treatment Plan" tab
2. Add treatment plan items:
   - Medications
   - Procedures
   - Lifestyle modifications
   - Follow-up instructions
3. ✅ **Verify**: All fields work correctly

### Step 11: Prescription Tab
1. Click on "Prescription" tab
2. Add medications:
   - Click "Add Medication"
   - Search/select medication
   - Enter dosage, frequency, duration
   - Add instructions
3. ✅ **Verify**: Medication search works
4. ✅ **Verify**: Can add multiple medications
5. ✅ **Verify**: Can edit/delete medications
6. ✅ **Verify**: Prescription preview looks correct

### Step 12: Lab Orders Tab (if available)
1. Click on "Lab Orders" tab (if present)
2. Add lab tests:
   - Select test type
   - Add notes/instructions
3. ✅ **Verify**: Lab orders can be added

### Step 13: Photos Tab (if available)
1. Click on "Photos" tab
2. Upload or capture photos:
   - Test photo upload
   - Test photo capture (if available)
3. ✅ **Verify**: Photos can be uploaded/viewed

### Step 14: Save Visit
1. Click "Save" button (or verify auto-save)
2. ✅ **Verify**: Success message appears
3. ✅ **Verify**: Visit data persists
4. ✅ **Verify**: Can navigate away and return - data is still there

### Step 15: Complete Visit
1. Add any final notes
2. Set follow-up date (if needed)
3. Click "Complete Visit" button
4. ✅ **Verify**: Visit is marked as completed
5. ✅ **Verify**: Appointment status changes to "COMPLETED"
6. ✅ **Verify**: Can no longer edit visit (or editing is restricted)

### Step 16: Print/Preview
1. Click "Print" or "Preview" button
2. ✅ **Verify**: Print preview opens
3. ✅ **Verify**: All visit data is displayed correctly
4. ✅ **Verify**: Prescription is formatted correctly

### Step 17: Patient History
1. Navigate to patient history/view
2. ✅ **Verify**: Completed visit appears in history
3. ✅ **Verify**: Can view visit details
4. ✅ **Verify**: Timeline shows visit correctly

## Error Scenarios to Test

### Test 1: Missing Required Fields
- Try to save visit without complaints
- ✅ **Verify**: Should show validation error

### Test 2: Invalid Vitals
- Enter out-of-range vitals (e.g., BP > 300, Temperature > 50)
- ✅ **Verify**: Should show validation error

### Test 3: Network Error Handling
- Disconnect network temporarily
- Try to save visit
- ✅ **Verify**: Should show appropriate error message
- Reconnect and retry
- ✅ **Verify**: Should save successfully

### Test 4: Concurrent Editing
- Open same visit in two tabs
- Make changes in both
- Save in one tab
- ✅ **Verify**: Other tab should handle conflict appropriately

## Performance Checks
- ✅ Form loads quickly (< 2 seconds)
- ✅ Tab switching is smooth
- ✅ Auto-save doesn't cause lag
- ✅ Search (medications, patients) is responsive

## UI/UX Checks
- ✅ All buttons are clickable and responsive
- ✅ Form fields are properly labeled
- ✅ Error messages are clear
- ✅ Success messages appear appropriately
- ✅ Loading states are shown during API calls
- ✅ Patient context panel shows correct information
- ✅ Navigation breadcrumbs work correctly

## Expected Results Summary
- ✅ Can create visit from appointment
- ✅ All form tabs work correctly
- ✅ Data persists across tab switches
- ✅ Validation works for all fields
- ✅ Can save visit successfully
- ✅ Can complete visit successfully
- ✅ Appointment status updates correctly
- ✅ Print/preview works correctly
- ✅ Patient history updates correctly

