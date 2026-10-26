import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// The password every earlier version of this seed created. It is public, so an account that
// still verifies against it is compromised.
const LEGACY_DEFAULT_PASSWORD = 'Admin123!';
const MIN_PASSWORD_LENGTH = 12;

function passwordProblem(password: string): string | null {
  if (/change[-_]?me/i.test(password)) return 'still contains the CHANGE_ME placeholder';
  if (password === LEGACY_DEFAULT_PASSWORD) return 'is the published default password';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `is shorter than ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;

  // Fail closed: no credentials supplied means no admin account is created.
  if (!email || !password) {
    console.warn(
      'No admin user seeded: set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) to create the ' +
        'first admin. There is no default admin account.',
    );
    return;
  }

  const problem = passwordProblem(password);
  if (problem) {
    throw new Error(`ADMIN_PASSWORD ${problem}; no admin user was seeded.`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(password, 12), role: UserRole.admin },
    });
    console.log(`Seeded admin user: ${email}`);
    return;
  }

  // Rotate only an account that still has the published default password, and only because the
  // operator supplied a strong replacement. Any other existing account is left untouched.
  if (
    existing.passwordHash &&
    (await bcrypt.compare(LEGACY_DEFAULT_PASSWORD, existing.passwordHash))
  ) {
    await prisma.user.update({
      where: { email },
      data: { passwordHash: await bcrypt.hash(password, 12) },
    });
    console.warn(
      `SECURITY: ${email} had the published default password; rotated to ADMIN_PASSWORD.`,
    );
    return;
  }

  console.log(`Admin user ${email} already exists; left unchanged.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
