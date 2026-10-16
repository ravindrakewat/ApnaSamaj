import dotenv from 'dotenv';
import path from 'path';
import * as argon2 from 'argon2';
import { prisma, Role, UserStatus } from './index';
import { phoneSchema, maskPhone } from '@apnasamaj/validation';

// Explicitly load root .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function sanitizeError(err: unknown): string {
  if (!err) return 'Unknown error';
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/postgres(ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]');
}

async function bootstrapSuperAdmin(): Promise<void> {
  const rawPhone = process.env.BOOTSTRAP_ADMIN_PHONE?.trim();
  const rawPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
  const adminName = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Super Admin';

  // 1. Validate required environment inputs
  if (!rawPhone || rawPhone === 'replace_with_initial_superadmin_phone') {
    console.error('[Bootstrap] ERROR: BOOTSTRAP_ADMIN_PHONE is missing or set to placeholder in .env.');
    process.exit(1);
  }

  if (!rawPassword || rawPassword === 'replace_with_initial_superadmin_password' || rawPassword.length < 8) {
    console.error('[Bootstrap] ERROR: BOOTSTRAP_ADMIN_PASSWORD is missing, set to placeholder, or shorter than 8 characters.');
    process.exit(1);
  }

  // 2. Normalize and validate phone format
  let normalizedPhone: string;
  try {
    normalizedPhone = phoneSchema.parse(rawPhone);
  } catch (validationErr) {
    console.error('[Bootstrap] ERROR: BOOTSTRAP_ADMIN_PHONE failed Indian phone number validation.');
    console.error('[Bootstrap] Expected 10-digit number starting with 6, 7, 8, or 9 (with optional +91 prefix).');
    process.exit(1);
  }

  // 3. Idempotency Check A: Does a SUPER_ADMIN already exist in the database?
  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: Role.SUPER_ADMIN },
    select: { id: true, phone: true },
  });

  if (existingSuperAdmin) {
    console.log(`[Bootstrap] Idempotency notice: A SUPER_ADMIN account already exists (ID: ${existingSuperAdmin.id}, Phone: ${maskPhone(existingSuperAdmin.phone)}).`);
    console.log('[Bootstrap] Refusing to create a duplicate SUPER_ADMIN. No changes made to database.');
    return;
  }

  // 4. Idempotency Check B: Does an account with this exact phone already exist?
  const existingPhoneUser = await prisma.user.findUnique({
    where: { phone: normalizedPhone },
    select: { id: true, role: true },
  });

  if (existingPhoneUser) {
    console.error(`[Bootstrap] ERROR: An account with phone number ${maskPhone(normalizedPhone)} already exists with role ${existingPhoneUser.role}.`);
    console.error('[Bootstrap] Refusing to overwrite or elevate existing user. Exiting without changes.');
    process.exit(1);
  }

  // 5. Securely hash password with Argon2id
  console.log('[Bootstrap] Hashing password with Argon2id...');
  const passwordHash = await argon2.hash(rawPassword, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3,
    parallelism: 1,
  });

  // 6. Create SUPER_ADMIN and required Profile atomically
  console.log('[Bootstrap] Creating SUPER_ADMIN record and associated Profile in database...');
  const user = await prisma.$transaction(async (tx) => {
    return tx.user.create({
      data: {
        phone: normalizedPhone,
        passwordHash,
        role: Role.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        isPhoneVerified: true,
        profile: {
          create: {
            fullName: adminName,
          },
        },
      },
      select: {
        id: true,
        role: true,
        status: true,
        createdAt: true,
        profile: {
          select: {
            fullName: true,
          },
        },
      },
    });
  });

  console.log('[Bootstrap] ==========================================');
  console.log('[Bootstrap] SUCCESS: Super Admin bootstrap complete!');
  console.log(`[Bootstrap] User ID : ${user.id}`);
  console.log(`[Bootstrap] Role    : ${user.role}`);
  console.log(`[Bootstrap] Status  : ${user.status}`);
  console.log(`[Bootstrap] Name    : ${user.profile?.fullName}`);
  console.log(`[Bootstrap] Phone   : ${maskPhone(normalizedPhone)}`);
  console.log('[Bootstrap] ==========================================');
}

bootstrapSuperAdmin()
  .catch((err) => {
    console.error('[Bootstrap] FATAL ERROR:', sanitizeError(err));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
