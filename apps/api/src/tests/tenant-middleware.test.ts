import assert from 'node:assert';
import {
  resolveTenantContext,
  requireTenantContext,
  TenantRequest,
} from '../middleware/tenant.middleware';
import { tenantDbManager, prisma } from '@apnasamaj/database';

console.log('================================================================');
console.log('   Apna Samaj — Phase 15B.2 Tenant Middleware Tests            ');
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

// Set up mock community registrations in tenantDbManager for isolated test run
tenantDbManager.clearRegistry();

tenantDbManager.registerCommunity({
  slug: 'kewat',
  name: 'Kewat Samaj',
  databaseUrl: 'postgresql://postgres:pass@kewat-pooler.supabase.co:6543/postgres',
  connectionLimit: 5,
});

tenantDbManager.registerCommunity({
  slug: 'gupta',
  name: 'Gupta Samaj',
  databaseUrl: 'postgresql://postgres:pass@gupta-pooler.supabase.co:6543/postgres',
  connectionLimit: 5,
});

// Helper to simulate mock express request / response lifecycle
interface MockResponse {
  statusCode: number;
  body: any;
  status: (code: number) => MockResponse;
  json: (data: any) => MockResponse;
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// 1. Valid Community Hostname & Header Resolution
// ---------------------------------------------------------------------------
console.log('--- 1. Valid Community Hostname & Context Resolution ---');

// Case A: Hostname resolution (kewat.samaz.in)
const req1 = {
  hostname: 'kewat.samaz.in',
  headers: { host: 'kewat.samaz.in' },
  query: {},
} as unknown as TenantRequest;
const res1 = createMockResponse();
let nextCalled1 = false;

resolveTenantContext(req1, res1 as any, () => {
  nextCalled1 = true;
});

assertTest(nextCalled1, 'next() invoked for valid Kewat hostname');
assertTest(req1.tenant?.slug === 'kewat', 'req.tenant.slug is "kewat"');
assertTest(req1.tenant?.isResolved === true, 'req.tenant.isResolved is true');
assertTest(req1.tenant?.source === 'hostname', 'req.tenant.source is "hostname"');
assertTest(req1.db !== undefined, 'req.db attached for Kewat');

// Case B: Origin header resolution (gupta.samaz.in)
const req2 = {
  hostname: 'api.samaz.in',
  headers: {
    host: 'api.samaz.in',
    origin: 'https://gupta.samaz.in',
  },
  query: {},
} as unknown as TenantRequest;
const res2 = createMockResponse();
let nextCalled2 = false;

resolveTenantContext(req2, res2 as any, () => {
  nextCalled2 = true;
});

assertTest(nextCalled2, 'next() invoked for valid Gupta Origin header');
assertTest(req2.tenant?.slug === 'gupta', 'req.tenant.slug is "gupta"');
assertTest(req2.tenant?.source === 'origin', 'req.tenant.source is "origin"');
assertTest(req2.db !== undefined, 'req.db attached for Gupta');

// Case C: Explicit X-Community-Slug header
const req3 = {
  hostname: 'api.samaz.in',
  headers: {
    host: 'api.samaz.in',
    'x-community-slug': 'kewat',
  },
  query: {},
} as unknown as TenantRequest;
const res3 = createMockResponse();
let nextCalled3 = false;

resolveTenantContext(req3, res3 as any, () => {
  nextCalled3 = true;
});

assertTest(nextCalled3, 'next() invoked for explicit X-Community-Slug header');
assertTest(req3.tenant?.slug === 'kewat', 'req.tenant.slug is "kewat"');
assertTest(req3.tenant?.source === 'header', 'req.tenant.source is "header"');

// ---------------------------------------------------------------------------
// 2. Strict Rejection of Unknown Hosts (Zero Silent Fallback)
// ---------------------------------------------------------------------------
console.log('\n--- 2. Unknown Hostname Rejection (No Silent Fallback) ---');

// Case A: Unknown community subdomain
const reqUnknownHost = {
  hostname: 'unknown.samaz.in',
  headers: { host: 'unknown.samaz.in' },
  query: {},
} as unknown as TenantRequest;
const resUnknownHost = createMockResponse();
let nextUnknownHost = false;

resolveTenantContext(reqUnknownHost, resUnknownHost as any, () => {
  nextUnknownHost = true;
});

assertTest(!nextUnknownHost, 'next() is NOT invoked for unknown community host');
assertTest(resUnknownHost.statusCode === 404, 'Returns HTTP 404 for unknown community host');
assertTest(
  resUnknownHost.body?.error?.includes('Unknown community tenant "unknown"'),
  'Returns clear 404 error explaining community is not registered'
);
assertTest(
  reqUnknownHost.tenant === undefined,
  'req.tenant is NOT silently populated with Kewat or any other community'
);

// Case B: Unregistered community header
const reqUnknownHeader = {
  hostname: 'api.samaz.in',
  headers: {
    host: 'api.samaz.in',
    'x-community-slug': 'nonexistent-samaj',
  },
  query: {},
} as unknown as TenantRequest;
const resUnknownHeader = createMockResponse();
let nextUnknownHeader = false;

resolveTenantContext(reqUnknownHeader, resUnknownHeader as any, () => {
  nextUnknownHeader = true;
});

assertTest(!nextUnknownHeader, 'next() is NOT invoked for unregistered community header');
assertTest(resUnknownHeader.statusCode === 404, 'Returns HTTP 404 for unregistered community header');

// ---------------------------------------------------------------------------
// 3. Central & Reserved Domains (Apex, Admin, API)
// ---------------------------------------------------------------------------
console.log('\n--- 3. Central System Domains & Legacy Compatibility ---');

// Case A: Apex domain (samaz.in)
const reqApex = {
  hostname: 'samaz.in',
  headers: { host: 'samaz.in' },
  query: {},
} as unknown as TenantRequest;
const resApex = createMockResponse();
let nextApex = false;

resolveTenantContext(reqApex, resApex as any, () => {
  nextApex = true;
});

assertTest(nextApex, 'next() is invoked for apex domain (samaz.in)');
assertTest(reqApex.tenant === undefined, 'req.tenant is undefined for apex portal');
assertTest(reqApex.db === prisma, 'req.db falls back to legacy prisma singleton on apex');

// Case B: Admin domain (admin.samaz.in) without tenant header
const reqAdmin = {
  hostname: 'admin.samaz.in',
  headers: { host: 'admin.samaz.in' },
  query: {},
} as unknown as TenantRequest;
const resAdmin = createMockResponse();
let nextAdmin = false;

resolveTenantContext(reqAdmin, resAdmin as any, () => {
  nextAdmin = true;
});

assertTest(nextAdmin, 'next() is invoked for admin domain (admin.samaz.in)');
assertTest(reqAdmin.tenant === undefined, 'req.tenant is undefined for central admin');
assertTest(reqAdmin.db === prisma, 'req.db falls back to legacy prisma singleton on admin');

// Case C: Shared API domain (api.samaz.in) without tenant context (e.g. /health)
const reqApi = {
  hostname: 'api.samaz.in',
  headers: { host: 'api.samaz.in' },
  query: {},
} as unknown as TenantRequest;
const resApi = createMockResponse();
let nextApi = false;

resolveTenantContext(reqApi, resApi as any, () => {
  nextApi = true;
});

assertTest(nextApi, 'next() is invoked for central API domain without tenant info');
assertTest(reqApi.tenant === undefined, 'req.tenant is undefined for central /health');
assertTest(reqApi.db === prisma, 'req.db falls back to legacy prisma singleton');

// ---------------------------------------------------------------------------
// 4. Local Development Hostnames
// ---------------------------------------------------------------------------
console.log('\n--- 4. Local Development Environment Support ---');

// Case A: kewat.localhost
const reqLocalDev = {
  hostname: 'kewat.localhost',
  headers: { host: 'kewat.localhost:5173' },
  query: {},
} as unknown as TenantRequest;
const resLocalDev = createMockResponse();
let nextLocalDev = false;

resolveTenantContext(reqLocalDev, resLocalDev as any, () => {
  nextLocalDev = true;
});

assertTest(nextLocalDev, 'next() invoked for kewat.localhost');
assertTest(reqLocalDev.tenant?.slug === 'kewat', 'kewat.localhost resolves to "kewat"');

// Case B: Dev query parameter fallback (?community=gupta)
const reqQueryDev = {
  hostname: 'localhost',
  headers: { host: 'localhost:4000' },
  query: { community: 'gupta' },
} as unknown as TenantRequest;
const resQueryDev = createMockResponse();
let nextQueryDev = false;

resolveTenantContext(reqQueryDev, resQueryDev as any, () => {
  nextQueryDev = true;
});

assertTest(nextQueryDev, 'next() invoked for ?community=gupta query fallback');
assertTest(reqQueryDev.tenant?.slug === 'gupta', 'Resolves to "gupta" from query');
assertTest(reqQueryDev.tenant?.source === 'query', 'Source marked as "query"');

// ---------------------------------------------------------------------------
// 5. Prevention of Arbitrary Database Injection
// ---------------------------------------------------------------------------
console.log('\n--- 5. Security Guard: Prevention of Arbitrary Database Injection ---');

const maliciousReq = {
  hostname: 'api.samaz.in',
  headers: {
    host: 'api.samaz.in',
    'x-community-slug': 'kewat',
    'x-database-url': 'postgresql://attacker:pass@malicious.com:5432/hacked',
    database_url: 'postgresql://attacker:pass@malicious.com:5432/hacked',
  },
  body: {
    databaseUrl: 'postgresql://attacker:pass@malicious.com:5432/hacked',
  },
  query: {
    dbUrl: 'postgresql://attacker:pass@malicious.com:5432/hacked',
  },
} as unknown as TenantRequest;
const maliciousRes = createMockResponse();
let maliciousNext = false;

resolveTenantContext(maliciousReq, maliciousRes as any, () => {
  maliciousNext = true;
});

assertTest(maliciousNext, 'next() invoked using trusted Kewat configuration');
const kewatMeta = tenantDbManager.getSafeMetadata('kewat');
assertTest(
  kewatMeta?.host === 'kewat-pooler.supabase.co',
  'req.db strictly connects to preconfigured Kewat host'
);
assertTest(
  kewatMeta?.host !== 'malicious.com',
  'Arbitrary connection strings injected via headers/body/query are completely ignored'
);

// ---------------------------------------------------------------------------
// 6. requireTenantContext Strict Guard
// ---------------------------------------------------------------------------
console.log('\n--- 6. requireTenantContext Guard Middleware ---');

// Case A: Missing tenant context
const reqNoContext = { tenant: undefined } as unknown as TenantRequest;
const resNoContext = createMockResponse();
let nextNoContext = false;

requireTenantContext(reqNoContext, resNoContext as any, () => {
  nextNoContext = true;
});

assertTest(!nextNoContext, 'requireTenantContext blocks request with missing tenant');
assertTest(resNoContext.statusCode === 400, 'Returns HTTP 400 when tenant is missing');
assertTest(
  resNoContext.body?.error?.includes('Community context required'),
  'Returns clear 400 error message'
);

// Case B: Valid tenant context present
const reqWithContext = {
  tenant: { slug: 'kewat', name: 'Kewat Samaj', isResolved: true, source: 'hostname' },
} as unknown as TenantRequest;
const resWithContext = createMockResponse();
let nextWithContext = false;

requireTenantContext(reqWithContext, resWithContext as any, () => {
  nextWithContext = true;
});

assertTest(nextWithContext, 'requireTenantContext permits request with valid tenant');

console.log('\n================================================================');
console.log(`   Phase 15B.2 Tenant Middleware Tests: ${passedTests} Passed, ${failedTests} Failed   `);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
