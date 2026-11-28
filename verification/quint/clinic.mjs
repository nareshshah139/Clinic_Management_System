// The clinic repo checkout that the real-code replays read. Inside the repo it is two folders up.
// Split out on its own, set CLINIC_REPO to a clinic checkout.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLINIC_REPO = path.resolve(process.env.CLINIC_REPO ?? fileURLToPath(new URL('../..', import.meta.url)));
export const clinicPath = (rel) => path.join(CLINIC_REPO, rel);
export const hasClinicRepo = () => fs.existsSync(clinicPath('backend/src/modules/pharmacy/pharmacy-partner-sales.service.ts'));

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(hasClinicRepo() ? 0 : 1);
