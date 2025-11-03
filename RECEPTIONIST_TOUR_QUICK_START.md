# Receptionist Tour - Quick Start Guide

## 🎉 What's New

A comprehensive guided tour system has been added to help Receptionist users learn the system quickly and efficiently.

## 🚀 Quick Test

### 1. Start the Application
```bash
# Start backend (terminal 1)
cd backend
npm run start:dev

# Start frontend (terminal 2)  
cd frontend
npm run dev
```

### 2. Login as Receptionist
- Navigate to: http://localhost:3000/login
- **Phone:** 9000000003
- **Password:** password123
- **Role:** RECEPTION

### 3. Start the Tour
Once logged in, look for the **"Start Tour"** button in the header (top-right area, next to the branded mode toggle).

Click it to begin the guided tour!

## 📍 Tours Available

### Dashboard Tour
**Location:** `/dashboard`
- Welcome message
- Navigation sidebar overview
- System statistics
- Today's appointments

### Appointments Tour  
**Location:** `/dashboard/appointments`
- Doctor selection
- Date picker
- Calendar vs Slots views
- Booking appointments
- Managing appointments
- Status color codes

### Patients Tour
**Location:** `/dashboard/patients`
- Adding new patients
- Search functionality
- Patient records table
- Pro tips for patient management

### Rooms Tour
**Location:** `/dashboard/rooms`
- Room calendar overview
- Room availability
- Room assignment workflow
- Patient check-in process

### Billing Tour
**Location:** `/dashboard/billing`
- Creating invoices
- Searching invoices
- Invoice list overview
- Payment processing
- End-of-shift reconciliation

## 🎯 How to Use

1. **Click "Start Tour" button** in the header
2. **Follow the highlighted elements** - They'll be spotlighted one by one
3. **Read the instructions** - Each step has detailed guidance
4. **Navigate through steps** - Use "Next →" and "← Back" buttons
5. **Exit anytime** - Press ESC or click outside the tour

## ⚡ Quick Tips

- **First-time experience**: Tours automatically track if you've seen them
- **Repeat anytime**: Click "Start Tour" button to replay
- **Keyboard shortcuts**: 
  - ESC = Exit tour
  - Enter = Next step
  - Tab = Navigate buttons
- **Mobile friendly**: Tours work on all screen sizes
- **Context-aware**: Different tour content on each page

## 🔍 What Gets Highlighted

The tour uses `data-tour` attributes to identify key UI elements:

- **Dashboard**: `sidebar`, `dashboard-stats`, `appointments-list`
- **Appointments**: `doctor-select`, `date-picker`, `view-tabs`
- **Patients**: `add-patient-btn`, `search-patients`, `patients-table`
- **Billing**: `create-invoice-btn`, `search-invoices`, `invoices-table`
- **Rooms**: `room-calendar`

## 🐛 Troubleshooting

### Tour not starting?
1. Check browser console for errors
2. Verify you're logged in as RECEPTION role
3. Try refreshing the page
4. Clear localStorage: `localStorage.clear()` in browser console

### Elements not highlighting?
1. Ensure you're on the correct page
2. Refresh the page and try again
3. Check that data-tour attributes exist in the DOM

### Tour keeps reappearing?
Clear tour history:
```javascript
// In browser console
localStorage.removeItem('tour-seen-receptionist-/dashboard');
localStorage.removeItem('tour-seen-receptionist-/dashboard/appointments');
// ... for each page
```

## 📝 Testing Checklist

- [ ] Login as Receptionist (9000000003 / password123)
- [ ] Verify "Start Tour" button appears in header
- [ ] Test Dashboard tour
- [ ] Test Appointments tour
- [ ] Test Patients tour
- [ ] Test Rooms tour
- [ ] Test Billing tour
- [ ] Verify ESC key exits tour
- [ ] Verify clicking outside exits tour
- [ ] Verify tours don't auto-restart on page reload
- [ ] Verify different content on each page
- [ ] Test on mobile/tablet screen sizes

## 🎨 Customization

### Change Tour Content
Edit: `frontend/src/components/tours/ReceptionistTour.tsx`
- Find `getTourStepsForPage()` function
- Modify the steps array for the desired page

### Add New Page Tour
```typescript
if (pathname === '/your-new-page') {
  return [
    {
      intro: 'Welcome to the new page!',
      title: 'Getting Started',
    },
    {
      element: '[data-tour="element-id"]',
      intro: 'This is an important element.',
      position: 'bottom',
    },
  ];
}
```

### Add Tour Attributes to UI
```tsx
<Button data-tour="my-button">
  Click Me
</Button>
```

## 📚 Documentation

For complete documentation, see:
- **Implementation Guide**: `RECEPTIONIST_TOUR_IMPLEMENTATION.md`
- **Updates Log**: `updates_log.txt` (2025-11-03 entry)

## 🎓 Demo Credentials

**Receptionist Account:**
- Phone: 9000000003
- Password: password123
- Role: RECEPTION

**Other Accounts (for testing):**
- Admin: 9000000000 / password123
- Dr. Shravya: 9000000001 / password123
- Dr. Praneeta: 9000000002 / password123

## ✅ Success Criteria

Tour implementation is successful if:
- ✅ "Start Tour" button visible for RECEPTION users
- ✅ Tours work on all 5 supported pages
- ✅ UI elements highlight correctly
- ✅ Tour content is clear and helpful
- ✅ Keyboard navigation works
- ✅ Mobile responsive
- ✅ No console errors
- ✅ Tours don't interfere with normal workflow

## 🚦 Current Status

**Status**: ✅ READY FOR TESTING

All components implemented and integrated:
- ✅ intro.js library installed
- ✅ Custom hook created
- ✅ Tour component implemented
- ✅ Header button added
- ✅ Data attributes added to all pages
- ✅ No linting errors
- ✅ Documentation complete

## 🎬 Next Steps

1. **Test the tour** using the quick test steps above
2. **Gather feedback** from receptionist users
3. **Refine content** based on user feedback
4. **Add more tours** for other roles (optional)
5. **Create video tutorial** showing tour usage (optional)

---

**Need Help?**
- Check `RECEPTIONIST_TOUR_IMPLEMENTATION.md` for detailed documentation
- Review console logs for debugging information
- Verify intro.js CSS is loading correctly
- Ensure all data-tour attributes are present in the DOM

