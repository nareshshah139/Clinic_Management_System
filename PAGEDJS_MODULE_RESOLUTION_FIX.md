# PagedJS Module Resolution Fix

## Problem
The application was throwing a console error when trying to use PagedJS:
```
Error: Cannot find module 'es5-ext/array/#/remove'
```

This was caused by:
1. **Workspace Hoisting**: The monorepo structure hoists `pagedjs` and `es5-ext` packages to the root-level `node_modules`
2. **Turbopack Module Resolution**: Next.js with Turbopack (dev mode) was unable to resolve modules from the parent `node_modules` directory
3. **Unusual Path**: The `es5-ext` package uses unconventional paths with `#` characters (e.g., `array/#/remove.js`) which complicates module resolution

## Solution Applied

### 1. Disabled Turbopack
**File**: `frontend/package.json`

Changed the dev script from:
```json
"dev": "next dev --turbopack --port 3000"
```
to:
```json
"dev": "next dev --port 3000"
```

**Reason**: Turbopack has its own module resolution system that doesn't use webpack configuration, and it has difficulty resolving the hoisted `es5-ext` package with unusual paths (containing `#` characters). Running without Turbopack uses the standard webpack bundler which respects our custom webpack configuration.

### 2. Updated Next.js Configuration
**File**: `frontend/next.config.ts`

- Added `pagedjs` to `transpilePackages` array
- Enhanced webpack configuration to:
  - Add fallbacks for Node.js modules (`fs`, `path`)
  - Include parent `node_modules` in module resolution paths
  - Add explicit alias for `es5-ext` to resolve to the root-level package
  - This ensures both dev and production builds work correctly

### 3. Created Symlinks (Backup Solution)
**Files**: 
- `frontend/node_modules/pagedjs` → `/Users/nshah/Clinic_Management_System/node_modules/pagedjs`
- `frontend/node_modules/es5-ext` → `/Users/nshah/Clinic_Management_System/node_modules/es5-ext`

These symlinks provide a fallback if needed, though the main solution is using webpack instead of Turbopack.

### 4. Updated .gitignore
Added entries to prevent the symlinks from being committed to git:
```
node_modules/pagedjs
node_modules/es5-ext
```

## Testing
To verify the fix:
1. **Restart your development server**: Kill the current `npm run dev` process and start it again
2. **Navigate to a page that uses PagedJS** (e.g., PrescriptionBuilder with print preview)
3. **Check browser console** - the module error should be gone

## For Other Developers
If another developer clones this repository and encounters the same error, they need to:
1. Run `npm install` in the root directory
2. Create the symlinks:
   ```bash
   cd frontend
   ln -s /absolute/path/to/root/node_modules/pagedjs node_modules/pagedjs
   ln -s /absolute/path/to/root/node_modules/es5-ext node_modules/es5-ext
   ```
   Or use this automated script:
   ```bash
   cd frontend
   ln -s "$(cd .. && pwd)/node_modules/pagedjs" node_modules/pagedjs
   ln -s "$(cd .. && pwd)/node_modules/es5-ext" node_modules/es5-ext
   ```

## Alternative Solutions Considered
1. **✅ Disable Turbopack** (CHOSEN): Run without `--turbopack` flag
   - Pros: Uses standard webpack which respects our custom config
   - Cons: Slightly slower dev builds (but still fast with webpack 5)
   
2. **Move packages**: Install `pagedjs` and `es5-ext` directly in frontend
   - Pros: Simpler module resolution
   - Cons: Duplicates dependencies, increases bundle size
   
3. **Different pagination library**: Replace PagedJS with an alternative
   - Pros: Might avoid these issues entirely
   - Cons: Significant refactoring, PagedJS is specifically designed for CSS paged media

## Related Files
- `frontend/next.config.ts` - Updated configuration
- `frontend/.gitignore` - Symlink exclusions
- `frontend/src/components/visits/PrescriptionBuilder.tsx` - Component using PagedJS

