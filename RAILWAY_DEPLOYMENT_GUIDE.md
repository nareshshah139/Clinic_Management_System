# Railway Deployment Guide

Complete guide for deploying the Clinic Management System on Railway.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Initial Setup](#initial-setup)
- [Backend Service Configuration](#backend-service-configuration)
- [Frontend Service Configuration](#frontend-service-configuration)
- [Database Setup](#database-setup)
- [Environment Variables](#environment-variables)
- [Deployment Checklist](#deployment-checklist)
- [Post-Deployment](#post-deployment)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Troubleshooting](#troubleshooting)
- [Multi-Environment Strategy](#multi-environment-strategy)

## Prerequisites

- [Railway account](https://railway.com/) (free or paid)
- GitHub repository connected to Railway
- Node.js 20+ (for local development/testing)
- PostgreSQL knowledge (for database management)

## Project Structure

This is a monorepo with three main components:
```
/
├── backend/          # NestJS API server
│   ├── railway.toml  # Backend Railway config
│   └── Dockerfile    # Backend Docker config
├── frontend/         # Next.js web app
│   ├── railway.toml  # Frontend Railway config
│   └── Dockerfile    # Frontend Docker config
└── railway.json      # Multi-service Railway config
```

## Initial Setup

### 1. Create Railway Project

1. Log in to [Railway](https://railway.com/)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Connect your GitHub account (if not already connected)
5. Select this repository
6. Choose **"Configure"** to set up multiple services

### 2. Add Services

Railway will detect the `railway.json` file and offer to create multiple services:
- ✅ Backend service (rootDir: `backend`)
- ✅ Frontend service (rootDir: `frontend`)
- ✅ PostgreSQL database (add separately)

## Backend Service Configuration

### Service Settings

1. **Root Directory**: Set to `backend`
2. **Build Command**: 
   ```bash
   npm ci && npx prisma generate && npm run build
   ```
3. **Start Command**: 
   ```bash
   node dist/main.js
   ```
4. **Health Check**: 
   - Path: `/health`
   - Timeout: 300 seconds (for initial migrations)

### Dockerfile Configuration

The backend uses a multi-stage Docker build for optimal performance:
- **Stage 1 (deps)**: Install production dependencies
- **Stage 2 (builder)**: Build TypeScript and generate Prisma client
- **Stage 3 (runner)**: Runtime with minimal footprint

The `docker-entrypoint.sh` script automatically:
- Runs Prisma migrations (`prisma migrate deploy`)
- Regenerates Prisma client
- Starts the application

### Port Configuration

Default port: `4000`
- Automatically exposed via `PORT` environment variable
- Configurable via Railway environment variables

## Frontend Service Configuration

### Service Settings

1. **Root Directory**: Set to `frontend`
2. **Build Command**: 
   ```bash
   npm ci && npm run build
   ```
3. **Start Command**: 
   ```bash
   npm run start
   ```
4. **Output Mode**: Next.js `standalone` mode enabled

### Port Configuration

Default port: `3000`
- Automatically exposed via `PORT` environment variable
- Railway will generate a public domain

### Public Domain Setup

1. Go to Frontend service → **Settings** → **Networking**
2. Click **"Generate Domain"** for a Railway subdomain
3. Or add a **Custom Domain** if you have one

## Database Setup

### 1. Add PostgreSQL Database

1. In your Railway project, click **"New"** → **"Database"** → **"Add PostgreSQL"**
2. Railway will provision a PostgreSQL instance
3. Database credentials are auto-generated

### 2. Connect Backend to Database

The `DATABASE_URL` is automatically set when you link the database to the backend service:
1. Go to Backend service → **Variables**
2. Click **"New Variable"** → **"Add Reference"**
3. Select the PostgreSQL service → `DATABASE_URL`

### 3. Initial Database Setup

The backend automatically runs migrations on startup via `docker-entrypoint.sh`:
```bash
npx prisma migrate deploy
npx prisma generate
```

### 4. Seed Initial Data

After first deployment, you need to seed the database:

#### Option A: Using Railway CLI
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and link project
railway login
railway link

# Run seed script
railway run --service backend npm run seed
```

#### Option B: Using Railway Dashboard
1. Go to Backend service → **Deployments**
2. Click on the latest deployment → **View Logs**
3. In the service, use the **Shell** tab
4. Run: `npm run seed`

#### Option C: Connect Locally
```bash
# Get DATABASE_URL from Railway
railway variables --service backend

# Set locally
export DATABASE_URL="postgresql://..."

# Run seed
cd backend
npm run seed
```

## Environment Variables

### Backend Required Variables

| Variable | Description | Example | Source |
|----------|-------------|---------|--------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` | PostgreSQL service reference |
| `JWT_SECRET` | Secret for JWT tokens | `your-super-secure-random-string` | Generate securely |
| `PORT` | Server port | `4000` | Auto-set by Railway |

### Backend Optional Variables

| Variable | Description | Default | Notes |
|----------|-------------|---------|-------|
| `JWT_EXPIRES_IN` | JWT expiration time | `1d` | e.g., `7d`, `24h` |
| `OPENAI_API_KEY` | OpenAI API key for translations | - | Optional but recommended |
| `OPENAI_TRANSLATION_MODEL` | OpenAI model for translations | `gpt-4o-mini` | Optional |
| `NODE_ENV` | Environment mode | `production` | Auto-set by Railway |

### Frontend Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_PROXY` | Backend API URL | `https://backend-xyz.railway.app/` |
| `PORT` | Server port | `3000` (auto-set) |

### Frontend Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` (auto-set) |

### Setting Variables

1. Go to service → **Variables** tab
2. Click **"New Variable"**
3. Enter key and value
4. Service will automatically redeploy

### Generating Secure Secrets

For `JWT_SECRET`, generate a secure random string:

```bash
# Option 1: OpenSSL
openssl rand -base64 32

# Option 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Option 3: Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Deployment Checklist

### Pre-Deployment

- [ ] Repository pushed to GitHub
- [ ] Railway project created
- [ ] Database service added
- [ ] Backend environment variables configured
- [ ] Frontend environment variables configured
- [ ] Custom domain configured (optional)

### Post-Deployment

- [ ] Backend health check passes (`/health`)
- [ ] Database migrations completed successfully
- [ ] Database seeded with initial data
- [ ] Frontend can connect to backend
- [ ] Test authentication flow
- [ ] Verify file uploads work
- [ ] Check logs for errors

### Initial User Setup

After seeding, default users are created. **Change passwords immediately:**

```bash
# Connect to backend
railway run --service backend npm run seed

# Default admin credentials (from seed):
# Email: admin@clinic.com
# Password: [check seed script]
```

## Post-Deployment

### 1. Verify Health Check

```bash
curl https://your-backend.railway.app/health
# Expected: { "status": "ok", "database": "connected" }
```

### 2. Test Frontend

1. Navigate to your frontend URL
2. Try logging in
3. Check browser console for errors
4. Verify API calls work

### 3. Check Logs

**Backend Logs:**
- Go to Backend service → **Deployments** → Latest → **View Logs**
- Look for: `Successfully connected to database`
- Check for Prisma migration logs

**Frontend Logs:**
- Go to Frontend service → **Deployments** → Latest → **View Logs**
- Check for build success and server start

### 4. Monitor Database

```bash
# Connect via Railway CLI
railway connect --service postgresql

# Or use connection string with any PostgreSQL client
```

## Monitoring and Maintenance

### Health Monitoring

The backend exposes a health endpoint:
```
GET /health
Response: { "status": "ok", "database": "connected" }
```

Configure Railway to monitor this endpoint:
1. Backend service → **Settings** → **Health Check**
2. Path: `/health`
3. Timeout: 300s (allows time for migrations)

### Log Monitoring

**View Real-time Logs:**
```bash
railway logs --service backend
railway logs --service frontend
```

**Common Log Locations:**
- Backend: Railway dashboard → Service → Deployments → Logs
- Frontend: Railway dashboard → Service → Deployments → Logs

### Database Backups

Railway Pro plans include automated backups. For manual backups:

```bash
# Export database
railway run --service postgresql pg_dump > backup.sql

# Or use the connection string
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

### Updates and Migrations

**Automatic Deployments:**
- Railway auto-deploys on Git push (if enabled)
- Migrations run automatically via `docker-entrypoint.sh`

**Manual Deployment:**
```bash
railway up --service backend
railway up --service frontend
```

## Troubleshooting

### Backend Issues

#### Migration Failures

**Symptoms:**
- Backend fails to start
- "Migration failed" in logs

**Solutions:**
```bash
# Check current migration status
railway run --service backend npx prisma migrate status

# Reset database (⚠️ DESTRUCTIVE - dev only)
railway run --service backend npx prisma migrate reset

# Deploy migrations manually
railway run --service backend npx prisma migrate deploy
```

#### Database Connection Issues

**Symptoms:**
- "Database connection failed" in logs
- Health check fails

**Solutions:**
1. Verify `DATABASE_URL` is set correctly
2. Check database service is running
3. Ensure database has been linked to backend
4. Check firewall/network settings

#### JWT Authentication Issues

**Symptoms:**
- "JWT must be provided" errors
- 401 Unauthorized responses

**Solutions:**
1. Verify `JWT_SECRET` is set
2. Ensure frontend is sending tokens
3. Check token expiration (`JWT_EXPIRES_IN`)

### Frontend Issues

#### Cannot Connect to Backend

**Symptoms:**
- Network errors in browser console
- "Failed to fetch" errors

**Solutions:**
1. Verify `NEXT_PUBLIC_API_PROXY` is set correctly
2. Must include trailing slash: `https://backend.railway.app/`
3. Check backend is running and healthy
4. Verify CORS configuration

#### Build Failures

**Symptoms:**
- Deployment fails during build
- TypeScript errors

**Solutions:**
1. Test build locally: `npm run build`
2. Check `node_modules` are not corrupted
3. Verify all dependencies in `package.json`
4. Clear Railway build cache (Settings → General → Clear Build Cache)

### Database Issues

#### Out of Connections

**Symptoms:**
- "Too many connections" errors
- Slow queries

**Solutions:**
1. Check connection pooling configuration
2. Reduce `connection_limit` in `DATABASE_URL`
3. Upgrade Railway plan for more connections

#### Slow Performance

**Solutions:**
1. Add database indexes (check Prisma schema)
2. Analyze slow queries
3. Upgrade database plan
4. Enable query logging

### General Debugging

#### View Environment Variables
```bash
railway variables --service backend
railway variables --service frontend
```

#### SSH into Service
```bash
railway shell --service backend
```

#### Restart Service
```bash
railway restart --service backend
railway restart --service frontend
```

#### Check Service Status
```bash
railway status
```

## Multi-Environment Strategy

### Development, Staging, Production

Create separate Railway projects for each environment:

#### 1. Development Environment
- Auto-deploy from `develop` branch
- Use smaller database plan
- Enable debug logging

#### 2. Staging Environment
- Auto-deploy from `staging` branch
- Mirror production configuration
- Use for testing before production

#### 3. Production Environment
- Deploy from `main` branch only
- Enable monitoring and alerts
- Use larger database plan
- Configure backups

### Environment-Specific Configuration

**Use Railway's environment variables:**

```bash
# Development
JWT_EXPIRES_IN=7d
LOG_LEVEL=debug

# Staging
JWT_EXPIRES_IN=1d
LOG_LEVEL=info

# Production
JWT_EXPIRES_IN=8h
LOG_LEVEL=warn
```

### Branch-Based Deployments

Configure in Railway project settings:
1. **Settings** → **Deployments**
2. **Triggers** → Add branch filter
3. Set branch name (e.g., `main`, `staging`, `develop`)

## Additional Resources

- [Railway Documentation](https://docs.railway.app/)
- [NestJS Deployment Guide](https://docs.nestjs.com/deployment)
- [Next.js Deployment Guide](https://nextjs.org/docs/deployment)
- [Prisma Railway Guide](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-railway)

## Support

For Railway-specific issues:
- [Railway Discord](https://discord.gg/railway)
- [Railway Community](https://help.railway.app/)

For application-specific issues:
- Check repository issues
- Review application logs
- Consult internal documentation

---

**Last Updated:** September 30, 2025  
**Version:** 1.0.0  
**Tested with:** Railway V2, Node.js 20, PostgreSQL 15

