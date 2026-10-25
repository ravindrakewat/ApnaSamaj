import {
  TenantDatabaseManager,
  sanitizeDatabaseUrl,
  extractSafeMetadata,
  UnknownCommunityTenantError,
  TenantConfigurationError,
} from './tenant-manager';

console.log('================================================================');
console.log('   Apna Samaj — Phase 15B.1 Tenant Database Manager Tests       ');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assertTest(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failedTests++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Connection String Sanitization & Redaction Tests
// ---------------------------------------------------------------------------
console.log('--- 1. Database URL Sanitization (Zero Password Leakage) ---');

const testSecretUrl =
  'postgresql://postgres:super_secret_password_123@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
const sanitized = sanitizeDatabaseUrl(testSecretUrl);

assertTest(
  !sanitized.includes('super_secret_password_123'),
  'Sanitized URL strictly hides database password'
);
assertTest(
  !sanitized.includes('postgres:super_secret_password_123'),
  'Sanitized URL strictly hides username and password'
);
assertTest(
  sanitized.includes('aws-0-ap-northeast-1.pooler.supabase.com:6543'),
  'Sanitized URL preserves safe host and port'
);
assertTest(
  sanitized.includes('REDACTED'),
  'Sanitized URL includes [REDACTED_CREDENTIALS] marker'
);
assertTest(
  sanitizeDatabaseUrl('') === '[EMPTY_DATABASE_URL]',
  'Empty database URL returns safe fallback label'
);
assertTest(
  sanitizeDatabaseUrl('not-a-valid-url') === '[MALFORMED_DATABASE_URL]',
  'Malformed database URL returns safe fallback label'
);

// ---------------------------------------------------------------------------
// 2. Safe Metadata Extraction Tests
// ---------------------------------------------------------------------------
console.log('\n--- 2. Safe Metadata Extraction ---');

const meta = extractSafeMetadata('kewat', 'Kewat Samaj', testSecretUrl);
assertTest(meta.slug === 'kewat', 'Metadata slug is kewat');
assertTest(meta.name === 'Kewat Samaj', 'Metadata name is Kewat Samaj');
assertTest(meta.isConfigured === true, 'Metadata reports isConfigured=true');
assertTest(
  meta.host === 'aws-0-ap-northeast-1.pooler.supabase.com',
  'Metadata extracts correct host'
);
assertTest(meta.port === '6543', 'Metadata extracts correct port');
assertTest(meta.protocol === 'postgresql:', 'Metadata extracts correct protocol');

// ---------------------------------------------------------------------------
// 3. Trusted Tenant Registration & Validation
// ---------------------------------------------------------------------------
console.log('\n--- 3. Trusted Community Tenant Registration ---');

// Mock PrismaClient factory to avoid touching real network/database
const createdClients: Array<{ url: string; disconnected: boolean }> = [];

function createMockPrismaClient(url: string) {
  const clientObj = {
    _url: url,
    $disconnect: async () => {
      clientObj._disconnected = true;
    },
    _disconnected: false,
  };
  createdClients.push({ url, disconnected: false });
  return clientObj as any;
}

const manager = new TenantDatabaseManager(createMockPrismaClient);
manager.clearRegistry(); // Start with clean state for unit test isolation

// Register Kewat community
manager.registerCommunity({
  slug: 'kewat',
  name: 'Kewat Samaj',
  databaseUrl: 'postgresql://user:pass@kewat-db.supabase.co:6543/postgres',
  connectionLimit: 8,
});

assertTest(manager.hasCommunity('kewat'), 'Manager has Kewat community registered');
assertTest(manager.hasCommunity('KEWAT'), 'Slug lookup is case-insensitive');
assertTest(!manager.hasCommunity('unknown'), 'Unregistered community returns false');

// Register Gupta community
manager.registerCommunity({
  slug: 'gupta',
  name: 'Gupta Samaj',
  databaseUrl: 'postgresql://user:pass@gupta-db.supabase.co:6543/postgres',
  connectionLimit: 8,
});

assertTest(manager.hasCommunity('gupta'), 'Manager has Gupta community registered');
assertTest(
  manager.listConfiguredSlugs().length === 2,
  'Configured slugs count equals 2 (kewat, gupta)'
);

// Invalid slug rejection
try {
  manager.registerCommunity({
    slug: 'k', // too short
    name: 'Invalid',
    databaseUrl: 'postgresql://user:pass@localhost:5432/db',
  });
  assertTest(false, 'Should have thrown for short slug');
} catch (err) {
  assertTest(
    err instanceof TenantConfigurationError,
    'Rejects invalid community slug (< 2 characters)'
  );
}

// Invalid protocol rejection
try {
  manager.registerCommunity({
    slug: 'mysql-tenant',
    name: 'MySQL Tenant',
    databaseUrl: 'mysql://user:pass@localhost:3306/db',
  });
  assertTest(false, 'Should have thrown for mysql protocol');
} catch (err) {
  assertTest(
    err instanceof TenantConfigurationError,
    'Rejects non-postgresql connection protocol'
  );
}

// ---------------------------------------------------------------------------
// 4. Client Resolution, Caching & Isolation
// ---------------------------------------------------------------------------
console.log('\n--- 4. Client Resolution, Caching & Tenant Isolation ---');

const kewatClient1 = manager.getClient('kewat');
assertTest(Boolean(kewatClient1), 'Successfully retrieved Kewat Prisma client');

const kewatClient2 = manager.getClient('kewat');
assertTest(
  kewatClient1 === kewatClient2,
  'Reuses cached client instance for identical community slug (Connection Pooling)'
);

const guptaClient = manager.getClient('gupta');
assertTest(Boolean(guptaClient), 'Successfully retrieved Gupta Prisma client');
assertTest(
  kewatClient1 !== guptaClient,
  'Kewat client and Gupta client are strictly separate instances (Physical Isolation)'
);

// Verify tuned connection_limit was appended
assertTest(
  (kewatClient1 as any)._url.includes('connection_limit=8'),
  'Appends connection_limit=8 to Kewat connection URL'
);
assertTest(
  (guptaClient as any)._url.includes('connection_limit=8'),
  'Appends connection_limit=8 to Gupta connection URL'
);

// Unregistered community access denial
try {
  manager.getClient('hacker-samaj');
  assertTest(false, 'Should have thrown for unknown community');
} catch (err) {
  assertTest(
    err instanceof UnknownCommunityTenantError,
    'Throws UnknownCommunityTenantError (404) for unregistered tenant'
  );
}

// ---------------------------------------------------------------------------
// 5. Safe Disconnection & Graceful Shutdown
// ---------------------------------------------------------------------------
console.log('\n--- 5. Graceful Disconnection & Lifecycle Management ---');

async function testDisconnection() {
  await manager.disconnect('kewat');
  assertTest(
    (kewatClient1 as any)._disconnected === true,
    'disconnect("kewat") invokes $disconnect() on target client'
  );

  // Getting kewat again re-instantiates after disconnect
  const kewatClient3 = manager.getClient('kewat');
  assertTest(
    kewatClient3 !== kewatClient1,
    'Re-instantiates fresh client after target tenant disconnect'
  );

  // Disconnect all
  await manager.disconnectAll();
  assertTest(
    (guptaClient as any)._disconnected === true,
    'disconnectAll() invokes $disconnect() on Gupta client'
  );
  assertTest(
    (kewatClient3 as any)._disconnected === true,
    'disconnectAll() invokes $disconnect() on Kewat client'
  );
}

testDisconnection().then(() => {
  console.log('\n================================================================');
  console.log(
    `   Phase 15B.1 Tenant Database Manager Tests: ${passedTests} Passed, ${failedTests} Failed   `
  );
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
});
