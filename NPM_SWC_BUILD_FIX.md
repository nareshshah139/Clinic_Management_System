# NPM @swc/core Build Error Fix

## Problem Summary

**Error**: `npm error command sh -c node postinstall.js` followed by `Bus error (core dumped)` when installing `@swc/core`

**Root Cause**: The `@swc/core` package requires:
1. Native compilation during installation
2. Adequate memory (minimum 2GB, recommended 4GB)
3. Build tools (python3, make, g++, etc.)
4. Proper CPU architecture support

## Solutions Implemented

### 1. ✅ Updated Backend Dockerfile

**File**: `backend/Dockerfile`

**Changes**:
- Added build dependencies to the `deps` stage
- Increased Node.js memory allocation to 4GB
- Ensured python3 and build-essential are available during all build stages

```dockerfile
# Before: deps stage lacked build tools
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# After: deps stage has build tools
FROM base AS deps
RUN apt-get update && apt-get install -y python3 build-essential && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
```

### 2. ✅ Optimized Railway Build Configuration

**File**: `backend/railway.toml`

**Changes**:
- Added `NODE_OPTIONS=--max-old-space-size=4096` to increase memory allocation
- Ensures Railway has sufficient memory during npm install

```toml
# Before
build = "npm ci && npx prisma generate && npm run build"

# After
build = "NODE_OPTIONS=--max-old-space-size=4096 npm ci && npx prisma generate && npm run build"
```

### 3. ✅ Created .npmrc Configuration

**File**: `backend/.npmrc`

**Purpose**: 
- Optimizes npm installation behavior
- Adds retry logic for network failures
- Reduces parallel operations to minimize memory spikes

## Verification Steps

### Local Docker Build

```bash
cd /Users/nshah/Clinic_Management_System/backend
docker build -t cms-backend:test .
```

Expected: Build should complete without "Bus error"

### Local npm Install

```bash
cd /Users/nshah/Clinic_Management_System/backend
rm -rf node_modules package-lock.json
npm install
```

Expected: `@swc/core` should install successfully

### Railway Deployment

1. Commit and push changes:
```bash
git add backend/Dockerfile backend/railway.toml backend/.npmrc
git commit -m "fix: resolve @swc/core build errors with memory and dependency fixes"
git push origin main
```

2. Monitor Railway build logs for successful completion

## Alternative Solutions (If Above Doesn't Work)

### Option A: Use @swc/core Binary Release

If compilation continues to fail, you can force @swc/core to use prebuilt binaries:

```bash
# Add to backend/.npmrc
swc_use_binary=true
```

### Option B: Switch to ts-node for Development

If @swc is only needed for development, you can remove it and use ts-node:

```json
// backend/package.json - devDependencies
{
  "devDependencies": {
    // Remove:
    // "@swc/cli": "^0.7.8",
    // "@swc/core": "^1.13.5",
    
    // Already present:
    "ts-node": "^10.9.2"
  }
}
```

### Option C: Increase Railway Memory Allocation

In Railway dashboard:
1. Go to your backend service
2. Click "Settings"
3. Under "Resources", ensure you have at least:
   - **Memory**: 2GB minimum (4GB recommended)
   - **CPU**: 1 vCPU minimum

### Option D: Use Node.js 20 Full Image (Not Slim)

If the slim image continues to cause issues:

```dockerfile
# Change:
FROM node:20-slim AS base

# To:
FROM node:20 AS base
```

**Trade-off**: Larger image size (~300MB more) but includes all build tools

## Deprecated Package Warnings

The following warnings are non-critical but should be addressed in future updates:

```
npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory.
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
npm warn deprecated @babel/polyfill@7.12.1: This package has been deprecated
npm warn deprecated core-js@2.6.12: core-js@<3.23.3 is no longer maintained
```

### How to Fix (Lower Priority):

```bash
# Audit and update dependencies
cd backend
npm audit
npm update

# For specific packages, check which dependencies require them
npm ls inflight
npm ls glob
```

## Monitoring Build Success

### Key Indicators of Successful Fix:

1. ✅ No "Bus error (core dumped)" in logs
2. ✅ `@swc/core` postinstall completes successfully
3. ✅ Build completes with only warnings (no errors)
4. ✅ Backend starts successfully after build

### Build Time Expectations:

- **Local Docker Build**: 5-10 minutes (first time), 2-3 minutes (cached)
- **Railway Build**: 3-7 minutes depending on resources
- **Local npm install**: 2-4 minutes

## Additional Resources

- [@swc/core Documentation](https://swc.rs/docs/installation)
- [Node.js Memory Management](https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-megabytes)
- [Railway Build Configuration](https://docs.railway.app/deploy/builds)

## Summary of Files Changed

1. ✅ `backend/Dockerfile` - Added build dependencies and memory optimization
2. ✅ `backend/railway.toml` - Increased Node.js memory allocation
3. ✅ `backend/.npmrc` - Created with optimized build settings
4. ✅ `NPM_SWC_BUILD_FIX.md` - This documentation

## Next Steps

1. Test the Docker build locally first
2. If successful, commit and push to trigger Railway deployment
3. Monitor Railway build logs
4. If issues persist, try Alternative Solutions in order (A → B → C → D)

---

**Created**: October 24, 2025
**Last Updated**: October 24, 2025
**Status**: ✅ Ready for Testing

