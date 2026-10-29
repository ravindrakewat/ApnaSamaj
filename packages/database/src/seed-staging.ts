import dotenv from 'dotenv';
import path from 'path';
import * as argon2 from 'argon2';
import { PrismaClient, Role, UserStatus } from './index';
import { phoneSchema, maskPhone } from '@apnasamaj/validation';

// Ensure staging environment is loaded with override: true
dotenv.config({ path: path.resolve(process.cwd(), '.env.staging'), override: true });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.staging'), override: true });

/**
 * Production Protection Fail-Safe:
 * Programmatically aborts if the target database is Production or non-local.
 */
function assertStagingTarget(): string {
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) {
    console.error('❌ FATAL: DATABASE_URL is not set.');
    process.exit(1);
  }

  let parsed: URL;
  try {
    parsed = new URL(dbUrl);
  } catch {
    console.error('❌ FATAL: Malformed DATABASE_URL.');
    process.exit(1);
  }

  const hostname = parsed.hostname.toLowerCase();
  const dbName = parsed.pathname.replace(/^\//, '');

  if (
    hostname.includes('supabase.co') ||
    hostname.includes('supabase.com') ||
    hostname.includes('tgyrrobrdhbzgheygvdz') ||
    dbUrl.includes('pooler.supabase.com')
  ) {
    console.error('❌ FATAL CRITICAL SAFETY VIOLATION: DATABASE_URL points to Supabase Production!');
    console.error('   Aborting immediately to protect live production data.');
    process.exit(1);
  }

  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    console.error(`❌ FATAL: Staging database must run on localhost. Received host: ${hostname}`);
    process.exit(1);
  }

  if (dbName !== 'apnasamaj_staging_kewat') {
    console.error(`❌ FATAL: Target database must be "apnasamaj_staging_kewat". Received: "${dbName}"`);
    process.exit(1);
  }

  return dbUrl;
}

export const STAGING_MODERATED_POST_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

export async function seedStagingDatabase(): Promise<void> {
  const verifiedUrl = assertStagingTarget();
  console.log('================================================================');
  console.log('   Apna Samaj — Staging Seed Script Execution                   ');
  console.log('================================================================');
  console.log(`Verified Staging Target: localhost:5432/apnasamaj_staging_kewat (Production Safeguards Active)\n`);

  const prisma = new PrismaClient({
    datasources: {
      db: { url: verifiedUrl },
    },
  });

  try {
    // Generate secure Argon2id hash for staging test accounts
    const testPassword = 'StagingTestUserPassword123!';
    const passwordHash = await argon2.hash(testPassword, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    });

    // 1. Seed Author Member
    const authorPhone = phoneSchema.parse('+919999900001');
    const author = await prisma.user.upsert({
      where: { phone: authorPhone },
      update: {
        role: Role.MEMBER,
        status: UserStatus.ACTIVE,
        isPhoneVerified: true,
      },
      create: {
        phone: authorPhone,
        passwordHash,
        role: Role.MEMBER,
        status: UserStatus.ACTIVE,
        isPhoneVerified: true,
        profile: {
          create: {
            fullName: 'Staging Author Member',
            city: 'Jabalpur',
            state: 'Madhya Pradesh',
          },
        },
      },
      include: { profile: true },
    });
    console.log(`✅ Seeded Author Member: ID=${author.id}, Phone=${maskPhone(author.phone)}, Name="${author.profile?.fullName}"`);

    // 2. Seed Intruder Member (for cross-user isolation verification)
    const intruderPhone = phoneSchema.parse('+919999900002');
    const intruder = await prisma.user.upsert({
      where: { phone: intruderPhone },
      update: {
        role: Role.MEMBER,
        status: UserStatus.ACTIVE,
        isPhoneVerified: true,
      },
      create: {
        phone: intruderPhone,
        passwordHash,
        role: Role.MEMBER,
        status: UserStatus.ACTIVE,
        isPhoneVerified: true,
        profile: {
          create: {
            fullName: 'Staging Intruder Member',
            city: 'Bhopal',
            state: 'Madhya Pradesh',
          },
        },
      },
      include: { profile: true },
    });
    console.log(`✅ Seeded Intruder Member: ID=${intruder.id}, Phone=${maskPhone(intruder.phone)}, Name="${intruder.profile?.fullName}"`);

    // 3. Seed Community Moderator
    const moderatorPhone = phoneSchema.parse('+919999900003');
    const moderator = await prisma.user.upsert({
      where: { phone: moderatorPhone },
      update: {
        role: Role.MODERATOR,
        status: UserStatus.ACTIVE,
        isPhoneVerified: true,
      },
      create: {
        phone: moderatorPhone,
        passwordHash,
        role: Role.MODERATOR,
        status: UserStatus.ACTIVE,
        isPhoneVerified: true,
        profile: {
          create: {
            fullName: 'Staging Community Moderator',
            city: 'Indore',
            state: 'Madhya Pradesh',
          },
        },
      },
      include: { profile: true },
    });
    console.log(`✅ Seeded Community Moderator: ID=${moderator.id}, Phone=${maskPhone(moderator.phone)}, Role=${moderator.role}`);

    // 4. Seed Prerequisite Moderation Deletion AuditLog for the target post
    const existingDeletionAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'MODERATION_DELETE_POST',
        targetType: 'Post',
        targetId: STAGING_MODERATED_POST_ID,
      },
    });

    if (!existingDeletionAudit) {
      await prisma.auditLog.create({
        data: {
          actorId: moderator.id,
          action: 'MODERATION_DELETE_POST',
          targetType: 'Post',
          targetId: STAGING_MODERATED_POST_ID,
          details: {
            postAuthorId: author.id,
            postType: 'GENERAL',
            reason: 'SPAM',
            moderatorNotes: 'Automated test moderation record for staging appeals workflow',
          },
        },
      });
      console.log(`✅ Seeded MODERATION_DELETE_POST audit record for post ${STAGING_MODERATED_POST_ID} (Author: ${author.id})`);
    } else {
      console.log(`ℹ️ MODERATION_DELETE_POST audit record already exists for post ${STAGING_MODERATED_POST_ID}`);
    }

    // 5. Seed Initial Post Moderation Notification for Author
    const existingNotification = await prisma.notification.findFirst({
      where: {
        recipientId: author.id,
        type: 'POST_MODERATED',
        entityId: STAGING_MODERATED_POST_ID,
      },
    });

    if (!existingNotification) {
      await prisma.notification.create({
        data: {
          recipientId: author.id,
          actorId: null,
          type: 'POST_MODERATED',
          title: 'Post Removed by Moderation',
          message: 'Your post was removed by community moderation for violating guidelines.',
          entityType: 'POST',
          entityId: STAGING_MODERATED_POST_ID,
        },
      });
      console.log(`✅ Seeded initial POST_MODERATED notification for author (${author.id})`);
    } else {
      console.log(`ℹ️ Initial POST_MODERATED notification already exists for author`);
    }

    console.log('\n================================================================');
    console.log('✅ Staging Database Successfully Seeded for Appeals Workflow');
    console.log('================================================================\n');
  } finally {
    await prisma.$disconnect();
  }
}

// Execute CLI entrypoint if run directly
if (require.main === module) {
  seedStagingDatabase().catch((err) => {
    console.error('Fatal staging seed error:', err);
    process.exit(1);
  });
}
