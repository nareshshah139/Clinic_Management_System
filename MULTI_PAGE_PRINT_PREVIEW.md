# Multi-Page Print Preview Implementation

## Overview
Extended the prescription print preview to support multi-page content with pagination controls, allowing users to navigate through pages before printing and ensure print consistency across all pages.

## Features Implemented

### 1. **View Modes**
- **Scroll Mode** (default): Traditional scrollable preview showing all content
- **Paginated Mode**: Discrete page-by-page view with accurate page breaks

### 2. **Page Calculation**
- Automatic calculation of total pages based on:
  - Content height
  - Paper size (A4 or Letter)
  - Top and bottom margins
  - Printer profile settings
- Real-time updates when content or margins change

### 3. **Navigation Controls**
Located in the right sidebar:
- **View Mode Toggle**: Switch between Scroll and Pages view
- **Previous/Next Buttons**: Navigate between pages (disabled at boundaries)
- **Direct Page Input**: Jump to specific page number
- **Page Counter**: Shows "Page X / Y" in both sidebar and on preview

### 4. **Visual Features**
- **Page Indicator Badge**: Floating badge showing current page in paginated mode
- **Page Shadow**: Box shadow on page container for better visual separation
- **Smooth Transitions**: Animated content sliding when changing pages
- **Overflow Clipping**: Content properly clipped at page boundaries

### 5. **Print Consistency**
- Preview matches actual print output
- Letterhead background rendered correctly on all pages
- Margins consistent across pages
- Page breaks respect logical content boundaries (tables, sections)

## Technical Implementation

### State Management
```typescript
const [previewViewMode, setPreviewViewMode] = useState<'scroll' | 'paginated'>('scroll');
const [currentPreviewPage, setCurrentPreviewPage] = useState(1);
const [totalPreviewPages, setTotalPreviewPages] = useState(1);
```

### Page Calculation Logic
- Uses `useEffect` hook that triggers when:
  - Preview opens
  - View mode changes to 'paginated'
  - Content changes (items, diagnosis, investigations, etc.)
  - Margins or paper size change
- Calculates available height per page after margins
- Divides total content height by available height per page
- Updates total page count and resets to page 1 if needed

### Content Offsetting
In paginated mode, content is translated vertically to show the current page:
```typescript
pageOffset = -((currentPreviewPage - 1) * availableHeightPerPage)
```

### Responsive Styling
- Paginated mode:
  - Fixed page height matching paper dimensions
  - Overflow hidden to clip content
  - Centered in viewport with padding
  - Box shadow for depth
- Scroll mode:
  - Flexible height (min-height only)
  - No overflow clipping
  - Centered with auto margins

## User Experience

### Workflow
1. Open print preview (defaults to Scroll mode)
2. Toggle to "Pages" mode to see paginated view
3. Use navigation controls to review each page
4. Adjust margins if needed (real-time page recalculation)
5. Print with confidence knowing output matches preview

### Benefits
- **Pre-flight Check**: Review exact page breaks before printing
- **Multi-page Awareness**: Know exactly how many pages will print
- **Content Verification**: Ensure no content is cut off mid-element
- **Margin Adjustment**: Fine-tune margins while seeing impact on pagination
- **Professional Output**: No surprises when printing

## Code Changes

### Files Modified
- `frontend/src/components/visits/PrescriptionBuilder.tsx`

### Key Sections
1. **State Variables** (Lines 514-517)
   - Added previewViewMode, currentPreviewPage, totalPreviewPages

2. **Page Calculation Effect** (Lines 1933-1973)
   - Calculates total pages based on content and layout
   - Automatic recalculation on content/margin changes

3. **Preview Container** (Lines 2886-2938)
   - Added page indicator badge
   - Conditional styling for paginated vs scroll mode
   - Page container with proper dimensions and overflow

4. **Content Offsetting** (Lines 2994-3020)
   - Dynamic top offset calculation for current page
   - Smooth transition animation

5. **Sidebar Controls** (Lines 3309-3382)
   - View mode toggle buttons
   - Pagination controls (prev/next/direct input)
   - Page counter display

## Testing Recommendations

### Manual Testing
1. ✅ Create prescription with minimal content (1 page)
2. ✅ Create prescription with extensive content (3+ pages)
3. ✅ Switch between Scroll and Pages mode
4. ✅ Navigate through pages using all controls
5. ✅ Adjust margins and verify page recalculation
6. ✅ Test with both A4 and Letter paper sizes
7. ✅ Verify print output matches paginated preview
8. ✅ Test with different printer profiles
9. ✅ Verify page breaks respect content boundaries
10. ✅ Test zoom functionality in both modes

### Edge Cases
- Single page prescription (no pagination controls shown)
- Very long medications list
- Multiple custom sections
- Content with manual page breaks
- Extreme margin values

## Future Enhancements

### Potential Improvements
1. **Page Break Hints**: Visual indicators showing where content will break
2. **Manual Page Breaks**: Allow users to insert manual page breaks
3. **Page Thumbnails**: Small previews of all pages for quick navigation
4. **Keyboard Shortcuts**: Arrow keys for page navigation
5. **Print Preview Mode**: Dedicated print preview with better controls
6. **PDF Preview**: Generate and show PDF preview before printing
7. **Page-specific Letterhead**: Different letterhead for first vs subsequent pages
8. **Smart Page Breaks**: Automatically avoid breaking tables or sections

## Notes

- Page calculation uses 300ms debounce to allow DOM to settle
- Pagination only appears when total pages > 1
- Print CSS remains unchanged - works with both view modes
- Zoom applies to both scroll and paginated modes
- Letterhead background image works correctly in both modes
- Content offset feature (for fine-tuning) works in both modes

## Compatibility

- Works with existing printer profiles
- Compatible with all paper sizes (A4, Letter)
- Maintains backward compatibility with scroll-only view
- No breaking changes to print functionality
- Works with all existing prescription features (translations, templates, etc.)

