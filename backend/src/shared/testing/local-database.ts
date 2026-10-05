import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

/**
 * @cc [owner:nareshshah139,label:testing] disposable-local-database
 * Database fixtures MUST require an explicit loopback URL, isolate data in a unique schema,
 * and remove only that schema. Extension operators MUST remain visible on the test connection.
 */
export async function localDatabase(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Database tests require local PostgreSQL');
  url.searchParams.set('schema', 'public');
  const admin = new PrismaClient({ datasourceUrl: url.toString() });
  const schema = `inventory_read_test_${randomUUID().replaceAll('-', '')}`;
  let created = false;
  let prisma: PrismaClient | undefined;
  const cleanup = async () => {
    await prisma?.$disconnect();
    if (created)
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  };
  try {
    await admin.$executeRawUnsafe(
      'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public',
    );
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'db',
        'push',
        '--skip-generate',
        '--schema',
        path.resolve('prisma/schema.prisma'),
      ],
      {
        env: { ...process.env, DATABASE_URL: url.toString() },
        stdio: 'pipe',
      },
    );
    execFileSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'db',
        'execute',
        '--url',
        url.toString(),
        '--file',
        path.resolve(
          'prisma/migrations/20261005093000_inventory_read_queries/migration.sql',
        ),
      ],
      { stdio: 'pipe' },
    );
    const queries: string[] = [];
    const events: { query: string; params: string }[] = [];
    prisma = new PrismaClient({
      datasourceUrl: url.toString(),
      log: [{ emit: 'event', level: 'query' }],
    });
    (prisma as any).$on('query', (event: { query: string; params: string }) => {
      queries.push(event.query);
      events.push(event);
    });
    await exposeTestTrigramOperator(prisma);
    return { prisma, schema, queries, events, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/**
 * @cc [owner:nareshshah139,label:testing] isolated-trigram-operator
 * The disposable schema MUST resolve the real pg_trgm distance operator on every pooled
 * connection. Fixture setup MUST NOT serialize concurrency tests or change the shared role.
 */
export async function exposeTestTrigramOperator(prisma: PrismaClient) {
  const [target] = await prisma.$queryRaw<
    { schema: string }[]
  >`SELECT current_schema() AS schema`;
  if (
    !/^(inventory_read_test_|ocr_automation_test_)[a-f0-9]{32}$/.test(
      target.schema,
    )
  )
    throw new Error('Trigram fixture requires its own disposable schema');
  const [extension] = await prisma.$queryRaw<{ schema: string }[]>`
    SELECT n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm'`;
  const namespace = '"' + extension.schema.replaceAll('"', '""') + '"';
  // Prisma resets each pooled connection's search_path to the isolated schema.
  await prisma.$executeRawUnsafe(
    `CREATE OPERATOR <->> (LEFTARG = text, RIGHTARG = text, FUNCTION = ${namespace}.word_similarity_dist_commutator_op)`,
  );
}
