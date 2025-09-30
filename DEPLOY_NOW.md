# Deploy to Railway - Step-by-Step Guide

✅ **All TypeScript errors have been fixed!**  
✅ **Code has been committed and pushed to GitHub**

## Quick Start Deployment

Follow these steps to deploy your Clinic Management System to Railway:

### Step 1: Create Railway Project

1. Go to https://railway.app/
2. Click **"Login"** or **"Start a New Project"**
3. Sign in with GitHub
4. Click **"New Project"**
5. Select **"Deploy from GitHub repo"**
6. Choose your repository: `nareshshah139/Clinic_Management_System`
7. Railway will detect the `railway.json` file

### Step 2: Add PostgreSQL Database

1. In your Railway project, click **"New"** → **"Database"** → **"Add PostgreSQL"**
2. Railway will automatically create a PostgreSQL database
3. The database credentials are auto-generated

### Step 3: Configure Backend Service

1. **Link Database to Backend:**
   - Go to Backend service → **"Variables"** tab
   - Click **"New Variable"** → **"Add Reference"**
   - Select PostgreSQL service → `DATABASE_URL`
   - This automatically connects backend to database

2. **Add Required Environment Variables:**
   
   Click **"New Variable"** and add each of these:
   
   ```bash
   # Required
   JWT_SECRET=<generate-a-secure-random-string>
   PORT=4000
   
   # Optional but Recommended
   OPENAI_API_KEY=<your-openai-api-key>  # For translations
   JWT_EXPIRES_IN=1d
   NODE_ENV=production
   ```

   **Generate JWT_SECRET:**
   ```bash
   # Run this in your terminal:
   openssl rand -base64 32
   # Or:
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

3. **Set Build & Start Commands** (Should be auto-detected from `railway.toml`):
   - Root Directory: `backend`
   - Build Command: `npm ci && npx prisma generate && npm run build`
   - Start Command: `node dist/main.js`
   - Health Check Path: `/health`

4. **Deploy Backend:**
   - Railway will automatically start deploying
   - Wait for deployment to complete (check logs)
   - Note the backend URL (e.g., `https://backend-production-xxxx.up.railway.app`)

### Step 4: Configure Frontend Service

1. **Add Frontend Environment Variables:**
   
   Go to Frontend service → **"Variables"** → **"New Variable"**:
   
   ```bash
   NEXT_PUBLIC_API_PROXY=<backend-url-with-trailing-slash>
   PORT=3000
   NODE_ENV=production
   ```
   
   **Important:** Make sure `NEXT_PUBLIC_API_PROXY` has a trailing slash!  
   Example: `https://backend-production-xxxx.up.railway.app/`

2. **Set Build & Start Commands** (Should be auto-detected):
   - Root Directory: `frontend`
   - Build Command: `npm ci && npm run build`
   - Start Command: `npm run start`

3. **Generate Public Domain:**
   - Go to Frontend service → **"Settings"** → **"Networking"**
   - Click **"Generate Domain"**
   - Railway will give you a public URL (e.g., `https://your-app.up.railway.app`)

4. **Deploy Frontend:**
   - Railway will automatically deploy
   - Wait for deployment to complete

### Step 5: Seed Database (IMPORTANT!)

After backend is deployed, you need to seed the database with initial data:

**Option A: Using Railway Dashboard**
1. Go to Backend service → **"Deployments"** → Latest deployment
2. Click the **"⋮"** menu → **"View Logs"**
3. At the top, you'll see a terminal icon or **"Shell"** option
4. Click it to open a shell, then run:
   ```bash
   cd /app
   npm run seed
   ```

**Option B: Using Railway CLI** (After you login locally)
```bash
# Install Railway CLI if not already installed
npm i -g @railway/cli

# Login
railway login

# Link your project
railway link

# Run seed command
railway run --service backend npm run seed
```

The seed script will create:
- Default admin user
- Initial roles and permissions
- Sample data for testing

### Step 6: Verify Deployment

1. **Check Backend Health:**
   ```bash
   curl https://your-backend-url.railway.app/health
   # Should return: {"status":"ok","database":"connected"}
   ```

2. **Check Frontend:**
   - Open your frontend URL in browser
   - You should see the login page

3. **Test Login:**
   - Default admin credentials (check your seed script for exact values)
   - Try logging in and navigating the dashboard

### Step 7: Monitor Logs

**Backend Logs:**
```bash
railway logs --service backend
```

**Frontend Logs:**
```bash
railway logs --service frontend
```

## Important Notes

### Database Migrations
- Migrations run automatically when backend starts (via `docker-entrypoint.sh`)
- Check backend logs to verify migrations completed successfully

### Environment Variables Summary

**Backend Required:**
- `DATABASE_URL` - From PostgreSQL service (auto-linked)
- `JWT_SECRET` - Generate securely
- `PORT` - Default: 4000

**Frontend Required:**
- `NEXT_PUBLIC_API_PROXY` - Backend URL with trailing slash
- `PORT` - Default: 3000

**Backend Optional:**
- `OPENAI_API_KEY` - For translation features
- `OPENAI_TRANSLATION_MODEL` - Default: gpt-4o-mini
- `JWT_EXPIRES_IN` - Default: 1d

### Troubleshooting

**Backend won't start:**
- Check DATABASE_URL is set correctly
- Verify JWT_SECRET is set
- Check logs for migration errors

**Frontend can't connect to backend:**
- Verify NEXT_PUBLIC_API_PROXY is set correctly
- Must include trailing slash
- Backend must be deployed and healthy first

**Database connection issues:**
- Ensure database service is running
- Verify DATABASE_URL reference is correct
- Check firewall/network settings in Railway

## Post-Deployment Checklist

- [ ] Backend deployed and health check passes
- [ ] Frontend deployed and accessible
- [ ] Database seeded with initial data
- [ ] Can login with admin credentials
- [ ] All major features working:
  - [ ] Patient management
  - [ ] Appointments
  - [ ] Visits and prescriptions
  - [ ] Pharmacy and invoices
  - [ ] Billing
  - [ ] Inventory
  - [ ] Reports

## Security Reminders

1. **Change default passwords** immediately after first login
2. **Keep JWT_SECRET secure** - never commit to Git
3. **Enable HTTPS** - Railway provides this automatically
4. **Set up backups** - Railway Pro plans include automated backups
5. **Monitor logs** regularly for suspicious activity

## Getting Help

- **Railway Documentation:** https://docs.railway.app/
- **Railway Discord:** https://discord.gg/railway
- **Application Logs:** Check Railway dashboard → Service → Deployments → Logs

## Next Steps

After successful deployment:

1. Configure custom domain (optional)
2. Set up monitoring and alerts
3. Configure automated backups
4. Review and adjust JWT expiration times
5. Set up staging environment for testing

---

**Ready to deploy!** Follow the steps above and you'll have your application running on Railway in minutes.

For detailed information, see `RAILWAY_DEPLOYMENT_GUIDE.md`.

