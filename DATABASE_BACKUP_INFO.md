# Database Backup Information

## Backup Policy
Database backups are created locally and **excluded from git** for security reasons.

## Local Backup Location
- **Directory**: `backups/` (git-ignored)
- **Current Backup**: `backups/20250920_102558/` 
- **Created**: September 20, 2025, 10:25:58 AM

## Backup Contents
- `cms_full_backup.sql` - Complete database backup (schema + data)
- `cms_data_only.sql` - Data-only backup 
- `cms_schema_only.sql` - Schema-only backup
- `schema.prisma` - Prisma schema file
- `migrations/` - Database migrations
- `fresh-seed.ts` - Seed script

## Quick Restore Command
```bash
docker exec -i cms-postgres psql -U cms -d cms < backups/20250920_102558/cms_full_backup.sql
```

## Database State at Backup
- Enhanced billing system with professional invoicing
- Complete test data: 4 users, 6 rooms, 10 patients, 7 invoices
- All modules production-ready and fully tested
- Frontend-backend integration working

## Security Note
⚠️ **Database backups contain sensitive information and are excluded from version control via `.gitignore`**

## Creating New Backups
```bash
# Create timestamped backup directory
BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR

# Create full backup
docker exec cms-postgres pg_dump -U cms -d cms > $BACKUP_DIR/cms_full_backup.sql

# Copy schema and migrations
cp backend/prisma/schema.prisma $BACKUP_DIR/
cp -r backend/prisma/migrations $BACKUP_DIR/
cp backend/scripts/fresh-seed.ts $BACKUP_DIR/
```

## Restoration Instructions
1. Ensure PostgreSQL container is running
2. Use the restore command above
3. Restart the application
4. Login with test credentials (see backup README)

**Note**: Always test backups in a separate environment before production use. 