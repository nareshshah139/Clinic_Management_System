# Paged.js Quick Start Guide

## 🚀 How to Use Paged.js in Prescription Builder

### Step 1: Open Prescription Builder
Navigate to any visit and open the prescription builder.

### Step 2: Open Print Preview
Click the **Preview** button to open the print preview dialog.

### Step 3: Toggle Pagination Engine
In the right sidebar, look for the **Pagination Engine** section:

```
┌──────────────────────────────┐
│  Pagination Engine           │
│  ┌─────────┐  ┌─────────┐   │
│  │ Custom  │  │Paged.js⏳│   │  ← Click here!
│  └─────────┘  └─────────┘   │
│  Using Paged.js library...   │
└──────────────────────────────┘
```

### Step 4: Wait for Processing
- You'll see a ⏳ indicator while Paged.js processes
- Usually takes ~300ms for typical prescriptions
- Page count updates automatically

### Step 5: Navigate Pages
- Use the **Page Navigation** controls below
- Click **Prev** / **Next** buttons
- Or type a page number directly

### Step 6: Print
- Click the **Print** button at the bottom
- Browser print dialog opens
- Content is properly paginated with no overflow!

## 🎯 When to Use Paged.js

### ✅ Use Paged.js When:
- Prescription spans 3+ pages
- You have large medication tables
- Content keeps overflowing margins
- You want professional publishing quality
- You need automatic widow/orphan control

### ⚡ Use Custom When:
- Short, simple prescriptions (1-2 pages)
- You need precise manual control
- You're familiar with the existing system
- Maximum processing speed is critical

## 🔄 Switching Between Engines

You can switch between engines at any time:
1. Click **Custom** to use manual overflow handling
2. Click **Paged.js** to use automatic pagination
3. Changes apply instantly
4. No data is lost when switching

## ⚙️ What Happens Behind the Scenes

### Custom Engine
- Uses CSS `max-height` and `overflow: hidden`
- Content is manually constrained to page size
- You control page breaks with checkboxes
- Fast but requires manual adjustment

### Paged.js Engine
- Analyzes content and creates optimal page breaks
- Keeps related items together (medications, tables)
- Respects margin settings automatically
- Slightly slower but produces better results

## 🎨 Visual Differences

### Custom Engine
- Single container with overflow hidden
- Manual page break controls
- Scroll or paginated view modes

### Paged.js Engine
- Multiple page containers (`.pagedjs_page`)
- Automatic page breaks
- Always shows as separate pages
- Smooth scrolling between pages

## 🔧 Tips & Tricks

### 1. Long Medication Lists
If medications span multiple pages, Paged.js will keep each medication entry together (no splits between drug name and dosage).

### 2. Large Tables
Paged.js tries to keep table rows together. If a table is too large, it will split at row boundaries.

### 3. Custom Sections
Long custom sections will be split intelligently across pages.

### 4. Investigations
Investigation lists break naturally without splitting individual items.

### 5. Follow-up Instructions
Long instructions flow naturally across pages while respecting margins.

## 🐛 Troubleshooting

### "Paged.js is taking too long"
**Normal!** First processing takes ~300-500ms. If content changes, it re-processes.

### "Content looks different than custom mode"
**Expected!** Paged.js uses different algorithms. It may place page breaks differently.

### "Page count is different"
**Normal!** Paged.js optimizes pagination, which may result in different page counts than custom mode.

### "Got an error message"
Paged.js automatically falls back to custom mode if it encounters an error. Your content is safe!

### "Background image missing"
Ensure your letterhead image URL is accessible and not blocked by CORS.

## 📱 Keyboard Shortcuts

When in preview mode:
- **Esc** - Close preview
- **Arrow Keys** - Navigate content offset (custom mode only)

## 🖨️ Printing Tips

### Before Printing
1. Choose your pagination engine
2. Preview all pages
3. Check margins look correct
4. Verify no content is cut off

### In Print Dialog
1. Turn OFF browser headers/footers
2. Set margins to "None" or "Minimum"
3. Choose "Background graphics" ON
4. Select correct paper size (A4 or Letter)

### After Printing
- Check first page for proper alignment
- Verify letterhead appears correctly
- Confirm all pages printed
- Keep as reference for future prints

## 🎓 Learning More

For advanced features and technical details, see:
- `PAGEDJS_INTEGRATION.md` - Full technical documentation
- `PRESCRIPTION_OVERFLOW_FIX.md` - Custom engine overflow fix
- https://pagedjs.org/ - Official Paged.js documentation

## 🎉 That's It!

You now have two powerful pagination options:
1. **Custom** - Fast, manual control
2. **Paged.js** - Smart, automatic, professional

Choose the one that fits your workflow and enjoy overflow-free prescriptions! 🎈

