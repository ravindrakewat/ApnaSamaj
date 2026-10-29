import { execSync } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';

// Load staging environment with override
dotenv.config({ path: path.resolve(process.cwd(), '.env.staging'), override: true });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.staging'), override: true });

function runStagingMigration(): void {
  console.log('================================================================');
  console.log('   Apna Samaj — Staging Database Migration Orchestrator         ');
  console.log('================================================================');

  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) {
    console.error('❌ FATAL: DATABASE_URL is not set.');
    process.exit(1);
  }

  let parsed: URL;
  try {
    parsed = new URL(dbUrl);
  } catch {
    console.error('❌ FATAL: Malformed DATABASE_URL in staging environment.');
    process.exit(1);
  }

  const hostname = parsed.hostname.toLowerCase();
  const dbName = parsed.pathname.replace(/^\//, '');

  // Strict Fail-Safe Assertions
  if (
    hostname.includes('supabase.co') ||
    hostname.includes('supabase.com') ||
    hostname.includes('tgyrrobrdhbzgheygvdz') ||
    dbUrl.includes('pooler.supabase.com')
  ) {
    console.error('❌ CRITICAL SAFETY VIOLATION: DATABASE_URL points to Production Supabase!');
    console.error('   Aborting immediately to protect production database.');
    process.exit(1);
  }

  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    console.error(`❌ CRITICAL: Staging migrations must run against localhost. Received: ${hostname}`);
    process.exit(1);
  }

  if (dbName !== 'apnasamaj_staging_kewat') {
    console.error(`❌ CRITICAL: Target database must be "apnasamaj_staging_kewat". Received: "${dbName}"`);
    process.exit(1);
  }

  console.log(`Verified Staging Target: ${hostname}:5432/${dbName}`);
  console.log('Running Prisma migrate deploy against local staging database...\n');

  const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');
  execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      DIRECT_URL: process.env.DIRECT_URL || dbUrl,
    },
    stdio: 'inherit',
  });

  console.log('\n✅ Staging database schema is up to date.');
}

if (require.main === module) {
  try {
    runStagingMigration();
  } catch (err: unknown) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

