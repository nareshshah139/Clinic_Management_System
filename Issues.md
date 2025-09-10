Inventory add item does not work.

Visits page - form does not load.

Resolved: Fixed by improving auth token retrieval in `frontend/src/lib/api.ts` (cookie fallback) and parallelizing ID fetches in `frontend/src/app/dashboard/visits/page.tsx`. The form now renders once patient and doctor IDs are fetched.

Fix these one by one? Also run this in non minimal mode. So that I can catch errors and fix them.