# Quick Reference Card

Essential commands and endpoints for the Clinic Management System.

## Local Development

### Backend
```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed
npm run start:dev  # http://localhost:4000
```

### Frontend
```bash
cd frontend
npm install
npm run dev  # http://localhost:3000
```

### Environment Setup
```bash
# Backend .env
DATABASE_URL="postgresql://user:pass@localhost:5432/clinic"
JWT_SECRET="<generate-secure-secret>"
JWT_EXPIRES_IN="1d"
OPENAI_API_KEY="sk-..." # Optional

# Frontend .env.local
NEXT_PUBLIC_API_PROXY="http://localhost:4000/"
```

## Railway Deployment

### Quick Deploy
```bash
# Check readiness
./scripts/check-deployment-readiness.sh

# Interactive deployment
./scripts/deploy-railway.sh

# Or manual:
railway link
railway up --service backend
railway up --service frontend
railway run --service backend npm run seed
```

### Essential Commands
```bash
# View logs
railway logs --service backend
railway logs --service frontend

# Set variables
railway variables --service backend
railway variables set JWT_SECRET="xxx" --service backend

# Run migrations
railway run --service backend npx prisma migrate deploy

# Seed database
railway run --service backend npm run seed

# Check status
railway status
```

### Required Environment Variables

**Backend:**
- `DATABASE_URL` (from PostgreSQL service)
- `JWT_SECRET` (generate: `openssl rand -base64 32`)

**Frontend:**
- `NEXT_PUBLIC_API_PROXY` (backend URL with trailing `/`)

## Audit Logs API

All endpoints require authentication. Admin access required unless noted.

### Query Audit Logs
```bash
# Get all logs (paginated)
GET /audit-logs?page=1&limit=50

# Filter by entity
GET /audit-logs?entity=Patient

# Filter by action
GET /audit-logs?action=CREATE

# Filter by date range
GET /audit-logs?startDate=2025-09-01&endDate=2025-09-30

# Search
GET /audit-logs?search=Patient

# Combined filters
GET /audit-logs?entity=Patient&action=UPDATE&page=1&limit=20
```

### Statistics
```bash
# System-wide statistics
GET /audit-logs/statistics

# Date range statistics
GET /audit-logs/statistics?startDate=2025-09-01&endDate=2025-09-30
```

### Export
```bash
# Export as CSV
GET /audit-logs/export?entity=Patient&startDate=2025-09-01

# Export as JSON
GET /audit-logs/export/json?action=DELETE
```

### Entity History
```bash
# Get complete history for an entity
GET /audit-logs/entity/Patient/clx123abc
```

### User Activity
```bash
# Get user activity (Admin only)
GET /audit-logs/user/clx123abc?page=1&limit=50

# Get my activity (any authenticated user)
GET /audit-logs/my-activity?page=1&limit=20
```

### Single Log
```bash
# Get specific audit log
GET /audit-logs/clx123abc
```

## Health & Status

```bash
# Backend health check
curl http://localhost:4000/health
# Expected: {"status":"ok","database":"connected"}

# API documentation
open http://localhost:4000/api
```

## Database Management

```bash
cd backend

# Create migration
npx prisma migrate dev --name migration_name

# Deploy migrations (production)
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# View database
npx prisma studio

# Seed database
npm run seed

# Reset database (⚠️ DESTRUCTIVE)
npx prisma migrate reset
```

## Database Backup & Restore

```bash
# Backup
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore
psql $DATABASE_URL < backup.sql

# Railway backup
railway run --service postgresql pg_dump > backup.sql
```

## Testing

```bash
# Backend tests
cd backend
npm run test          # Unit tests
npm run test:e2e      # E2E tests
npm run test:cov      # Coverage

# Frontend tests
cd frontend
npm run test
```

## Troubleshooting

### Backend won't start
```bash
# Check environment variables
cat backend/.env

# Check database connection
psql $DATABASE_URL

# View logs
npm run start:dev
```

### Frontend can't connect to backend
```bash
# Check frontend env
cat frontend/.env.local

# Verify NEXT_PUBLIC_API_PROXY has trailing slash
echo $NEXT_PUBLIC_API_PROXY  # Should be: http://localhost:4000/

# Test backend directly
curl http://localhost:4000/health
```

### Railway deployment failed
```bash
# Check readiness
./scripts/check-deployment-readiness.sh

# View deployment logs
railway logs --service backend --tail

# Check environment variables
railway variables --service backend

# Verify health check
curl https://your-backend.railway.app/health
```

### Migrations failed
```bash
# Check migration status
npx prisma migrate status

# View database
npx prisma studio

# Reset (⚠️ dev only)
npx prisma migrate reset

# Deploy manually
npx prisma migrate deploy
```

### Audit logs not appearing
```bash
# Check if RequestContextInterceptor is registered
# (Should be in app.module.ts)

# Test audit log endpoint
curl http://localhost:4000/audit-logs/statistics \
  -H "Authorization: Bearer YOUR_JWT"

# Check database for audit_logs table
psql $DATABASE_URL -c "SELECT COUNT(*) FROM audit_logs;"
```

## Security

### Generate Secure Secrets
```bash
# JWT_SECRET
openssl rand -base64 32

# Alternative
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Default Users (After Seed)
Check `backend/scripts/seed.ts` for default credentials.  
**⚠️ Change passwords immediately in production!**

## Common Ports

- **Backend API:** 4000
- **Frontend:** 3000
- **PostgreSQL:** 5432
- **Prisma Studio:** 5555

## Useful Links

- **Main README:** [README.md](./README.md)
- **Railway Deployment Guide:** [RAILWAY_DEPLOYMENT_GUIDE.md](./RAILWAY_DEPLOYMENT_GUIDE.md)
- **Audit Logs Documentation:** [backend/src/modules/audit-logs/README.md](./backend/src/modules/audit-logs/README.md)
- **Deployment & Audit Update:** [DEPLOYMENT_AND_AUDIT_UPDATE.md](./DEPLOYMENT_AND_AUDIT_UPDATE.md)
- **Planning Document:** [planning.md](./planning.md)

## API Client Examples

### JavaScript/TypeScript
```typescript
// Query audit logs
const response = await fetch('http://localhost:4000/audit-logs?entity=Patient', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const data = await response.json();

// Export audit logs
const csv = await fetch('http://localhost:4000/audit-logs/export?startDate=2025-09-01', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const blob = await csv.blob();
```

### cURL
```bash
# Set token variable
TOKEN="your-jwt-token-here"

# Query logs
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/audit-logs?entity=Patient&limit=10"

# Export logs
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/audit-logs/export" \
  -o audit-logs.csv

# Get statistics
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/audit-logs/statistics" | jq
```

## Performance Tips

### Audit Logs
- Always use pagination (`?page=1&limit=50`)
- Add database indexes on frequently queried fields
- Export and archive old logs monthly
- Use date range filters to limit results
- Consider retention policy (e.g., 90 days)

### Database
- Add indexes for frequently queried columns
- Use connection pooling
- Regular VACUUM and ANALYZE
- Monitor query performance with `EXPLAIN`

### Railway
- Use appropriate instance sizes
- Enable auto-scaling for production
- Monitor resource usage in dashboard
- Set up alerts for high CPU/memory

## Maintenance Scripts

### Audit Log Cleanup (Manual)
```typescript
// In backend service code or script
await auditLogsService.deleteOldLogs(90); // Delete logs older than 90 days
```

### Database Maintenance
```bash
# Analyze database
psql $DATABASE_URL -c "ANALYZE;"

# Vacuum database
psql $DATABASE_URL -c "VACUUM;"

# Check table sizes
psql $DATABASE_URL -c "
  SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
  FROM pg_tables
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
  LIMIT 10;
"
```

---

**Last Updated:** September 30, 2025  
**Version:** 2.0.0

