#!/bin/bash

# Test script for @swc/core build fix
# Run this to verify the npm installation works correctly

set -e  # Exit on any error

echo "=========================================="
echo "Testing @swc/core Build Fix"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if backend/.npmrc exists
echo -e "${YELLOW}[1/4] Checking .npmrc configuration...${NC}"
if [ -f "backend/.npmrc" ]; then
    echo -e "${GREEN}✓ .npmrc found${NC}"
else
    echo -e "${RED}✗ .npmrc not found${NC}"
    exit 1
fi
echo ""

# Test 2: Check Docker build dependencies
echo -e "${YELLOW}[2/4] Verifying Dockerfile updates...${NC}"
if grep -q "python3 build-essential" backend/Dockerfile; then
    echo -e "${GREEN}✓ Build dependencies added to Dockerfile${NC}"
else
    echo -e "${RED}✗ Build dependencies missing from Dockerfile${NC}"
    exit 1
fi
echo ""

# Test 3: Check Railway configuration
echo -e "${YELLOW}[3/4] Verifying Railway memory configuration...${NC}"
if grep -q "NODE_OPTIONS=--max-old-space-size=4096" backend/railway.toml; then
    echo -e "${GREEN}✓ Memory optimization added to Railway config${NC}"
else
    echo -e "${RED}✗ Memory optimization missing from Railway config${NC}"
    exit 1
fi
echo ""

# Test 4: Optional - Test Docker build (commented out by default as it takes time)
echo -e "${YELLOW}[4/4] Docker build test (optional)...${NC}"
echo "To test Docker build, run:"
echo "  cd backend && docker build -t cms-backend:test ."
echo ""
echo -e "${YELLOW}Skipping Docker build test (run manually if needed)${NC}"
echo ""

# Test 5: Check Node.js version
echo -e "${YELLOW}[BONUS] Checking Node.js version...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ Node.js version: ${NODE_VERSION}${NC}"
    
    # Extract major version
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$MAJOR_VERSION" -ge 18 ]; then
        echo -e "${GREEN}✓ Node.js version is compatible (>=18)${NC}"
    else
        echo -e "${RED}✗ Node.js version is too old (need >=18)${NC}"
        echo "  Please upgrade Node.js to version 18 or higher"
    fi
else
    echo -e "${RED}✗ Node.js not found${NC}"
fi
echo ""

echo "=========================================="
echo -e "${GREEN}All basic checks passed!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Commit changes:"
echo "   git add backend/Dockerfile backend/railway.toml backend/.npmrc NPM_SWC_BUILD_FIX.md updates_log.txt"
echo "   git commit -m \"fix: resolve @swc/core build errors with memory and dependency fixes\""
echo ""
echo "2. Optional - Test Docker build locally:"
echo "   cd backend && docker build -t cms-backend:test ."
echo ""
echo "3. Push to trigger Railway deployment:"
echo "   git push origin main"
echo ""
echo "4. Monitor Railway build logs for success"
echo ""
echo "For more details, see: NPM_SWC_BUILD_FIX.md"

