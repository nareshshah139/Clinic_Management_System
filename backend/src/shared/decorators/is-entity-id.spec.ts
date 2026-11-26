import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const CLIENT_UUIDS = new Set(['attemptId', 'recoveryId']);
const AWAITING_BRANCH_SCOPING = new Set([
  'modules/users/dto/user.dto.ts: branchId',
  'modules/users/dto/query-user.dto.ts: branchId',
  'modules/users/dto/query-user.dto.ts: userId',
]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

it('validates entity ids, which are cuids, with IsEntityId rather than IsUUID', () => {
  const root = join(__dirname, '../..');
  const offenders = sources(root).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/@IsUUID\([^)]*\)[\s\S]*?(\w+)[?!]?:/g)]
      .filter(([, field]) => !CLIENT_UUIDS.has(field))
      .map(([, field]) => `${relative(root, file)}: ${field}`)
      .filter((entry) => !AWAITING_BRANCH_SCOPING.has(entry)),
  );
  expect(offenders).toEqual([]);
});
