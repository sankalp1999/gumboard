/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const INDEXES = [
  'idx_note_board_deleted',
  'idx_note_board_created',
  'idx_note_user_deleted',
];

async function runExplain(query) {
  // Use $queryRaw to run EXPLAIN ANALYZE on the same query shape
  const board = await prisma.board.findFirst({ select: { id: true } });
  return prisma.$queryRawUnsafe(
    `EXPLAIN ANALYZE SELECT id, "createdAt" FROM "notes" WHERE "boardId" = $1 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 50`,
    board.id,
  );
}

async function dropIndexes() {
  for (const name of INDEXES) {
    try {
      // IF EXISTS for safety on dev
      // eslint-disable-next-line no-await-in-loop
      await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${name}"`);
    } catch (e) {
      // ignore
    }
  }
}

async function recreateIndexes() {
  // Recreate exactly as in schema
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "idx_note_board_deleted" ON "notes" ("boardId", "deletedAt")'
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "idx_note_board_created" ON "notes" ("boardId", "createdAt")'
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "idx_note_user_deleted" ON "notes" ("createdBy", "deletedAt")'
  );
}

async function main() {
  console.log('EXPLAIN without indexes:');
  await dropIndexes();
  const before = await runExplain();
  console.log(before.map((r) => Object.values(r)[0]).join('\n'));

  console.log('\nRecreating indexes...');
  await recreateIndexes();

  console.log('\nEXPLAIN with indexes:');
  const after = await runExplain();
  console.log(after.map((r) => Object.values(r)[0]).join('\n'));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


