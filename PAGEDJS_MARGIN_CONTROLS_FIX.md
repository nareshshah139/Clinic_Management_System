# Paged.js Margin Controls Fix

## Date
October 12, 2025

## Updates
- **Initial Fix**: October 12, 2025 - Fixed dependency array and CSS specificity issues
- **Debug & AutoPreview Fix**: October 12, 2025 - Added comprehensive logging and fixed Live Preview mode support

## Problem
The margin controls (top and bottom margin sliders) in the prescription preview sidebar were not working with the paged.js implementation. Users could adjust the margin sliders, but the changes were not reflected in either regular preview mode or live preview mode.

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

### 6. Missing Live Preview Mode Support (CRITICAL)
The paged.js processing effect only checked for `previewOpen` but not `autoPreview`. When users enabled "Live Preview" mode (`autoPreview=true`), the effect wouldn't trigger because it required `previewOpen` to be true. The condition should check for `(previewOpen || autoPreview)` instead of just `previewOpen`.

### 7. Empty Content Not Detected
If the source content (`printRef.current`) was empty or too short, paged.js would fail silently without any indication of the problem.

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

### 9. Live Preview Mode Support (Lines 1978-1986)
```typescript
// Check if either preview or autoPreview mode is active
if (!(previewOpen || autoPreview) || !pagedJsContainerRef.current) {
  console.log('⚠️ Early return from paged.js effect', { 
    previewOpen, 
    autoPreview,
    hasRef: !!pagedJsContainerRef.current 
  });
  return;
}
```

Now checks for BOTH `previewOpen` (regular preview) and `autoPreview` (live preview) modes, and logs the reason for early returns.

### 10. Added autoPreview to Dependencies (Line 2223)
```typescript
}, [previewOpen, autoPreview, items, diagnosis, ...]);
```

Added `autoPreview` to dependency array so the effect triggers when live preview mode is toggled.

### 11. Comprehensive Debug Logging
Added logging throughout the processing flow:
- **Line 1968-1976**: Effect trigger with all relevant state
- **Line 1978-1985**: Early return conditions with reasons
- **Line 1989**: Processing start indicator  
- **Line 1993-1995**: Container ref validation
- **Line 2005**: Source content length
- **Line 2007-2011**: Empty content detection and early exit
- **Line 2026**: Calculated margin values
- **Line 2072**: Processing completion with page count
- **Line 2219-2220**: Errors with stack traces
- **Line 2227**: Finally block execution

### 12. Empty Content Guard (Lines 2007-2011)
```typescript
if (!content || content.length < 50) {
  console.warn('⚠️ Source content is empty or too short, skipping paged.js processing');
  setPagedJsProcessing(false);
  return;
}
```

Detects and handles empty or insufficient content gracefully with clear warning messages.

## How to Test

### Prerequisites
1. **Open Browser DevTools Console** (F12 or Cmd+Option+I)
2. Navigate to a patient visit with prescription data

### Test Regular Preview Mode

1. **Open Prescription Preview**
   - Click "Print Preview" button
   - Check console for: `🔄 Paged.js useEffect triggered { previewOpen: true, ... }`
   - After ~300ms, check for: `⏱️ Starting paged.js processing...`
   - Then check for: `📄 Source content length: XXXX chars`
   - Then check for: `Paged.js Processing - Margins: { topMarginMm: X, ... }`
   - Finally check for: `✅ Paged.js processing complete - Generated X pages`

2. **Adjust Top Margin**
   - Use the "Top margin" slider in the right sidebar
   - Watch the margin value update in mm next to the label
   - Check console for new `🔄 Paged.js useEffect triggered` log
   - After ~300ms, verify processing logs appear again
   - Verify the preview visually updates with new margins
   - Content should shift down/up as margin increases/decreases

3. **Adjust Bottom Margin**
   - Use the "Bottom margin" slider
   - Verify the margin value updates in mm
   - Check console for effect trigger log
   - Verify the preview updates after ~300ms
   - Verify the content area height adjusts accordingly

### Test Live Preview Mode

1. **Enable Live Preview**
   - In the preview sidebar, click "Live Preview: Off" to toggle it on
   - Should show "Live Preview: On"
   - Preview dialog should automatically open
   - Check console for: `🔄 Paged.js useEffect triggered { previewOpen: true, autoPreview: true, ... }`

2. **Adjust Margins in Live Mode**
   - Drag top or bottom margin slider
   - Console should show effect triggering with both `previewOpen: true, autoPreview: true`
   - Preview should update automatically after ~300ms
   - Every edit should trigger re-processing in live mode

3. **Add Prescription Items**
   - Add medications or change diagnosis
   - Preview should auto-update showing the new content with current margins
   - Check console logs confirm re-processing on each change

### Test Error Scenarios

4. **Empty Content Test**
   - Clear all prescription items and diagnosis
   - Open preview
   - Check console for: `⚠️ Source content is empty or too short, skipping paged.js processing`
   - Should handle gracefully without errors

5. **Test with Frames Enabled**
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

## Troubleshooting with Console Logs

The comprehensive debug logging helps diagnose any issues:

### If margin slider moves but preview doesn't update:

1. **Check if effect is triggering:**
   - Look for `🔄 Paged.js useEffect triggered` in console
   - If missing: Effect isn't triggering (check React DevTools for state)
   - If present: Move to next step

2. **Check for early return:**
   - Look for `⚠️ Early return from paged.js effect`
   - Check the logged values: `{ previewOpen, autoPreview, hasRef }`
   - If `hasRef: false`: Container isn't mounted (should not happen if dialog is open)
   - If both `previewOpen: false` and `autoPreview: false`: Preview isn't active

3. **Check if processing starts:**
   - Look for `⏱️ Starting paged.js processing (after 300ms debounce)...`
   - If missing: Timeout was cancelled (another change triggered before 300ms elapsed)
   - If present: Processing started, move to next step

4. **Check source content:**
   - Look for `📄 Source content length: X chars`
   - If < 50 chars: Content is too short, will skip processing
   - If 0 chars: No content available (prescription is empty)

5. **Check margin calculation:**
   - Look for `Paged.js Processing - Margins: { topMarginMm: X, ... }`
   - Verify the numbers match what you expect from the slider
   - If wrong: Issue with margin calculation logic

6. **Check completion:**
   - Look for `✅ Paged.js processing complete - Generated X pages`
   - If missing but no error: Paged.js is still processing
   - If error logged: See error message for details

7. **Check for errors:**
   - Look for `❌ Paged.js processing error:`
   - Read the error message and stack trace
   - Common issues: Invalid CSS, paged.js library issues

### If nothing appears in console:

- React component might not be rendering
- Check browser console for JavaScript errors
- Verify the component file was saved and app reloaded
- Check if you're looking at the correct browser tab/console

## Verification

To verify the fix is working correctly:

1. Open browser DevTools console (F12 or Cmd+Option+I)
2. Open prescription preview
3. Adjust a margin slider
4. Within ~300ms, look for the log sequence:
   - `🔄 Paged.js useEffect triggered`
   - `⏱️ Starting paged.js processing...`
   - `📄 Source content length: X chars`
   - `Paged.js Processing - Margins: { topMarginMm: X, ... }`
   - `✅ Paged.js processing complete - Generated X pages`
   - `🏁 Paged.js processing finished (finally block)`
5. Verify the margin numbers in the log match the slider values
6. Verify the preview visually updates to show the new margins
7. Verify frames (if enabled) are positioned correctly relative to margins

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

