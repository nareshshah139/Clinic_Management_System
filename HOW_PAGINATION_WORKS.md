# How Multi-Page Pagination Works in Prescription Preview

## Visual Explanation

### Before the Fix (BROKEN)

```
┌─────────────────────────────────────┐
│  #prescription-print-root           │
│  (viewport - fixed height)          │
│  ┌───────────────────────────────┐  │
│  │ #prescription-print-content   │  │
│  │ maxHeight: one page           │  │
│  │ overflow: hidden              │  │
│  │                               │  │
│  │ ✓ Content for page 1          │  │
│  │ ✗ Content for page 2 [HIDDEN] │  │ <- CLIPPED!
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘

Result: Page 2 and 3 are empty because content was clipped at maxHeight
```

### After the Fix (WORKING)

```
Page 1 View:
┌─────────────────────────────────────┐
│  #prescription-print-root           │
│  (viewport - fixed height)          │
│  overflow: hidden                   │
│  ┌───────────────────────────────┐  │
│  │ #prescription-print-content   │  │
│  │ top: 0px                      │  │
│  │ (full natural height)         │  │
│  │                               │  │
│  │ ← ✓ Content for page 1 (VISIBLE)
│  └───────────────────────────────┘  │
│     ↓ Content for page 2            │
│     ↓ Content for page 3            │
└─────────────────────────────────────┘
     (clipped by parent's overflow)

Page 2 View (when user clicks "Next"):
┌─────────────────────────────────────┐
│  #prescription-print-root           │
│  (viewport - fixed height)          │
│  overflow: hidden                   │
│     ↑ Content for page 1            │
│  ┌───────────────────────────────┐  │
│  │ #prescription-print-content   │  │
│  │ top: -800px (negative offset) │  │
│  │ (shifted upward)              │  │
│  │                               │  │
│  │ ← ✓ Content for page 2 (VISIBLE)
│  └───────────────────────────────┘  │
│     ↓ Content for page 3            │
└─────────────────────────────────────┘
     (clipped by parent's overflow)

Result: All pages show their respective content correctly!
```

## Technical Implementation

### Component Structure

```jsx
<div id="prescription-print-root" style={{
  height: '297mm',              // Fixed page height
  overflow: 'hidden',           // Clips content to viewport
  position: 'relative'
}}>
  <div id="prescription-print-content" style={{
    // No maxHeight in paginated mode!
    minHeight: '245mm',         // At least one page worth
    position: 'relative',
    top: calculatePageOffset(), // Negative offset for page N
    transition: 'top 0.3s'      // Smooth page transitions
  }}>
    {/* All prescription content */}
    {/* Medications, instructions, etc. */}
    {/* Renders at full natural height */}
  </div>
</div>
```

### Page Offset Calculation

```javascript
// For page 1: top = 0px
// For page 2: top = -(available height of page 1 + margins)
// For page 3: top = -(available height of pages 1&2 + margins)

const calculatePageOffset = () => {
  if (currentPage === 1) return 0;
  
  const pageHeightPx = paperSize === 'LETTER' ? 1054 : 1122; // mm to px
  const topMarginPx = 150;
  const bottomMarginPx = 45;
  const availablePerPage = pageHeightPx - topMarginPx - bottomMarginPx;
  const interPageMargin = topMarginPx + bottomMarginPx;
  
  return -((currentPage - 1) * (availablePerPage + interPageMargin));
};
```

### Page Count Calculation

```javascript
// Calculate how many pages are needed
const calculateTotalPages = () => {
  const contentHeight = contentElement.scrollHeight; // Full height
  const availablePerPage = pageHeightPx - marginsPx;
  
  return Math.ceil(contentHeight / availablePerPage);
};
```

## User Experience Flow

### 1. User adds extensive content
```
Medications: 15 items
Instructions: Long paragraphs
Investigations: Multiple tests
```

### 2. System calculates pages
```
Content height: 2400px
Available per page: 800px
Total pages: 3 pages
```

### 3. User sees page 1
```
- First 800px of content visible
- Shows: Medications 1-10
- Page indicator: "Page 1 of 3"
```

### 4. User clicks "Next"
```
- Content shifts up by -995px (800px + margins)
- Shows: Medications 11-15, start of instructions
- Page indicator: "Page 2 of 3"
- Smooth transition animation
```

### 5. User clicks "Next" again
```
- Content shifts up by -1990px
- Shows: Rest of instructions, investigations
- Page indicator: "Page 3 of 3"
```

### 6. User clicks "Print"
```
- Browser's print engine takes over
- Content flows naturally across 3 pages
- Margins and background repeat on each page
- CSS page-break-inside: auto allows natural breaks
```

## Key Concepts

### 1. Viewport Pattern
The parent container acts as a fixed-size "window" or "viewport" that clips the content to show only one page at a time.

### 2. Content Sliding
Instead of showing/hiding different content, we slide the entire content block up or down using negative positioning.

### 3. Natural Height
Content is never constrained artificially - it renders at its natural height based on actual content.

### 4. Smooth Transitions
CSS transitions make page navigation feel smooth and professional.

## Advantages of This Approach

✅ **Simple** - No complex DOM manipulation or content splitting
✅ **Performant** - Content rendered once, just repositioned
✅ **Accurate** - Page breaks occur at exact calculated positions
✅ **Smooth** - CSS transitions provide good UX
✅ **Maintainable** - Clear separation of concerns

## Edge Cases Handled

### Very Long Content
- Calculation works for any content length
- Pages can go to 10, 20, 50+ if needed
- Performance remains good

### Dynamic Content Changes
- Page count recalculates when content changes
- Current page resets if it exceeds new total
- Smooth transition to new layout

### Different Paper Sizes
- Calculations adapt to A4 vs LETTER
- Offsets adjust automatically
- Page breaks at appropriate positions

### Custom Margins
- User can adjust margins via printer profiles
- Available height recalculates
- Page count updates accordingly

## Comparison with Other Approaches

### Approach 1: Physical Page Divs (Not Used)
```jsx
// Create separate div for each page
{pages.map(pageContent => (
  <div className="page">{pageContent}</div>
))}
```
❌ Complex content splitting logic
❌ Hard to determine what goes on each page
❌ Issues with tables, lists spanning pages

### Approach 2: Overflow Hidden (OLD - Broken)
```jsx
<div style={{ maxHeight: 'one page', overflow: 'hidden' }}>
  {content}
</div>
```
❌ Content beyond first page is lost
❌ Pages 2+ are empty
❌ Not acceptable

### Approach 3: Viewport with Content Sliding (CURRENT - Working!)
```jsx
<div style={{ height: 'fixed', overflow: 'hidden' }}>
  <div style={{ top: calculateOffset() }}>
    {content}
  </div>
</div>
```
✅ All content exists and is accessible
✅ Simple offset calculation
✅ Works reliably
✅ Good performance

### Approach 4: Paged.js Library (Also Available)
```jsx
<Previewer content={html} />
```
✅ Professional pagination library
✅ W3C standards compliant
✅ Handles complex layouts
⚠️ Adds ~100KB to bundle
⚠️ Processing time ~300ms

## Debugging Tips

### Content Not Showing on Page 2+
Check:
1. Is content div using `minHeight` instead of `maxHeight`?
2. Is `overflow: hidden` removed from content div?
3. Is negative offset being applied correctly?
4. Is parent viewport clipping correctly?

### Page Count Incorrect
Check:
1. Is content fully rendered before measuring?
2. Is `scrollHeight` measured after fonts load?
3. Are margins included in calculation?
4. Is 300ms delay allowing DOM to settle?

### Transition Jumpy
Check:
1. Is CSS transition on `top` property?
2. Is duration appropriate (0.3s)?
3. Is `willChange: 'top'` helping performance?

### Print Output Wrong
Check:
1. Is print CSS using `min-height` not `max-height`?
2. Is `page-break-inside: auto` present?
3. Are margins repeating on each page?
4. Is background-repeat set correctly?

## Related Documentation

- `PRESCRIPTION_OVERFLOW_FIX.md` - Detailed fix documentation
- `PRESCRIPTION_PAGINATION_FIX_SUMMARY.md` - Quick summary
- `MULTI_PAGE_PRINT_PREVIEW.md` - Original pagination implementation
- `PAGEDJS_INTEGRATION.md` - Alternative pagination engine

## Date
October 12, 2025

