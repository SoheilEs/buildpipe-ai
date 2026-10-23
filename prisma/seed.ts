import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@buildpipe.ai';
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log('Admin user already exists');
    return;
  }

  const passwordHash = await bcrypt.hash('Admin123!', 12);
  await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      role: UserRole.admin,
    },
  });

  console.log('Seeded admin user: admin@buildpipe.ai / Admin123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
