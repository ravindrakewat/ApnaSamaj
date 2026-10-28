import { execSync } from 'child_process';
import path from 'path';
import { tenantDbManager, sanitizeDatabaseUrl } from './tenant-manager';

export interface TenantMigrationResult {
  slug: string;
  name: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

export interface MultiTenantMigrationOptions {
  tenantSlug?: string;
  schemaPath?: string;
}

/**
 * Production-safe multi-tenant Prisma migration orchestrator.
 * 
 * Safety Guarantees:
 * 1. Strictly iterates over explicitly registered, trusted community databases from tenantDbManager.
 * 2. Never falls back to default DATABASE_URL for an unrelated community tenant.
 * 3. Strips all passwords and credentials from logs using sanitizeDatabaseUrl.
 * 4. Executes non-destructive `prisma migrate deploy` per tenant in independent transactions.
 * 5. Collects results per tenant and continues rollout even if a specific tenant encounters a transient failure.
 * 6. Never runs automatically on server startup.
 */
export async function runMultiTenantMigrations(
  options: MultiTenantMigrationOptions = {}
): Promise<{ success: boolean; results: TenantMigrationResult[] }> {
  const schemaPath = options.schemaPath || path.resolve(__dirname, '../prisma/schema.prisma');
  const allConfigs = tenantDbManager.getAllCommunityConfigs();

  if (allConfigs.length === 0) {
    console.error('[Multi-Tenant Migration] No community tenant databases are configured in environment.');
    return { success: false, results: [] };
  }

  // Filter by single tenant if requested
  let targets = allConfigs;
  if (options.tenantSlug) {
    const requested = options.tenantSlug.toLowerCase().trim();
    targets = allConfigs.filter((c) => c.slug === requested);
    if (targets.length === 0) {
      console.error(`[Multi-Tenant Migration] Requested tenant "${requested}" is not registered in configuration.`);
      return { success: false, results: [] };
    }
  }

  console.log(`================================================================`);
  console.log(`   Apna Samaj Multi-Tenant Database Migration Rollout           `);
  console.log(`================================================================`);
  console.log(`Targeting ${targets.length} community tenant database(s)...\n`);

  const results: TenantMigrationResult[] = [];

  for (const config of targets) {
    const startTime = Date.now();
    const sanitizedTarget = sanitizeDatabaseUrl(config.databaseUrl);
    console.log(`--- Migrating Community: "${config.name}" (${config.slug}) ---`);
    console.log(`Target URL: ${sanitizedTarget}`);

    try {
      // Execute standard prisma migrate deploy targeting this tenant database exclusively
      execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
        cwd: path.resolve(__dirname, '..'),
        env: {
          ...process.env,
          DATABASE_URL: config.databaseUrl,
          DIRECT_URL: config.directUrl || config.databaseUrl,
        },
        stdio: 'pipe',
      });

      const durationMs = Date.now() - startTime;
      console.log(`✅ SUCCESS: Community "${config.slug}" migrated successfully in ${durationMs}ms.\n`);
      results.push({
        slug: config.slug,
        name: config.name,
        success: true,
        durationMs,
      });
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const rawError = (err as { stderr?: Buffer; message?: string })?.stderr?.toString() ||
        (err as Error)?.message ||
        'Unknown migration error';

      // Sanitize any database credentials from error output
      const cleanError = rawError
        .split('\n')
        .map((line) => line.replace(/postgres(ql)?:\/\/[^\s]+/g, '[REDACTED_DATABASE_URL]'))
        .join('\n');

      console.error(`❌ FAILED: Community "${config.slug}" migration failed after ${durationMs}ms:`);
      console.error(cleanError);
      console.log('');

      results.push({
        slug: config.slug,
        name: config.name,
        success: false,
        durationMs,
        error: cleanError,
      });
    }
  }

  const failedCount = results.filter((r) => !r.success).length;
  const overallSuccess = failedCount === 0;

  console.log(`================================================================`);
  console.log(`   Migration Rollout Summary: ${results.length - failedCount} succeeded, ${failedCount} failed`);
  console.log(`================================================================`);

  return { success: overallSuccess, results };
}

// CLI Execution entrypoint (if executed directly via tsx, not on import)
if (require.main === module) {
  const args = process.argv.slice(2);
  const tenantArg = args.find((a) => a.startsWith('--tenant='))?.split('=')[1];

  runMultiTenantMigrations({ tenantSlug: tenantArg })
    .then(({ success }) => {
      process.exit(success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal multi-tenant migration error:', err);
      process.exit(1);
    });
}

