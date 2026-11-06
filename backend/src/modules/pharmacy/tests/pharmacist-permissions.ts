import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

export function pharmacistDefaultPermissions(): string[] {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('controller.ts'))
        for (const match of readFileSync(full, 'utf8').matchAll(/'([a-z-]+(?::[a-z-]+)+)'/g)) found.add(match[1]);
    }
  };
  walk(path.resolve(__dirname, '../../..'));
  return [...found].filter((permission) => ['inventory', 'pharmacy'].includes(permission.split(':')[0])).sort();
}
