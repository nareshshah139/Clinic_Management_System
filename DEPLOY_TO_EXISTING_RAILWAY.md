# Deploy to Your Existing Railway Project

✅ **Railway project already created**  
✅ **All build errors fixed**  
✅ **Code pushed to GitHub**

## Quick Deployment to Existing Project

### Option 1: Automatic Deployment (Recommended)

If your Railway project is connected to your GitHub repository, it will **automatically deploy** when you push code:

1. **Verify GitHub Connection:**
   - Go to your Railway project dashboard
   - Check if it's connected to `nareshshah139/Clinic_Management_System`
   - If yes, Railway is likely already deploying! Check the "Deployments" tab

2. **Monitor Deployment:**
   - Go to Railway dashboard → Your Project
   - Click on Backend service → **"Deployments"**
   - Watch the build logs
   - Wait for ✅ "Deployed"
   - Repeat for Frontend service

**If auto-deploy is working, skip to Step 3 (Configure Environment Variables) below!**

---

### Option 2: Manual Deployment via Railway CLI

If you need to deploy manually or link the local project:

#### Step 1: Login to Railway

```bash
railway login
```

This will:
- Open your browser
- Ask you to authenticate
- Save credentials locally

#### Step 2: Link Your Project

```bash
# Link to your existing Railway project
railway link
```

Select your project from the list when prompted.

#### Step 3: Check Current Status

```bash
# See what's deployed
railway status

# Check environment variables
railway variables
```

#### Step 4: Deploy Services

Deploy backend:
```bash
railway up --service backend
```

Deploy frontend:
```bash
railway up --service frontend
```

---

## Step 3: Configure Environment Variables

### Backend Variables

Check if these are set:

```bash
railway variables --service backend
```

**Required variables:**

```bash
# Database URL (should be auto-linked if PostgreSQL service exists)
railway variables --service backend set DATABASE_URL=<postgresql-connection-string>

# JWT Secret (IMPORTANT: Generate a new one!)
railway variables --service backend set JWT_SECRET=$(openssl rand -base64 32)

# Port
railway variables --service backend set PORT=4000

# Node Environment
railway variables --service backend set NODE_ENV=production
```

**Optional but recommended:**

```bash
# For translation features
railway variables --service backend set OPENAI_API_KEY=<your-key>

# JWT expiration
railway variables --service backend set JWT_EXPIRES_IN=1d
```

**Or set via Railway Dashboard:**
1. Go to Backend service → **"Variables"** tab
2. Click **"New Variable"**
3. Add each variable

### Frontend Variables

Get your backend URL first:

```bash
# Get backend URL
railway status
```

Or find it in Railway dashboard → Backend service → "Settings" → "Domains"

Then set frontend variables:

```bash
# Backend API URL (MUST have trailing slash!)
railway variables --service frontend set NEXT_PUBLIC_API_PROXY=https://your-backend.railway.app/

# Port
railway variables --service frontend set PORT=3000

# Node Environment
railway variables --service frontend set NODE_ENV=production
```

**Or via Dashboard:**
1. Go to Frontend service → **"Variables"** tab
2. Add variables there

---

## Step 4: Link PostgreSQL Database (If Not Already Linked)

If you have a PostgreSQL service in your project:

### Via Dashboard (Easiest):
1. Go to Backend service → **"Variables"**
2. Click **"New Variable"** → **"Add Reference"**
3. Select PostgreSQL service
4. Choose `DATABASE_URL`
5. This automatically links the database

### Via CLI:
```bash
# List all services
railway service list

# The DATABASE_URL should be automatically available if PostgreSQL is in the same project
```

---

## Step 5: Seed Database

After backend is deployed and connected to the database:

### Option A: Via Railway Dashboard
1. Go to Backend service → **"Deployments"**
2. Click latest deployment
3. Open the terminal/shell (⋮ menu)
4. Run:
   ```bash
   cd /app
   npm run seed
   ```

### Option B: Via Railway CLI
```bash
railway run --service backend npm run seed
```

This creates:
- Default admin user
- Roles and permissions
- Sample data for testing

---

## Step 6: Generate Frontend Domain

If your frontend doesn't have a public URL yet:

### Via Dashboard:
1. Go to Frontend service → **"Settings"** → **"Networking"**
2. Click **"Generate Domain"**
3. Railway will provide a public URL

### Via CLI:
The domain is automatically generated when you deploy.

---

## Step 7: Verify Deployment

### Check Backend Health:
```bash
curl https://your-backend.railway.app/health
```

Should return:
```json
{"status":"ok","database":"connected"}
```

### Check Frontend:
Open your frontend URL in a browser - you should see the login page.

### View Logs:
```bash
# Backend logs
railway logs --service backend

# Frontend logs
railway logs --service frontend
```

---

## Quick Command Reference

```bash
# Login
railway login

# Link project
railway link

# Check status
railway status

# Deploy specific service
railway up --service backend
railway up --service frontend

# Set variable
railway variables --service backend set KEY=value

# View variables
railway variables --service backend

# Run command in service
railway run --service backend npm run seed

# View logs
railway logs --service backend
railway logs --service frontend

# Open dashboard
railway open
```

---

## Troubleshooting

### "Project not linked"
```bash
railway link
```
Select your project from the list.

### "Service not found"
Make sure your `railway.json` is configured correctly. Your services should be named:
- `backend`
- `frontend`

### Backend won't start
1. Check `DATABASE_URL` is set
2. Check `JWT_SECRET` is set
3. View logs: `railway logs --service backend`
4. Look for migration errors

### Frontend can't connect to backend
1. Verify `NEXT_PUBLIC_API_PROXY` has trailing slash
2. Make sure backend is deployed first
3. Check backend health endpoint
4. Verify CORS settings if needed

### Database connection issues
1. Ensure PostgreSQL service is running
2. Verify DATABASE_URL reference is correct
3. Check if database is linked to backend service

---

## Environment Variables Checklist

### Backend (Must Have):
- [ ] `DATABASE_URL` - From PostgreSQL service
- [ ] `JWT_SECRET` - Generate new: `openssl rand -base64 32`
- [ ] `PORT` - Set to `4000`

### Backend (Optional):
- [ ] `OPENAI_API_KEY` - For translations
- [ ] `JWT_EXPIRES_IN` - Default: `1d`
- [ ] `NODE_ENV` - Set to `production`

### Frontend (Must Have):
- [ ] `NEXT_PUBLIC_API_PROXY` - Backend URL **with trailing slash**
- [ ] `PORT` - Set to `3000`

### Frontend (Optional):
- [ ] `NODE_ENV` - Set to `production`

---

## Post-Deployment Checklist

- [ ] Backend deployed successfully
- [ ] Frontend deployed successfully
- [ ] Database seeded
- [ ] Health check passes
- [ ] Can access login page
- [ ] Can login with admin credentials
- [ ] All features working

---

## Next Steps After Deployment

1. **Change default passwords** immediately
2. **Set up custom domain** (if desired)
3. **Configure monitoring** and alerts
4. **Set up automated backups** (Railway Pro)
5. **Review security settings**

---

## Need Help?

- **View full guide:** `RAILWAY_DEPLOYMENT_GUIDE.md`
- **Railway Discord:** https://discord.gg/railway
- **Railway Docs:** https://docs.railway.app/

---

**Ready to deploy!** 🚀

Start with `railway login` and `railway link`, then follow the steps above.

