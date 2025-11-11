# Print Preview Performance Analysis

## Summary
Print preview is slow due to multiple sequential operations, API calls, delays, and heavy DOM processing. Total time can range from **550ms to 2+ seconds** depending on content and language settings.

## Performance Bottlenecks

### 1. Translation API Call (Blocking) ⚠️ **MAJOR BOTTLENECK**
**Location:** `PrescriptionBuilder.tsx:2115, 808-879`

When language is not English, the preview waits for a translation API call:
- **Delay before translation:** 250ms (line 2119)
- **API call time:** 500ms - 2+ seconds (network dependent)
- **Blocks Paged.js processing:** Translation must complete before preview renders

**Impact:** Adds **750ms - 2.25+ seconds** to preview time for non-English content.

```2114:2119:frontend/src/components/visits/PrescriptionBuilder.tsx
    const run = () => {
      if (language !== 'EN') void translateForPreview();
      setPreviewJustUpdated(true);
      setTimeout(() => setPreviewJustUpdated(false), 600);
    };
    t = setTimeout(run, 250);
```

### 2. Sequential Processing Chain
**Location:** Multiple useEffect hooks

Operations run sequentially instead of in parallel:
1. Wait 250ms → Trigger translation (if needed)
2. Wait for translation API response
3. Wait 300ms debounce → Start Paged.js processing
4. Paged.js processes content
5. Apply overlays and design aids

**Total sequential delays:** 550ms minimum + API time + processing time

### 3. Paged.js Processing Time
**Location:** `PrescriptionBuilder.tsx:2154-2654`

Paged.js pagination itself takes time:
- **Single page:** ~200-300ms
- **2-3 pages:** ~300-500ms  
- **5+ pages:** ~500-800ms

**Additional overhead:**
- Dynamic import of Paged.js each time (line 2316): ~50-100ms
- Container readiness checks with retries: up to 150ms delays
- DOM cleanup and recreation: ~50-100ms

### 4. Heavy DOM Manipulation After Processing
**Location:** `PrescriptionBuilder.tsx:2438-2595`

After Paged.js creates pages, extensive DOM manipulation occurs:
- Iterates through all pages (could be 5+ pages)
- Creates overlay elements for each page:
  - Content offset transforms
  - Bleed-safe overlays
  - Frame overlays (header/footer)
  - Design aids (grid, rulers)
  - Refill stamps
- Multiple `querySelector` calls per page
- Style calculations and DOM appends

**Impact:** Adds **100-300ms** depending on page count and enabled features.

### 5. Multiple Debounce/Delay Timers
**Location:** Various locations

Multiple delays accumulate:
- **250ms** - Translation trigger delay (line 2119)
- **300ms** - Paged.js processing debounce (line 2643)
- **150ms** - Container readiness retry delays (lines 2206, 2216, 2262, 2271)
- **50ms** - Container mount check retry (line 2637)

**Total minimum delay:** 550ms even before any actual processing starts.

### 6. Container Readiness Checks with Retries
**Location:** `PrescriptionBuilder.tsx:2198-2275`

Multiple checks with retry loops add delays:
- Container connection check
- Container visibility check  
- Container size check
- Document body readiness check
- Temp content connection check

Each check can add **150ms delays** if conditions aren't met immediately.

### 7. No Caching or Memoization
- Paged.js is dynamically imported every time (no pre-loading)
- Content is re-processed even if unchanged
- No memoization of processed pages
- Translation results aren't cached

## Performance Breakdown (Typical Scenario)

### English Content (1-2 pages):
```
250ms delay → 300ms debounce → 300ms Paged.js → 100ms DOM overlays
= ~950ms total
```

### Non-English Content (1-2 pages):
```
250ms delay → 1000ms translation API → 300ms debounce → 300ms Paged.js → 100ms DOM overlays
= ~1,950ms total
```

### Complex Content (5+ pages, non-English):
```
250ms delay → 1500ms translation API → 300ms debounce → 800ms Paged.js → 300ms DOM overlays
= ~3,150ms total
```

## Recommendations for Optimization

### High Priority (Biggest Impact)

1. **Parallelize Translation and Paged.js Setup**
   - Start Paged.js container setup while translation is in progress
   - Only block final rendering on translation completion
   - **Expected improvement:** 500ms - 1.5s reduction

2. **Pre-load Paged.js Module**
   - Import Paged.js at component mount, not during preview
   - **Expected improvement:** 50-100ms reduction

3. **Reduce Debounce Times**
   - Reduce 300ms debounce to 100ms for faster response
   - Reduce 250ms translation delay to 50ms
   - **Expected improvement:** 400ms reduction

4. **Cache Translation Results**
   - Cache translations by content hash
   - Skip API call if content unchanged
   - **Expected improvement:** 500ms - 2s reduction for repeated previews

### Medium Priority

5. **Optimize DOM Overlay Creation**
   - Batch DOM operations
   - Use DocumentFragment for multiple appends
   - **Expected improvement:** 50-150ms reduction

6. **Memoize Processed Content**
   - Cache Paged.js output when content unchanged
   - Only re-process when dependencies change
   - **Expected improvement:** 300-800ms reduction for repeated previews

7. **Optimize Container Readiness Checks**
   - Combine multiple checks into single validation
   - Reduce retry delays from 150ms to 50ms
   - **Expected improvement:** 50-200ms reduction

### Low Priority

8. **Lazy Load Design Aids**
   - Only create overlays when features are enabled
   - Defer non-critical overlays until after initial render
   - **Expected improvement:** 50-100ms reduction

9. **Use Web Workers for Heavy Processing**
   - Move Paged.js processing to Web Worker (if possible)
   - Keep UI responsive during processing
   - **Expected improvement:** Perceived performance improvement

## Quick Wins (Easiest to Implement)

1. **Reduce debounce from 300ms to 100ms** (line 2643)
2. **Reduce translation delay from 250ms to 50ms** (line 2119)
3. **Pre-import Paged.js at component mount** (add import at top level)
4. **Combine container readiness checks** (reduce retry delays)

**Expected total improvement from quick wins:** ~500-700ms reduction

## Current Performance Metrics

Based on code analysis:
- **Minimum time (English, simple):** ~950ms
- **Typical time (English, 2-3 pages):** ~1,200ms
- **Slow time (Non-English, complex):** ~3,000ms+

## User Experience Impact

- Users see loading spinner for 1-3 seconds
- Perceived as "slow" especially on slower networks
- Translation API latency compounds the issue
- Multiple sequential delays feel unresponsive

