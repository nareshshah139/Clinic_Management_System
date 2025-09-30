#!/bin/bash
#
# Railway Deployment Helper Script
# This script helps deploy the Clinic Management System to Railway
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Railway Deployment Helper Script            ║${NC}"
echo -e "${GREEN}║   Clinic Management System                     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}✗ Railway CLI not found!${NC}"
    echo -e "${YELLOW}Install it with: npm i -g @railway/cli${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Railway CLI installed${NC}"

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}Not logged in to Railway. Logging in...${NC}"
    railway login
fi

echo -e "${GREEN}✓ Logged in to Railway${NC}"

# Menu
echo ""
echo "Select an action:"
echo "1. Link existing Railway project"
echo "2. Deploy backend service"
echo "3. Deploy frontend service"
echo "4. Run database migrations"
echo "5. Seed database"
echo "6. View backend logs"
echo "7. View frontend logs"
echo "8. Set environment variables"
echo "9. Check deployment status"
echo "10. Exit"
echo ""
read -p "Enter your choice (1-10): " choice

case $choice in
    1)
        echo -e "${YELLOW}Linking Railway project...${NC}"
        railway link
        echo -e "${GREEN}✓ Project linked${NC}"
        ;;
    2)
        echo -e "${YELLOW}Deploying backend service...${NC}"
        railway up --service backend
        echo -e "${GREEN}✓ Backend deployed${NC}"
        ;;
    3)
        echo -e "${YELLOW}Deploying frontend service...${NC}"
        railway up --service frontend
        echo -e "${GREEN}✓ Frontend deployed${NC}"
        ;;
    4)
        echo -e "${YELLOW}Running database migrations...${NC}"
        railway run --service backend npx prisma migrate deploy
        echo -e "${GREEN}✓ Migrations completed${NC}"
        ;;
    5)
        echo -e "${YELLOW}Seeding database...${NC}"
        railway run --service backend npm run seed
        echo -e "${GREEN}✓ Database seeded${NC}"
        ;;
    6)
        echo -e "${YELLOW}Viewing backend logs...${NC}"
        railway logs --service backend
        ;;
    7)
        echo -e "${YELLOW}Viewing frontend logs...${NC}"
        railway logs --service frontend
        ;;
    8)
        echo -e "${YELLOW}Setting environment variables...${NC}"
        echo ""
        echo "Select service:"
        echo "1. Backend"
        echo "2. Frontend"
        read -p "Enter choice: " svc_choice
        
        if [ "$svc_choice" = "1" ]; then
            SERVICE="backend"
        else
            SERVICE="frontend"
        fi
        
        echo ""
        echo "Current variables for $SERVICE:"
        railway variables --service $SERVICE
        echo ""
        read -p "Enter variable name: " var_name
        read -p "Enter variable value: " var_value
        
        railway variables --service $SERVICE set $var_name="$var_value"
        echo -e "${GREEN}✓ Variable set${NC}"
        ;;
    9)
        echo -e "${YELLOW}Checking deployment status...${NC}"
        railway status
        ;;
    10)
        echo -e "${GREEN}Goodbye!${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}Done!${NC}"

