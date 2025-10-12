# Paged.js Margin Controls Fix

## Date
October 12, 2025

## Problem
The margin controls (top and bottom margin sliders) in the prescription preview sidebar were not working with the paged.js implementation. Users could adjust the margin sliders, but the changes were not reflected in the preview output.

## Root Causes

### 1. Missing Dependency Array Entries
The `useEffect` that processes paged.js content was missing `overrideTopMarginPx` and `overrideBottomMarginPx` from its dependency array. While it had `effectiveTopMarginMm` and `effectiveBottomMarginMm`, the explicit override states should also be included to ensure proper re-triggering.

### 2. Insufficient CSS Specificity
The `@page` margin rules were not using `!important`, which could allow paged.js defaults or other styles to override them.

### 3. Inadequate Cleanup
Previous paged.js instances were not being fully cleaned up before re-processing, potentially causing stale DOM elements or cached styles to persist.

### 4. Frame Overlay Variable Scope
Frame overlays were using `effectiveTopMarginMm` and `effectiveBottomMarginMm` from the outer scope, but these might have been from a previous render. They should use the locally calculated values from the processing function scope.

### 5. Missing Debug Visibility
No logging was in place to verify that margins were being recalculated and applied correctly.

## Solutions Implemented

### 1. Enhanced Cleanup Process (Lines 1976-1982)
```typescript
// Clear previous content and force cleanup
container.innerHTML = '';

// Force garbage collection of previous paged.js instance
// by ensuring we get a fresh container state
const previousPages = container.querySelectorAll('.pagedjs_page');
previousPages.forEach(page => page.remove());
```

Ensures that all previous paged.js page elements are completely removed before re-processing.

### 2. Pre-calculated Margin Values (Lines 1993-1997)
```typescript
// Calculate margins in mm for @page rule
const topMarginMm = effectiveTopMarginMm;
const bottomMarginMm = effectiveBottomMarginMm;
const leftMarginMm = Math.max(0, Math.round((activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.leftMarginPx ?? printLeftMarginPx ?? 45) : (printLeftMarginPx ?? 45))/3.78 * 10) / 10);
const rightMarginMm = Math.max(0, Math.round((activeProfileId ? (printerProfiles.find((p:any)=>p.id===activeProfileId)?.rightMarginPx ?? printRightMarginPx ?? 45) : (printRightMarginPx ?? 45))/3.78 * 10) / 10);
```

Calculates all margin values in mm at the start of processing and uses them consistently throughout.

### 3. Debug Logging (Line 2000)
```typescript
// Debug log for margin verification
console.log('Paged.js Processing - Margins:', { topMarginMm, bottomMarginMm, leftMarginMm, rightMarginMm });
```

Helps verify in browser console that margins are being recalculated when sliders change.

### 4. Enhanced @page Rule with !important (Lines 2007-2011)
```typescript
@page {
  size: ${paperPreset === 'LETTER' ? '8.5in 11in' : 'A4'};
  margin-top: ${topMarginMm}mm !important;
  margin-bottom: ${bottomMarginMm}mm !important;
  margin-left: ${leftMarginMm}mm !important;
  margin-right: ${rightMarginMm}mm !important;
}
```

Added `!important` to all margin declarations to ensure they override any default styles.

### 5. Updated Frame Overlays (Lines 2084, 2102)
```typescript
// Header frame - uses local topMarginMm
top: ${topMarginMm}mm;

// Footer frame - uses local bottomMarginMm
bottom: ${bottomMarginMm}mm;
```

Frame overlays now use the locally calculated margin values, ensuring they stay synchronized with the @page margins.

### 6. Added Data Attributes for Debugging (Lines 2092, 2110)
```typescript
headerFrame.setAttribute('data-frame', 'header');
footerFrame.setAttribute('data-frame', 'footer');
```

Makes it easier to identify frame elements in browser DevTools.

### 7. Enhanced Dependency Array (Lines 2200-2203)
```typescript
}, [previewOpen, items, diagnosis, chiefComplaints, investigations, customSections, followUpInstructions,
    paperPreset, effectiveTopMarginMm, effectiveBottomMarginMm, overrideTopMarginPx, overrideBottomMarginPx,
    activeProfileId, printerProfiles, printLeftMarginPx, printRightMarginPx, contentOffsetXPx, contentOffsetYPx, 
    designAids, frames, bleedSafe, showRefillStamp, grayscale]);
```

Added `overrideTopMarginPx` and `overrideBottomMarginPx` to the dependency array for explicit tracking.

### 8. Enhanced CSS for Page Content (Lines 3121-3124)
```css
/* Ensure paged.js respects @page margins */
#pagedjs-container .pagedjs_page_content {
  box-sizing: border-box !important;
}
```

Ensures proper box-sizing for the paged.js content area.

## How to Test

1. **Open Prescription Preview**
   - Navigate to a patient visit
   - Click on the prescription preview

2. **Adjust Top Margin**
   - Use the "Top margin" slider in the right sidebar
   - Watch the margin value update in mm
   - Check browser console for the log: `Paged.js Processing - Margins: { topMarginMm: X, ... }`
   - Verify the preview updates after ~300ms
   - Verify the content shifts down/up as margin increases/decreases

3. **Adjust Bottom Margin**
   - Use the "Bottom margin" slider
   - Verify the margin value updates
   - Check console log
   - Verify the preview updates
   - Verify the content area height adjusts accordingly

4. **Test with Frames Enabled**
   - Enable header/footer frames
   - Adjust margins
   - Verify the frame overlays move with the margins
   - Header frame should be at the top margin
   - Footer frame should be at the bottom margin

5. **Test with Printer Profiles**
   - Select different printer profiles
   - Verify margins update to profile defaults
   - Adjust margins manually
   - Verify overrides work
   - Click "Reset margins" button
   - Verify margins return to profile defaults

6. **Test Multi-page Documents**
   - Add enough content to span 2-3 pages
   - Adjust margins
   - Verify all pages update consistently
   - Navigate between pages
   - Verify margins are consistent across pages

## Technical Details

### Margin Calculation Flow

1. **User adjusts slider** → `setOverrideTopMarginPx(value)` or `setOverrideBottomMarginPx(value)`

2. **useMemo recalculates** (lines 1899-1906):
   ```typescript
   effectiveTopMarginPx = overrideTopMarginPx ?? profile.topMarginPx ?? printTopMarginPx ?? 150
   effectiveBottomMarginPx = overrideBottomMarginPx ?? profile.bottomMarginPx ?? printBottomMarginPx ?? 45
   ```

3. **useMemo converts to mm** (lines 1907-1908):
   ```typescript
   effectiveTopMarginMm = round((effectiveTopMarginPx / 3.78) * 10) / 10
   effectiveBottomMarginMm = round((effectiveBottomMarginPx / 3.78) * 10) / 10
   ```

4. **useEffect triggered** (dependencies include override states and effective mm values)

5. **Processing function runs** (after 300ms timeout):
   - Cleans up previous pages
   - Calculates local margin values
   - Logs margins to console
   - Creates fresh paged.js instance
   - Applies @page CSS with !important
   - Adds frame overlays with correct positions

6. **Preview updates** with new margins applied

### Why the 300ms Timeout?

The timeout (line 2198) prevents excessive re-processing when users drag sliders rapidly. It debounces the updates so paged.js only re-processes once the user pauses adjusting the slider.

## Files Modified

1. `/Users/nshah/Clinic_Management_System/frontend/src/components/visits/PrescriptionBuilder.tsx`
   - Lines 1976-1982: Enhanced cleanup
   - Lines 1993-2000: Pre-calculated margins with debug logging
   - Lines 2007-2011: Enhanced @page rule with !important
   - Lines 2076-2112: Updated frame overlays
   - Lines 2200-2203: Enhanced dependency array
   - Lines 3107-3124: Enhanced paged.js CSS

## Expected Behavior After Fix

✅ **Margin sliders are responsive** - Changes apply within ~300ms
✅ **Visual feedback** - Margin values in mm update immediately
✅ **Console logging** - Each re-process logs the margin values
✅ **Frame synchronization** - Header/footer frames move with margins
✅ **Profile integration** - Printer profiles work with margin overrides
✅ **Reset functionality** - "Reset margins" button restores profile defaults
✅ **Multi-page consistency** - All pages respect the same margin settings
✅ **Print output** - Margins are correctly applied when printing

## Verification

To verify the fix is working:

1. Open browser DevTools console
2. Adjust a margin slider
3. Look for log: `Paged.js Processing - Margins: { topMarginMm: X, bottomMarginMm: Y, ... }`
4. Verify the numbers match the slider values
5. Verify the preview visually updates to show the new margins
6. Verify frames (if enabled) are positioned correctly relative to margins

## Notes

- The 300ms debounce timeout is intentional for performance
- The `!important` flags ensure margin values always take precedence
- Frame overlays use the same calculated values as @page margins
- Console logging can be removed in production if desired (line 2000)
- All margin calculations round to 0.1mm precision for consistency

## Related Documentation

- `PAGEDJS_INTEGRATION.md` - Original paged.js integration details
- `PRESCRIPTION_PAGINATION_FIX_SUMMARY.md` - Content overflow fix
- `PAGEDJS_QUICK_START.md` - Quick reference guide

