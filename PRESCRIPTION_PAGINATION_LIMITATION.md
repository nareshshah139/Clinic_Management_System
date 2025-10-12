# Prescription Pagination - Custom Engine Limitations

## Current Situation

### Custom Pagination Engine
The custom pagination engine has been improved to allow content to flow to subsequent pages instead of being lost. However, there are **fundamental limitations** with margin awareness in multi-page documents.

### The Challenge

When content flows across multiple pages in the custom engine:

1. ✅ **Content is not lost** - All content exists and is accessible
2. ✅ **Page navigation works** - You can navigate between pages
3. ⚠️ **Margin awareness is limited** - Content may render in margin areas between pages

### Why This Is Complex

The custom engine uses a "viewport with content sliding" approach:
- Content renders as one continuous block
- A fixed-height viewport shows one page at a time
- Navigation shifts the content with negative offset

**The Problem:** Creating visual gaps for margins between pages in a continuous content block is technically challenging:
- CSS masks can hide content but create hard edges
- Actual spacing requires modifying content structure
- Complex layouts (tables, lists) can break across gaps awkwardly

## Recommended Solution: Use Paged.js

For prescriptions that span multiple pages (3+ pages), we **strongly recommend** using the **Paged.js** engine:

### Why Paged.js?

✅ **Professional pagination library** - Built for multi-page documents
✅ **Margin-aware** - Properly respects all margins automatically  
✅ **W3C standards compliant** - Uses official paged media specifications
✅ **Smart page breaks** - Avoids breaking tables, lists, and elements mid-content
✅ **Widow/orphan control** - Prevents awkward single lines at page boundaries
✅ **Running headers/footers** - Can repeat content on every page
✅ **Print-accurate** - Preview matches print output perfectly

### How to Use Paged.js

1. Open the print preview dialog
2. Look for "Pagination Engine" toggle in the right sidebar
3. Switch from "Custom" to "Paged.js"
4. Wait ~300ms for processing (⏳ indicator shows)
5. Navigate pages to verify content

### When to Use Each Engine

| Scenario | Recommended Engine |
|----------|-------------------|
| Single page prescription | Custom (faster) |
| 2 pages, simple content | Custom or Paged.js |
| 3+ pages | **Paged.js** |
| Complex tables/lists | **Paged.js** |
| Need perfect margin control | **Paged.js** |
| Quick preview only | Custom |
| Production printing | **Paged.js** |

## Technical Details

### Custom Engine Approach (Current)

```
┌─────────────────────┐
│ Viewport (fixed)    │
│ ┌─────────────────┐ │
│ │ Content (flows) │ │ <- Page 1 content
│ │                 │ │
│ └─────────────────┘ │
│   Content continues  │ <- Page 2 content (may touch margins)
│   Content continues  │ <- Page 3 content
└─────────────────────┘
```

Content is masked with `repeating-linear-gradient` to create 1px gaps between pages, but this is imperfect for margin representation.

### Paged.js Approach

```
┌─────────────────────┐
│ Page 1 Container    │
│ ┌─────────────────┐ │
│ │ Content         │ │ <- Proper margins
│ └─────────────────┘ │
└─────────────────────┘

[Proper margin space]

┌─────────────────────┐
│ Page 2 Container    │
│ ┌─────────────────┐ │
│ │ Content         │ │ <- Proper margins
│ └─────────────────┘ │
└─────────────────────┘
```

Paged.js creates separate page containers with proper margin handling.

## Implementation Status

### What's Been Fixed (v2.1)
- ✅ Content flows to next page (not lost)
- ✅ Page navigation works correctly
- ✅ Mask image creates basic separation between pages
- ✅ Paged.js integration available as alternative

### Known Limitations (Custom Engine)
- ⚠️ Margin gaps are minimal (1px) between pages
- ⚠️ Content near page boundaries may appear in margin areas
- ⚠️ No intelligent page break placement
- ⚠️ Tables/lists can break mid-element

### Future Considerations

**Option A: Improve Custom Engine** (Complex)
- Implement content splitting algorithm
- Create physical page containers
- Calculate where to break content
- Handle tables, lists, images specially
- **Estimate:** 2-3 weeks of development

**Option B: Enhance Paged.js Integration** (Recommended)
- Make Paged.js the default for 3+ pages
- Auto-switch when content exceeds 2 pages
- Optimize performance
- Add more Paged.js features
- **Estimate:** 3-5 days of development

**Option C: Hybrid Approach**
- Keep custom for single page
- Auto-use Paged.js for multi-page
- **Estimate:** 1-2 days

## User Guidance

### For Users

If you notice content appearing in margin areas when navigating between pages:

1. **Switch to Paged.js** - Toggle in the preview sidebar
2. **Adjust content** - Reduce content to fit on fewer pages
3. **Review each page** - Check all pages before printing
4. **Use scroll mode** - If you just need to see all content at once

### For Developers

The custom engine code is in `PrescriptionBuilder.tsx` lines 3131-3205:
- `minHeight`: Sets content area for all pages
- `WebkitMaskImage`/`maskImage`: Creates repeating pattern to mask margins
- `top` offset calculation: Shifts content for page navigation

For production multi-page documents, guide users to Paged.js.

## Related Documentation

- `PAGEDJS_INTEGRATION.md` - Full Paged.js documentation
- `HOW_PAGINATION_WORKS.md` - How custom pagination works
- `PRESCRIPTION_OVERFLOW_FIX.md` - History of pagination fixes

## Conclusion

The custom pagination engine is suitable for:
- ✅ Single page prescriptions
- ✅ Quick previews
- ✅ Simple 2-page documents

For complex multi-page documents with strict margin requirements:
- ✅ **Use Paged.js** - It's already integrated and ready to use

## Date
October 12, 2025

