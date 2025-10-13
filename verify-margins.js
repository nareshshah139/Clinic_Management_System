// ============================================================================
// MARGIN VERIFICATION SCRIPT
// ============================================================================
// Run this in Chrome DevTools Console after opening Print Preview
//
// Usage:
//   1. Open http://localhost:3000
//   2. Navigate to Prescription Builder
//   3. Click "Print Preview"
//   4. Open DevTools (F12)
//   5. Copy/paste this entire file into Console
//   6. Run: verifyMargins()
// ============================================================================

window.verifyMargins = function() {
  console.clear();
  console.log('🔍 MARGIN VERIFICATION STARTING...\n');
  
  // Step 1: Check if preview is open
  const container = document.getElementById('pagedjs-container');
  if (!container) {
    console.error('❌ FAIL: #pagedjs-container not found. Is Print Preview open?');
    return;
  }
  console.log('✅ Step 1: Paged.js container found');
  
  // Step 2: Check for duplicate @page rules in dialog CSS
  const dialogStyles = Array.from(document.querySelectorAll('style'))
    .filter(s => {
      const text = s.textContent || '';
      return text.includes('@media print') && 
             (text.includes('#pagedjs-container') || text.includes('#prescription-print-root'));
    });
  
  console.log('\n📋 Step 2: Checking dialog CSS...');
  dialogStyles.forEach((style, idx) => {
    const text = style.textContent || '';
    const hasAtPage = text.includes('@page {');
    const hasPaddingTop = text.includes('padding-top:') && text.includes('mm');
    const hasPrescriptionRoot = text.includes('#prescription-print-root {');
    
    console.log(`  Dialog style ${idx + 1}:`);
    console.log(`    - Has @page block: ${hasAtPage ? '❌ BAD (duplicate)' : '✅ GOOD (removed)'}`);
    console.log(`    - Has #prescription-print-root with padding-top: ${hasPrescriptionRoot && hasPaddingTop ? '❌ BAD (duplicate)' : '✅ GOOD (removed)'}`);
  });
  
  // Step 3: Find the Paged.js injected CSS
  console.log('\n📋 Step 3: Checking Paged.js injected CSS...');
  const pagedPages = container.querySelectorAll('.pagedjs_page');
  console.log(`  - Pages generated: ${pagedPages.length}`);
  
  if (pagedPages.length === 0) {
    console.warn('⚠️  No pages yet. Waiting for Paged.js to finish...');
    console.log('   Try running this script again in 1-2 seconds.');
    return;
  }
  
  // Look for the inline style in the temp div that Paged.js processed
  const allStyles = Array.from(document.querySelectorAll('style'));
  const pagedStyle = allStyles.find(s => {
    const text = s.textContent || '';
    return text.includes('@page {') && 
           text.includes('margin-top:') && 
           text.includes('mm !important');
  });
  
  if (pagedStyle) {
    const text = pagedStyle.textContent || '';
    const marginMatch = text.match(/margin-top:\s*([0-9.]+)mm/);
    const topMarginMm = marginMatch ? marginMatch[1] : 'NOT FOUND';
    console.log(`  ✅ Found Paged.js @page CSS with margin-top: ${topMarginMm}mm`);
  } else {
    console.warn('  ⚠️  Could not find Paged.js @page CSS (may be in shadow DOM or processed)');
  }
  
  // Step 4: Check the slider value
  console.log('\n📋 Step 4: Checking UI slider...');
  const sliders = Array.from(document.querySelectorAll('input[type="range"]'));
  const topMarginSlider = sliders.find(s => {
    const label = s.previousElementSibling?.textContent || s.parentElement?.textContent || '';
    return label.toLowerCase().includes('top margin');
  });
  
  if (topMarginSlider) {
    const sliderValuePx = topMarginSlider.value;
    const sliderValueMm = Math.round((Number(sliderValuePx) / 3.78) * 10) / 10;
    console.log(`  ✅ Top margin slider found:`);
    console.log(`     - Slider value: ${sliderValuePx}px`);
    console.log(`     - Converted to mm: ${sliderValueMm}mm`);
    console.log(`     - This should match the Paged.js margin-top above ☝️`);
  } else {
    console.warn('  ⚠️  Top margin slider not found in preview sidebar');
  }
  
  // Step 5: Live test instructions
  console.log('\n🧪 Step 5: LIVE TEST');
  console.log('  To prove the margin is wired to UI:');
  console.log('  1. Find the "Top margin" slider in the preview sidebar');
  console.log('  2. Move it to a different value (e.g., 200px)');
  console.log('  3. Wait ~300ms');
  console.log('  4. Look for console log: "Paged.js Processing - Margins: { topMarginMm: X }"');
  console.log('  5. Run this script again: verifyMargins()');
  console.log('  6. The margin-top value should change to match your slider');
  
  console.log('\n✨ VERIFICATION COMPLETE');
  console.log('If all steps are ✅ and slider changes the Paged.js margin, the fix is working!');
};

// Auto-run on load
console.log('📦 Margin verification script loaded!');
console.log('Run: verifyMargins()');
console.log('');

// Also set up a listener to log margin changes
let lastLogTime = 0;
const originalLog = console.log;
console.log = function(...args) {
  const str = args.join(' ');
  if (str.includes('Paged.js Processing - Margins:')) {
    const now = Date.now();
    if (now - lastLogTime > 100) { // Debounce
      originalLog.apply(console, ['🎯 MARGIN CHANGE DETECTED:', ...args]);
      lastLogTime = now;
    }
  }
  originalLog.apply(console, args);
};

