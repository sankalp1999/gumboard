/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function randomColor() {
  const colors = [
    '#fef3c7', '#e0f2fe', '#dcfce7', '#fae8ff', '#ffedd5', '#e9d5ff', '#fee2e2',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

async function main() {
  const boardsToCreate = parseInt(process.env.SEED_BOARDS || '5', 10);
  const notesPerBoard = parseInt(process.env.SEED_NOTES_PER_BOARD || '300', 10);
  const usersToCreate = parseInt(process.env.SEED_USERS || '5', 10);

  console.log(`Seeding with ${boardsToCreate} boards x ${notesPerBoard} notes (≈${boardsToCreate * notesPerBoard} notes)`);

  // Ensure an organization and users exist
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: 'Perf Org',
      },
    });
  }

  const users = [];
  for (let i = 0; i < usersToCreate; i += 1) {
    const email = `seed_user_${i}@example.com`;
    const existing = await prisma.user.findUnique({ where: { email } });
    const user = existing || (await prisma.user.create({
      data: {
        email,
        name: `Seed User ${i}`,
        organizationId: org.id,
      },
    }));
    users.push(user);
  }

  // Create boards
  const boards = [];
  for (let b = 0; b < boardsToCreate; b += 1) {
    const board = await prisma.board.create({
      data: {
        name: `Seed Board ${b}`,
        description: 'Benchmark board',
        organizationId: org.id,
        createdBy: users[0].id,
      },
    });
    boards.push(board);
  }

  // Create notes in batches per board
  for (const board of boards) {
    const batchSize = 100;
    const total = notesPerBoard;
    for (let offset = 0; offset < total; offset += batchSize) {
      const batch = Array.from({ length: Math.min(batchSize, total - offset) }, (_, idx) => {
        const user = users[(offset + idx) % users.length];
        return {
          id: crypto.randomUUID(),
          content: `Seed note ${offset + idx} for board ${board.id}`,
          color: randomColor(),
          boardId: board.id,
          createdBy: user.id,
          done: Math.random() < 0.2,
          createdAt: new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000),
          updatedAt: new Date(),
        };
      });
      await prisma.note.createMany({ data: batch });
      process.stdout.write('.');
    }
    process.stdout.write(` board ${board.name} done\n`);
  }

  console.log('Seeding complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


