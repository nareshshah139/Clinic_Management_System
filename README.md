# Clinic Management System

A comprehensive healthcare management system built with NestJS, Next.js, and PostgreSQL. Manage patients, appointments, visits, prescriptions, billing, inventory, and more.

## Features

- 👥 **Patient Management**: Complete patient records, demographics, and medical history
- 📅 **Appointment Scheduling**: Smart scheduling with room management and conflicts detection
- 🏥 **Visit Documentation**: SOAP notes, vitals, diagnosis, and treatment plans
- 💊 **Prescriptions**: Digital prescriptions with drug database integration
- 💰 **Billing & Invoicing**: Insurance claims, payments, and financial tracking
- 📦 **Inventory Management**: Stock tracking, reorder alerts, and vendor management
- 💉 **Pharmacy Management**: Direct dispensing with invoice generation
- 📊 **Reports & Analytics**: Comprehensive reporting and business intelligence
- 🔒 **Audit Logging**: Complete audit trail for compliance and security
- 🌐 **Multi-branch Support**: Manage multiple clinic locations
- 🔐 **RBAC**: Role-based access control with granular permissions
- 📱 **Responsive UI**: Modern, mobile-friendly interface

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- npm or yarn

### Local Development

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd Clinic_Management_System
```

2. **Backend Setup**
```bash
cd backend
npm install

# Create .env file
cat > .env << EOF
DATABASE_URL="postgresql://user:password@localhost:5432/clinic"
JWT_SECRET="your-secure-secret-here"
JWT_EXPIRES_IN="1d"
OPENAI_API_KEY="sk-..." # Optional
EOF

# Run migrations and seed
npx prisma migrate deploy
npx prisma generate
npm run seed

# Start backend
npm run start:dev
```

3. **Frontend Setup**
```bash
cd ../frontend
npm install

# Create .env.local file
echo 'NEXT_PUBLIC_API_PROXY=http://localhost:4000/' > .env.local

# Start frontend
npm run dev
```

4. **Access the application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- API Health: http://localhost:4000/health

## Railway Deployment

For detailed Railway deployment instructions, see **[RAILWAY_DEPLOYMENT_GUIDE.md](./RAILWAY_DEPLOYMENT_GUIDE.md)**.

### Quick Deploy

1. **Prerequisites**
   - [Railway account](https://railway.com/)
   - GitHub repository connected
   - Railway CLI installed: `npm i -g @railway/cli`

2. **Create Railway Project**
   - Create new project on Railway
   - Connect GitHub repository
   - Add PostgreSQL database

3. **Deploy Services**
   ```bash
   # Link project
   railway link

   # Deploy backend
   railway up --service backend

   # Deploy frontend
   railway up --service frontend

   # Seed database
   railway run --service backend npm run seed
   ```

4. **Configure Environment Variables**
   
   **Backend:**
   - `DATABASE_URL` (from PostgreSQL service)
   - `JWT_SECRET` (generate: `openssl rand -base64 32`)
   - `OPENAI_API_KEY` (optional)

   **Frontend:**
   - `NEXT_PUBLIC_API_PROXY` (backend URL with trailing slash)

5. **Verify Deployment**
   ```bash
   # Check health
   curl https://your-backend.railway.app/health

   # View logs
   railway logs --service backend
   railway logs --service frontend
   ```

### Deployment Helper Scripts

Use the included helper scripts:

```bash
# Check if ready to deploy
./scripts/check-deployment-readiness.sh

# Interactive deployment helper
./scripts/deploy-railway.sh
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend  │────▶│   Backend    │────▶│  PostgreSQL  │
│  (Next.js)  │     │  (NestJS)    │     │  Database    │
└─────────────┘     └──────────────┘     └──────────────┘
     3000                4000                  5432
```

### Tech Stack

**Backend:**
- NestJS (Node.js framework)
- Prisma ORM
- PostgreSQL
- JWT Authentication
- OpenAPI/Swagger docs

**Frontend:**
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui components
- React Query

## Documentation

- **[Railway Deployment Guide](./RAILWAY_DEPLOYMENT_GUIDE.md)** - Complete Railway deployment instructions
- **[Planning Document](./planning.md)** - System architecture and planning
- **[Backend README](./backend/README.md)** - Backend-specific documentation
- **[Frontend README](./frontend/README.md)** - Frontend-specific documentation
- **Module Documentation:**
  - [Appointments Module](./backend/src/modules/appointments/)
  - [Visits Module](./backend/src/modules/visits/)
  - [Billing Module](./backend/src/modules/billing/)
  - [Inventory Module](./backend/src/modules/inventory/)
  - [Prescriptions Module](./backend/src/modules/prescriptions/)
  - [Pharmacy Module](./backend/src/modules/pharmacy/)
  - [Audit Logs Module](./backend/src/modules/audit-logs/)
  - [Stock Prediction](./STOCK_PREDICTION_FEATURE.md)

## API Documentation

Once the backend is running, access interactive API documentation:
- Swagger UI: http://localhost:4000/api
- Health Check: http://localhost:4000/health

## Key Features

### Audit Logging
Complete audit trail of all system activities:
- Automatic tracking of all data changes
- User, IP, and timestamp tracking
- Old and new value comparison
- Export capabilities for compliance
- See [Audit Logs Module](./backend/src/modules/audit-logs/README.md) for details

### Multi-Branch Support
Manage multiple clinic locations:
- Branch-based data isolation
- Centralized user management
- Cross-branch reporting

### Role-Based Access Control
Granular permissions system:
- Predefined roles (Admin, Doctor, Nurse, Reception, Pharmacist)
- Custom permissions
- Resource-level access control

### Inventory Management
Smart inventory tracking:
- Real-time stock levels
- Reorder alerts
- Stock movement history
- Vendor management
- AI-powered stock prediction

## Environment Variables

### Backend Required
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT tokens (generate securely)
- `PORT` - Server port (default: 4000)

### Backend Optional
- `JWT_EXPIRES_IN` - Token expiration (default: "1d")
- `OPENAI_API_KEY` - For AI features (translations, transcription)
- `OPENAI_TRANSLATION_MODEL` - Model for translations (default: "gpt-4o-mini")
- `NODE_ENV` - Environment mode (production/development)

### Frontend Required
- `NEXT_PUBLIC_API_PROXY` - Backend API URL (include trailing slash)
- `PORT` - Server port (default: 3000)

## Security

- 🔐 JWT-based authentication
- 🔑 Bcrypt password hashing
- 🛡️ RBAC with granular permissions
- 📝 Complete audit logging
- 🔒 Branch-based data isolation
- 🌐 CORS configuration
- 🕵️ Sensitive data redaction in logs

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

## Database

### Migrations

```bash
# Create migration
npx prisma migrate dev --name migration_name

# Deploy migrations (production)
npx prisma migrate deploy

# Reset database (⚠️ destructive)
npx prisma migrate reset
```

### Backup

```bash
# Export database
pg_dump $DATABASE_URL > backup.sql

# Restore database
psql $DATABASE_URL < backup.sql
```

See [DATABASE_BACKUP_INFO.md](./DATABASE_BACKUP_INFO.md) for detailed backup procedures.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write/update tests
5. Submit a pull request

## Support

For issues and questions:
- Check existing documentation
- Review [Issues.md](./Issues.md) for known issues
- Create a GitHub issue
- Check deployment logs on Railway

## License

[Your License Here]

## Acknowledgments

Built with:
- [NestJS](https://nestjs.com/)
- [Next.js](https://nextjs.org/)
- [Prisma](https://www.prisma.io/)
- [Railway](https://railway.com/)
- [shadcn/ui](https://ui.shadcn.com/)

---

**Last Updated:** September 30, 2025  
**Version:** 2.0.0
