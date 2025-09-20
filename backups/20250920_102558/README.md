# Database Backup - September 20, 2025

## Backup Details
- **Date**: September 20, 2025, 10:25:58 AM
- **Database**: cms (PostgreSQL 15.14)
- **State**: Production-ready billing system with enhanced invoicing

## Contents

### Database Backups
- `cms_full_backup.sql` - Complete database backup (schema + data)
- `cms_data_only.sql` - Data-only backup (INSERT statements)
- `cms_schema_only.sql` - Schema-only backup (CREATE statements)

### Prisma Files
- `schema.prisma` - Current Prisma schema with all models
- `migrations/` - All database migration files
- `fresh-seed.ts` - Seed script with comprehensive test data

## Database State at Backup
- ✅ Enhanced billing system with NewInvoice, NewInvoiceItem, NewPayment models
- ✅ Professional invoicing with dermatology packages and services
- ✅ Complete seed data: 4 users, 6 rooms, 10 test patients, 7 sample invoices
- ✅ All modules production-ready: Appointments, Visits, Billing, Prescriptions, Inventory, Users, Reports
- ✅ Frontend-backend integration working with authentication

## Key Features in This State
- Professional invoice builder with real-time calculations
- Editable GST rates (0-30%) per item or per invoice
- Comprehensive dermatology packages and services
- Print-optimized invoice templates with clinic branding
- Sample invoice generation for testing
- Enhanced error handling and validation

## Restoration Instructions

### Full Restore
```bash
# Stop the application
docker-compose -f infra/docker-compose.yml down

# Start only PostgreSQL
docker-compose -f infra/docker-compose.yml up -d postgres

# Wait for PostgreSQL to be ready
sleep 10

# Restore the database
docker exec -i cms-postgres psql -U cms -d cms < cms_full_backup.sql

# Start the full application
docker-compose -f infra/docker-compose.yml up -d
```

### Schema + Data Restore (Alternative)
```bash
# Restore schema first
docker exec -i cms-postgres psql -U cms -d cms < cms_schema_only.sql

# Then restore data
docker exec -i cms-postgres psql -U cms -d cms < cms_data_only.sql
```

### Using Prisma (Development)
```bash
# Copy schema back
cp schema.prisma ../backend/prisma/

# Copy migrations back
cp -r migrations/* ../backend/prisma/migrations/

# Reset and migrate
cd ../backend
npx prisma migrate reset --force

# Run seed
npx ts-node scripts/fresh-seed.ts
```

## Login Credentials
- **Admin**: Phone: 9000000000, Password: password123
- **Dr. Shravya**: Phone: 9000000001, Password: password123  
- **Dr. Praneeta**: Phone: 9000000002, Password: password123
- **Receptionist**: Phone: 9000000003, Password: password123

## Test Data Available
- 4 Users (Admin, 2 Doctors, 1 Receptionist)
- 6 Rooms (2 Consultation, 3 Procedure, 1 Telemedicine)
- 10 [TEST] Patients with dermatology data
- 7 Sample Invoices with various payment statuses
- 3 Services (Dermatology Consultation, Acne Treatment, Skin Analysis)

## Application URLs
- Backend: http://localhost:4000
- Frontend: http://localhost:3000
- Swagger API: http://localhost:4000/docs

## Notes
- This backup represents the state after implementing enhanced billing system
- All modules are production-ready with comprehensive test coverage
- Frontend-backend integration is fully functional
- Database includes realistic test data for demonstrations
