#!/bin/bash
#
# Deployment Readiness Check Script
# Validates that the application is ready for Railway deployment
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Deployment Readiness Check                   ║${NC}"
echo -e "${GREEN}║   Clinic Management System                     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Check Node.js version
echo -e "${YELLOW}Checking Node.js version...${NC}"
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -ge 20 ]; then
    echo -e "${GREEN}✓ Node.js version: $(node -v)${NC}"
else
    echo -e "${RED}✗ Node.js version too old. Requires v20+, found: $(node -v)${NC}"
    ERRORS=$((ERRORS+1))
fi

# Check npm version
echo -e "${YELLOW}Checking npm version...${NC}"
if command -v npm &> /dev/null; then
    echo -e "${GREEN}✓ npm version: $(npm -v)${NC}"
else
    echo -e "${RED}✗ npm not found${NC}"
    ERRORS=$((ERRORS+1))
fi

# Check backend files
echo ""
echo -e "${YELLOW}Checking backend files...${NC}"
cd "$(dirname "$0")/../backend" || exit 1

if [ -f "package.json" ]; then
    echo -e "${GREEN}✓ backend/package.json exists${NC}"
else
    echo -e "${RED}✗ backend/package.json missing${NC}"
    ERRORS=$((ERRORS+1))
fi

if [ -f "Dockerfile" ]; then
    echo -e "${GREEN}✓ backend/Dockerfile exists${NC}"
else
    echo -e "${RED}✗ backend/Dockerfile missing${NC}"
    ERRORS=$((ERRORS+1))
fi

if [ -f "railway.toml" ]; then
    echo -e "${GREEN}✓ backend/railway.toml exists${NC}"
else
    echo -e "${RED}✗ backend/railway.toml missing${NC}"
    ERRORS=$((ERRORS+1))
fi

if [ -f "docker-entrypoint.sh" ]; then
    echo -e "${GREEN}✓ backend/docker-entrypoint.sh exists${NC}"
    if [ -x "docker-entrypoint.sh" ]; then
        echo -e "${GREEN}✓ docker-entrypoint.sh is executable${NC}"
    else
        echo -e "${YELLOW}⚠ docker-entrypoint.sh not executable (will be fixed in Docker)${NC}"
        WARNINGS=$((WARNINGS+1))
    fi
else
    echo -e "${RED}✗ backend/docker-entrypoint.sh missing${NC}"
    ERRORS=$((ERRORS+1))
fi

# Check Prisma schema
if [ -f "prisma/schema.prisma" ]; then
    echo -e "${GREEN}✓ Prisma schema exists${NC}"
else
    echo -e "${RED}✗ Prisma schema missing${NC}"
    ERRORS=$((ERRORS+1))
fi

# Check if backend builds
echo -e "${YELLOW}Checking if backend builds...${NC}"
if npm run build &> /dev/null; then
    echo -e "${GREEN}✓ Backend builds successfully${NC}"
else
    echo -e "${RED}✗ Backend build failed${NC}"
    ERRORS=$((ERRORS+1))
fi

# Check frontend files
echo ""
echo -e "${YELLOW}Checking frontend files...${NC}"
cd "../frontend" || exit 1

if [ -f "package.json" ]; then
    echo -e "${GREEN}✓ frontend/package.json exists${NC}"
else
    echo -e "${RED}✗ frontend/package.json missing${NC}"
    ERRORS=$((ERRORS+1))
fi

if [ -f "Dockerfile" ]; then
    echo -e "${GREEN}✓ frontend/Dockerfile exists${NC}"
else
    echo -e "${RED}✗ frontend/Dockerfile missing${NC}"
    ERRORS=$((ERRORS+1))
fi

if [ -f "railway.toml" ]; then
    echo -e "${GREEN}✓ frontend/railway.toml exists${NC}"
else
    echo -e "${RED}✗ frontend/railway.toml missing${NC}"
    ERRORS=$((ERRORS+1))
fi

# Check Next.js config
if [ -f "next.config.ts" ]; then
    echo -e "${GREEN}✓ next.config.ts exists${NC}"
    if grep -q "output.*standalone" next.config.ts; then
        echo -e "${GREEN}✓ Next.js standalone mode enabled${NC}"
    else
        echo -e "${YELLOW}⚠ Next.js standalone mode not explicitly enabled${NC}"
        WARNINGS=$((WARNINGS+1))
    fi
else
    echo -e "${RED}✗ next.config.ts missing${NC}"
    ERRORS=$((ERRORS+1))
fi

# Check if frontend builds
echo -e "${YELLOW}Checking if frontend builds...${NC}"
if npm run build &> /dev/null; then
    echo -e "${GREEN}✓ Frontend builds successfully${NC}"
else
    echo -e "${RED}✗ Frontend build failed${NC}"
    ERRORS=$((ERRORS+1))
fi

# Check root railway.json
echo ""
echo -e "${YELLOW}Checking root configuration...${NC}"
cd .. || exit 1

if [ -f "railway.json" ]; then
    echo -e "${GREEN}✓ railway.json exists${NC}"
else
    echo -e "${RED}✗ railway.json missing${NC}"
    ERRORS=$((ERRORS+1))
fi

# Check Git status
echo ""
echo -e "${YELLOW}Checking Git status...${NC}"
if [ -d ".git" ]; then
    echo -e "${GREEN}✓ Git repository initialized${NC}"
    
    if [ -n "$(git status --porcelain)" ]; then
        echo -e "${YELLOW}⚠ Uncommitted changes detected${NC}"
        WARNINGS=$((WARNINGS+1))
    else
        echo -e "${GREEN}✓ No uncommitted changes${NC}"
    fi
    
    if git remote -v | grep -q "origin"; then
        echo -e "${GREEN}✓ Git remote 'origin' configured${NC}"
    else
        echo -e "${YELLOW}⚠ No Git remote 'origin' configured${NC}"
        WARNINGS=$((WARNINGS+1))
    fi
else
    echo -e "${RED}✗ Not a Git repository${NC}"
    ERRORS=$((ERRORS+1))
fi

# Environment variables checklist
echo ""
echo -e "${YELLOW}Environment Variables Checklist:${NC}"
echo "Backend required variables:"
echo "  - DATABASE_URL (from PostgreSQL service)"
echo "  - JWT_SECRET (generate securely)"
echo "  - PORT (default: 4000)"
echo ""
echo "Backend optional variables:"
echo "  - OPENAI_API_KEY (for translations)"
echo "  - OPENAI_TRANSLATION_MODEL (default: gpt-4o-mini)"
echo "  - JWT_EXPIRES_IN (default: 1d)"
echo ""
echo "Frontend required variables:"
echo "  - NEXT_PUBLIC_API_PROXY (backend URL)"
echo "  - PORT (default: 3000)"
echo ""

# Summary
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Summary                                      ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! Ready for deployment.${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) found. Deployment possible but review recommended.${NC}"
    exit 0
else
    echo -e "${RED}✗ $ERRORS error(s) and $WARNINGS warning(s) found. Fix errors before deploying.${NC}"
    exit 1
fi

