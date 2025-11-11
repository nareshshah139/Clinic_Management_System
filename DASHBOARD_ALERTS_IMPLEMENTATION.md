# Dashboard Alerts API Implementation - Summary

**Date:** December 2024  
**Status:** ✅ Complete

## Overview

Implemented real-time system alerts on the main dashboard by integrating with the backend alerts endpoint, replacing placeholder data with actual system alerts.

## Implementation Details

### Backend Endpoint
- **URL:** `GET /reports/alerts`
- **Authentication:** Required (JWT Bearer token)
- **Authorization:** All authenticated users
- **Location:** `backend/src/modules/reports/reports.controller.ts:211-217`

### Backend Response Structure
```typescript
{
  counts: {
    overdueInvoices: number;
    lowStockAlerts: number;
    expiryAlerts: number;
    pendingPayments: number;
    upcomingAppointments: number;
  };
  overdueInvoices: Array<{
    id: string;
    invoiceNo: string;
    total: number;
    dueDate: Date;
    patient: { id: string; name: string };
  }>;
  lowStockAlerts: Array<{
    itemId: string;
    itemName: string;
    currentStock: number;
    reorderLevel: number;
  }>;
  expiryAlerts: Array<{
    itemId: string;
    itemName: string;
    expiryDate: Date;
    daysUntilExpiry: number;
    currentStock: number;
  }>;
  pendingPayments: Array<{
    id: string;
    amount: number;
    mode: string;
    createdAt: Date;
    invoice: { id: string; invoiceNo: string };
  }>;
  upcomingAppointments: Array<{
    id: string;
    time: Date;
    status: string;
    visitType: string;
    patientName: string;
    doctorName: string;
  }>;
  generatedAt: Date;
}
```

### Frontend Transformation

The backend response is transformed into `SystemAlert[]` format with appropriate severity levels:

#### Alert Types & Severity Mapping

1. **Overdue Invoices** → `HIGH` severity
   - Triggered when invoices have `status: 'OVERDUE'`
   - Message includes count and total amount
   - Type: `'billing'`

2. **Low Stock Alerts** → `MEDIUM` severity
   - Triggered when inventory items are at or below reorder level
   - Message includes count of affected items
   - Type: `'inventory'`

3. **Expiring Items** → `HIGH` or `MEDIUM` severity
   - `HIGH`: Items expiring within 7 days
   - `MEDIUM`: Items expiring within 30 days
   - Message includes count and urgent items count
   - Type: `'inventory'`

4. **Pending Payments** → `LOW` severity
   - Triggered when payments have `reconStatus: 'PENDING'`
   - Message includes count of pending payments
   - Type: `'billing'`

5. **System Status** → `LOW` severity
   - Always present as informational alert
   - Type: `'system'`

### Features Implemented

✅ **Real-time Alert Loading**
- Fetches alerts from backend API on dashboard load
- Updates automatically when dashboard refreshes

✅ **Smart Severity Assignment**
- Overdue invoices → HIGH (critical financial issue)
- Expiring items (< 7 days) → HIGH (urgent action needed)
- Low stock → MEDIUM (requires attention)
- Expiring items (7-30 days) → MEDIUM (planning needed)
- Pending payments → LOW (informational)
- System status → LOW (informational)

✅ **Comprehensive Alert Messages**
- Includes counts and relevant details
- Plural/singular handling for proper grammar
- Financial amounts formatted with currency symbol
- Days until expiry for urgent items

✅ **Error Handling**
- Try-catch around API call
- Fallback to basic system status alert on error
- Console logging for debugging
- Graceful degradation

✅ **Data Transformation**
- Maps backend response to frontend `SystemAlert` interface
- Handles null/undefined values safely
- Preserves timestamps from backend

## Alert Examples

### Overdue Invoices Alert
```
Title: "Overdue Invoices"
Message: "3 invoices are overdue. Total amount: ₹15,450.00"
Severity: HIGH
Type: billing
```

### Low Stock Alert
```
Title: "Low Stock Alert"
Message: "5 items are below reorder level"
Severity: MEDIUM
Type: inventory
```

### Expiring Items Alert
```
Title: "Expiring Items"
Message: "8 items are expiring within 30 days (3 within 7 days)"
Severity: HIGH (if urgent) or MEDIUM
Type: inventory
```

### Pending Payments Alert
```
Title: "Pending Payments"
Message: "2 payments are pending reconciliation"
Severity: LOW
Type: billing
```

## Files Modified

1. **`frontend/src/app/dashboard/page.tsx`**
   - Replaced placeholder alerts with API call
   - Added alert transformation logic
   - Enhanced error handling

## Backend Data Sources

The backend `getSystemAlerts()` method queries:

1. **Overdue Invoices:** `NewInvoice` table with `status: 'OVERDUE'`
2. **Low Stock:** `InventoryItem` table where `currentStock <= 0` and `minStockLevel > 0`
3. **Expiring Items:** `InventoryItem` table with `expiryDate` within 30 days
4. **Pending Payments:** `NewPayment` table with `reconStatus: 'PENDING'`
5. **Upcoming Appointments:** `Appointment` table within 48 hours (not used in alerts currently)

## UI Display

Alerts are displayed in the dashboard with:
- Color-coded badges based on severity:
  - **HIGH/CRITICAL:** Red background
  - **MEDIUM:** Yellow background
  - **LOW:** Blue background
- Alert icon (AlertTriangle) with matching colors
- Title and descriptive message
- Severity badge

## Testing Recommendations

1. **Test with Real Data:**
   - Create overdue invoices
   - Add low stock inventory items
   - Add items expiring soon
   - Create pending payments
   - Verify alerts appear correctly

2. **Test Empty State:**
   - Verify system status alert always appears
   - Verify no errors when no alerts exist

3. **Test Error Handling:**
   - Simulate API failure
   - Verify fallback alert appears
   - Check console for error logs

4. **Test Severity Levels:**
   - Verify HIGH alerts show red
   - Verify MEDIUM alerts show yellow
   - Verify LOW alerts show blue

## Future Enhancements

1. **Clickable Alerts:** Make alerts clickable to navigate to relevant pages
2. **Dismissible Alerts:** Allow users to dismiss alerts
3. **Alert Details:** Show detailed view when clicking an alert
4. **Real-time Updates:** WebSocket integration for live alerts
5. **Alert History:** Track dismissed alerts
6. **Custom Alerts:** Allow admins to create custom alerts
7. **Alert Preferences:** User preferences for alert types
8. **Upcoming Appointments:** Include in alerts if needed

## Notes

- The backend endpoint already exists and is fully functional
- Alert transformation happens on the frontend
- All alerts are branch-scoped (only shows alerts for user's branch)
- System status alert is always shown as a baseline indicator
- Upcoming appointments data is available but not currently used in alerts

---

**Implementation Status:** ✅ Complete and Ready for Testing

