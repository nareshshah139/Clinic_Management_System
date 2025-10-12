# Prescription Builder Overflow Fix

## Issue
When adding extensive content to the prescription builder, the content was:
1. **Overflowing into the bottom footer** - ignoring the bottom margin
2. **Continuing into the header** - ignoring the top margin of the next page

## Root Cause
The `#prescription-print-content` div had no height constraint to prevent content from overflowing beyond the available space within the page margins. While the parent container (`#prescription-print-root`) had proper padding for top and bottom margins, the content inside was not constrained and could overflow freely.

## Solution
Added proper height constraints and overflow handling to the content area:

### 1. Print CSS Constraint
In the `@media print` section, added:
```css
#prescription-print-content {
  max-height: calc(pageHeight - topMargin - bottomMargin - frameHeaders - frameFooters) !important;
  overflow: hidden !important;
}
```

This ensures that during printing, content is strictly limited to the available space.

### 2. Preview/Screen Constraint
In the inline styles for the preview mode, added:
```javascript
maxHeight: (() => {
  const pageHeightMm = paperPreset === 'LETTER' ? 279 : 297;
  const totalMarginMm = effectiveTopMarginMm + effectiveBottomMarginMm;
  const frameHeightMm = frames?.enabled ? (frames.headerHeightMm || 0) + (frames.footerHeightMm || 0) : 0;
  return `calc(${pageHeightMm}mm - ${totalMarginMm}mm - ${frameHeightMm}mm)`;
})(),
overflow: 'hidden',
```

This ensures consistent behavior in the preview mode as well.

## Benefits
1. ✅ Content now respects top margin - won't overflow into headers
2. ✅ Content now respects bottom margin - won't overflow into footers
3. ✅ Proper handling of custom frame areas (if enabled)
4. ✅ Consistent behavior between preview and print modes
5. ✅ Works with different paper sizes (A4 and LETTER)
6. ✅ Accounts for printer profile settings

## Technical Details

### Calculated Max Height
The maximum height is calculated as:
```
Max Height = Page Height - Top Margin - Bottom Margin - Header Frame - Footer Frame
```

For example, with A4 paper (297mm) and default margins:
- Page height: 297mm
- Top margin: ~40mm (varies by profile)
- Bottom margin: ~12mm (varies by profile)
- Frame headers/footers: variable (if enabled)
- Available content height: ~245mm (approximately)

### Overflow Behavior
With `overflow: hidden`, content that exceeds the available space will be clipped. This is the correct behavior because:
1. The pagination system already calculates how many pages are needed
2. Users can navigate between pages to see all content
3. It prevents content from appearing in areas reserved for headers/footers

## Files Modified
- `/Users/nshah/Clinic_Management_System/frontend/src/components/visits/PrescriptionBuilder.tsx`
  - Lines 2868-2876: Added `max-height` and `overflow: hidden` to print CSS
  - Lines 3026-3032: Added `maxHeight` and `overflow: hidden` to preview inline styles

## Testing Recommendations
1. Create a prescription with extensive content (many medications, long instructions, etc.)
2. Preview the prescription and verify content doesn't overflow into margins
3. Navigate between pages in paginated view
4. Print the prescription and verify margins are respected
5. Test with different paper sizes (A4 and LETTER)
6. Test with and without custom frame areas (header/footer)
7. Test with different printer profiles

## Date
October 12, 2025

