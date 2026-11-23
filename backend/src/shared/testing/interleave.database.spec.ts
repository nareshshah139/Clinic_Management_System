import { PrismaClient } from '@prisma/client';
import { localDatabase } from './local-database';
import { gate } from './interleave';

const databaseTests = process.env.FORMAL_REPLAY_TEST_DATABASE_URL ? describe : describe.skip;

databaseTests('gate() interleaves two requests at a chosen Prisma call', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let prisma: PrismaClient;

  beforeAll(async () => {
    fixture = await localDatabase(process.env.FORMAL_REPLAY_TEST_DATABASE_URL!);
    prisma = fixture.prisma;
  }, 120_000);
  afterAll(() => fixture?.cleanup());

  it('lets a second writer land between the first writer read and write', async () => {
    const branch = await prisma.branch.create({ data: { name: 'start', address: 'Synthetic' } });
    const g = gate(prisma, 'branch.update', { when: 'before' });
    const first = (async () => {
      const read = await g.client.branch.findUniqueOrThrow({ where: { id: branch.id } });
      return g.client.branch.update({ where: { id: branch.id }, data: { name: `${read.name}+A` } });
    })();
    await g.arrived;
    await prisma.branch.update({ where: { id: branch.id }, data: { name: 'B' } });
    g.release();
    await first;
    const final = await prisma.branch.findUniqueOrThrow({ where: { id: branch.id } });
    expect(final.name).toBe('start+A');
  });

  it('gates calls made inside an interactive transaction', async () => {
    const branch = await prisma.branch.create({ data: { name: 'tx', address: 'Synthetic' } });
    const g = gate(prisma, 'branch.update', { when: 'after' });
    const first = g.client.$transaction(async (tx) =>
      tx.branch.update({ where: { id: branch.id }, data: { name: 'inside' } }),
    );
    await g.arrived;
    expect(g.calls()).toBe(1);
    g.release();
    expect((await first).name).toBe('inside');
  });
});
