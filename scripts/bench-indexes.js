/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function time(fn) {
  const start = process.hrtime.bigint();
  const result = await fn();
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1e6;
  return { ms, result };
}

async function main() {
  const board = await prisma.board.findFirst({ select: { id: true } });
  if (!board) {
    console.error('No board found. Seed data first with `pnpm db:seed-large`.');
    process.exit(1);
  }

  console.log('Benchmarking queries...');

  const queries = [
    {
      name: 'notes_by_board_deleted_createdAt_limit50',
      run: () => prisma.note.findMany({
        where: { boardId: board.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, createdAt: true },
      }),
    },
    {
      name: 'count_notes_by_board_deleted',
      run: () => prisma.note.count({
        where: { boardId: board.id, deletedAt: null },
      }),
    },
  ];

  for (const q of queries) {
    // Warmup
    await q.run();

    const samples = [];
    for (let i = 0; i < 5; i += 1) {
      const { ms } = await time(q.run);
      samples.push(ms);
    }
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    console.log(`${q.name}: avg ${avg.toFixed(2)} ms over ${samples.length} runs`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


