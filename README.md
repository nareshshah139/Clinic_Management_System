# Clinic Management System

## Deploying on Railway

1. Create a new project on [Railway](https://railway.com/).
2. Connect this GitHub repository and enable two services:
   - Backend (rootDir: `backend`) — uses `backend/railway.toml`.
   - Frontend (rootDir: `frontend`) — uses `frontend/railway.toml`.
3. Provision a Postgres database on Railway and set the following variables on the backend service:
   - `DATABASE_URL` — from the provisioned Postgres plugin
   - `JWT_SECRET` — any secure random string
   - `OPENAI_API_KEY` — for translations (optional but recommended)
   - `OPENAI_TRANSLATION_MODEL` — default `gpt-4o-mini` (optional)
4. On the frontend service set:
   - `NEXT_PUBLIC_API_PROXY` — the backend public URL, e.g., `https://<backend-service>.up.railway.app/`
5. Deploy. The backend exposes `/health` for health checks and listens on `PORT=4000`; the frontend on `PORT=3000`.

> Notes
> - Backend Dockerfile runs Prisma migrations at start.
> - Next.js is configured with `output: 'standalone'` for efficient Docker runtime.
