import assert from 'node:assert';
import {
  resolveTenantContext,
  requireTenantContext,
  authorizeAdminCommunitySwitch,
  TenantRequest,
} from '../middleware/tenant.middleware';
import { AuthenticatedRequest } from '../middleware/authenticate';
import { isCorsOriginAllowed, APPROVED_APNA_SAMAJ_ORIGINS } from '../config/cors';
import { tenantDbManager, prisma } from '@apnasamaj/database';
import { UserRole, UserStatus } from '@apnasamaj/shared-types';

console.log('================================================================');
console.log('   Apna Samaj — Phase 15C.1 Tenant Security Hardening Tests    ');
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

// Set up mock community registrations in tenantDbManager
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

// Mock response creator
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
// 1. Cross-Community Header / Origin Mismatch Rejection (HTTP 400)
// ---------------------------------------------------------------------------
console.log('--- 1. Cross-Community Header / Origin Mismatch Rejection ---');

// Case 1A: Origin is Gupta, Header is Kewat (Direct Mismatch)
const reqGuptaWithKewatHeader = {
  hostname: 'api.samaz.in',
  headers: {
    host: 'api.samaz.in',
    origin: 'https://gupta.samaz.in',
    'x-community-slug': 'kewat',
  },
  query: {},
} as unknown as TenantRequest;
const res1A = createMockResponse();
let next1A = false;

resolveTenantContext(reqGuptaWithKewatHeader, res1A as any, () => {
  next1A = true;
});

assertTest(!next1A, 'next() is NOT invoked when Header conflicts with Origin');
assertTest(res1A.statusCode === 400, 'Returns HTTP 400 Bad Request for Gupta Origin + Kewat Header');
assertTest(
  res1A.body?.error?.includes('Tenant mismatch detected') &&
    res1A.body?.error?.includes('client header "kewat" conflicts with verified request origin "gupta"'),
  'Returns clear descriptive error detailing the conflict'
);
assertTest(reqGuptaWithKewatHeader.tenant === undefined, 'req.tenant is NOT attached');
assertTest(reqGuptaWithKewatHeader.db !== tenantDbManager.getClient('kewat'), 'Does NOT attach Kewat DB');

// Case 1B: Origin is Kewat, Header is Gupta (Direct Mismatch)
const reqKewatWithGuptaHeader = {
  hostname: 'api.samaz.in',
  headers: {
    host: 'api.samaz.in',
    origin: 'https://kewat.samaz.in',
    'x-community-slug': 'gupta',
  },
  query: {},
} as unknown as TenantRequest;
const res1B = createMockResponse();
let next1B = false;

resolveTenantContext(reqKewatWithGuptaHeader, res1B as any, () => {
  next1B = true;
});

assertTest(!next1B, 'next() is NOT invoked for Kewat Origin + Gupta Header');
assertTest(res1B.statusCode === 400, 'Returns HTTP 400 Bad Request for Kewat Origin + Gupta Header');
assertTest(
  res1B.body?.error?.includes('client header "gupta" conflicts with verified request origin "kewat"'),
  'Identifies Kewat origin vs Gupta header conflict'
);

// Case 1C: Matching Origin and Header (Gupta Origin + Gupta Header)
const reqMatchingGupta = {
  hostname: 'api.samaz.in',
  headers: {
    host: 'api.samaz.in',
    origin: 'https://gupta.samaz.in',
    'x-community-slug': 'gupta',
  },
  query: {},
} as unknown as TenantRequest;
const res1C = createMockResponse();
let next1C = false;

resolveTenantContext(reqMatchingGupta, res1C as any, () => {
  next1C = true;
});

assertTest(next1C, 'next() is invoked when Header matches Origin');
assertTest(reqMatchingGupta.tenant?.slug === 'gupta', 'Resolves to Gupta database');
assertTest(reqMatchingGupta.tenant?.isResolved === true, 'req.tenant is marked resolved');

// ---------------------------------------------------------------------------
// 2. Cross-Community Header / Hostname Mismatch Rejection
// ---------------------------------------------------------------------------
console.log('\n--- 2. Cross-Community Header / Hostname Mismatch Rejection ---');

// Case 2A: Hostname is kewat.samaz.in, Header is gupta
const reqKewatHostGuptaHeader = {
  hostname: 'kewat.samaz.in',
  headers: {
    host: 'kewat.samaz.in',
    'x-community-slug': 'gupta',
  },
  query: {},
} as unknown as TenantRequest;
const res2A = createMockResponse();
let next2A = false;

resolveTenantContext(reqKewatHostGuptaHeader, res2A as any, () => {
  next2A = true;
});

assertTest(!next2A, 'next() is NOT invoked when Header conflicts with Hostname');
assertTest(res2A.statusCode === 400, 'Returns HTTP 400 for Kewat Hostname + Gupta Header');
assertTest(
  res2A.body?.error?.includes('client header "gupta" conflicts with verified request hostname "kewat"'),
  'Identifies Kewat hostname vs Gupta header conflict'
);

// Case 2B: Hostname is kewat.localhost (dev), Header is gupta
const reqLocalDevConflict = {
  hostname: 'kewat.localhost',
  headers: {
    host: 'kewat.localhost:5173',
    'x-community-slug': 'gupta',
  },
  query: {},
} as unknown as TenantRequest;
const res2B = createMockResponse();
let next2B = false;

resolveTenantContext(reqLocalDevConflict, res2B as any, () => {
  next2B = true;
});

assertTest(!next2B, 'next() is NOT invoked for localhost dev subdomain conflict');
assertTest(res2B.statusCode === 400, 'Returns HTTP 400 for kewat.localhost + gupta header');

// Case 2C: Conflicting Hostname and Origin (Origin: Gupta, Hostname: Kewat)
const reqOriginHostConflict = {
  hostname: 'kewat.samaz.in',
  headers: {
    host: 'kewat.samaz.in',
    origin: 'https://gupta.samaz.in',
  },
  query: {},
} as unknown as TenantRequest;
const res2C = createMockResponse();
let next2C = false;

resolveTenantContext(reqOriginHostConflict, res2C as any, () => {
  next2C = true;
});

assertTest(!next2C, 'next() is NOT invoked when Hostname and Origin disagree');
assertTest(res2C.statusCode === 400, 'Returns HTTP 400 for Hostname vs Origin conflict');
assertTest(
  res2C.body?.error?.includes('request hostname "kewat" conflicts with request origin "gupta"'),
  'Identifies Hostname vs Origin conflict'
);

// ---------------------------------------------------------------------------
// 3. Central Admin Domain Security Guard (No Unauthenticated Header Override)
// ---------------------------------------------------------------------------
console.log('\n--- 3. Central Admin Domain Guard (Header Alone Cannot Switch DB) ---');

// Case 3A: Origin is admin.samaz.in with X-Community-Slug: kewat in resolveTenantContext
const reqAdminWithHeader = {
  hostname: 'api.samaz.in',
  headers: {
    host: 'api.samaz.in',
    origin: 'https://admin.samaz.in',
    'x-community-slug': 'kewat',
  },
  query: {},
} as unknown as TenantRequest;
const res3A = createMockResponse();
let next3A = false;

resolveTenantContext(reqAdminWithHeader, res3A as any, () => {
  next3A = true;
});

assertTest(next3A, 'next() is called through to admin pipeline');
assertTest(
  reqAdminWithHeader.tenant === undefined,
  'req.tenant is NOT populated from header alone on central admin origin'
);
assertTest(
  reqAdminWithHeader.db === prisma,
  'req.db remains legacy central prisma singleton until SUPER_ADMIN authorization'
);

// Case 3B: Origin is apna-samaj-admin.vercel.app with X-Community-Slug: gupta
const reqVercelAdmin = {
  hostname: 'api.samaz.in',
  headers: {
    host: 'api.samaz.in',
    origin: 'https://apna-samaj-admin.vercel.app',
    'x-community-slug': 'gupta',
  },
  query: {},
} as unknown as TenantRequest;
const res3B = createMockResponse();
let next3B = false;

resolveTenantContext(reqVercelAdmin, res3B as any, () => {
  next3B = true;
});

assertTest(next3B, 'next() invoked');
assertTest(reqVercelAdmin.tenant === undefined, 'req.tenant remains undefined for Vercel admin origin');
assertTest(reqVercelAdmin.db === prisma, 'req.db remains central prisma');

// ---------------------------------------------------------------------------
// 4. Admin Community Switching Authorization (SUPER_ADMIN vs COMMUNITY_ADMIN)
// ---------------------------------------------------------------------------
console.log('\n--- 4. authorizeAdminCommunitySwitch RBAC Boundaries ---');

// Case 4A: Unauthenticated caller attempting community switch
const reqUnauthSwitch = {
  headers: { 'x-community-slug': 'kewat' },
  user: undefined,
} as unknown as AuthenticatedRequest;
const res4A = createMockResponse();
let next4A = false;

authorizeAdminCommunitySwitch(reqUnauthSwitch, res4A as any, () => {
  next4A = true;
});

assertTest(!next4A, 'Unauthenticated user cannot switch community database');
assertTest(res4A.statusCode === 401, 'Returns HTTP 401 Unauthorized');

// Case 4B: COMMUNITY_ADMIN attempting to switch community database
const reqCommAdminSwitch = {
  headers: { 'x-community-slug': 'gupta' },
  user: {
    id: 'comm-admin-1',
    phone: '9876543210',
    fullName: 'Kewat Admin',
    role: UserRole.COMMUNITY_ADMIN,
    status: UserStatus.ACTIVE,
    isPhoneVerified: true,
  },
} as unknown as AuthenticatedRequest;
const res4B = createMockResponse();
let next4B = false;

authorizeAdminCommunitySwitch(reqCommAdminSwitch, res4B as any, () => {
  next4B = true;
});

assertTest(!next4B, 'COMMUNITY_ADMIN cannot switch community database');
assertTest(res4B.statusCode === 403, 'Returns HTTP 403 Forbidden for COMMUNITY_ADMIN');
assertTest(
  res4B.body?.error?.includes('Only SUPER_ADMIN is authorized to switch community context'),
  'Returns clear 403 error explaining SUPER_ADMIN requirement'
);

// Case 4C: Authorized SUPER_ADMIN successfully switching community database to Kewat
const reqSuperAdminSwitch = {
  headers: { 'x-community-slug': 'kewat' },
  user: {
    id: 'super-admin-1',
    phone: '9999999999',
    fullName: 'Platform Super Admin',
    role: UserRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    isPhoneVerified: true,
  },
} as unknown as AuthenticatedRequest;
const res4C = createMockResponse();
let next4C = false;

authorizeAdminCommunitySwitch(reqSuperAdminSwitch, res4C as any, () => {
  next4C = true;
});

assertTest(next4C, 'next() invoked for authorized SUPER_ADMIN switch');
assertTest(reqSuperAdminSwitch.tenant?.slug === 'kewat', 'req.tenant switched to "kewat"');
assertTest(reqSuperAdminSwitch.tenant?.source === 'admin_switch', 'Source marked as "admin_switch"');
assertTest(reqSuperAdminSwitch.db === tenantDbManager.getClient('kewat'), 'req.db attached to Kewat DB');

// Case 4D: SUPER_ADMIN requesting unregistered community
const reqSuperAdminUnknown = {
  headers: { 'x-community-slug': 'unknown-samaj' },
  user: {
    id: 'super-admin-1',
    role: UserRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
  },
} as unknown as AuthenticatedRequest;
const res4D = createMockResponse();
let next4D = false;

authorizeAdminCommunitySwitch(reqSuperAdminUnknown, res4D as any, () => {
  next4D = true;
});

assertTest(!next4D, 'Unknown community switch blocked');
assertTest(res4D.statusCode === 404, 'Returns HTTP 404 for unknown community slug');

// Case 4E: SUPER_ADMIN without X-Community-Slug header retains central DB
const reqSuperAdminNoHeader = {
  headers: {},
  user: {
    id: 'super-admin-1',
    role: UserRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
  },
  db: prisma,
} as unknown as AuthenticatedRequest;
const res4E = createMockResponse();
let next4E = false;

authorizeAdminCommunitySwitch(reqSuperAdminNoHeader, res4E as any, () => {
  next4E = true;
});

assertTest(next4E, 'next() invoked when no switch header is supplied');
assertTest(reqSuperAdminNoHeader.tenant === undefined, 'req.tenant remains undefined');
assertTest(reqSuperAdminNoHeader.db === prisma, 'req.db remains central prisma');

// ---------------------------------------------------------------------------
// 5. Query Parameter Fallback: Dev vs Production Hardening
// ---------------------------------------------------------------------------
console.log('\n--- 5. Query Parameter Fallback: Dev vs Production Hardening ---');

// Case 5A: Development mode allows ?community=gupta
const reqQueryDev = {
  hostname: 'localhost',
  headers: { host: 'localhost:4000' },
  query: { community: 'gupta' },
} as unknown as TenantRequest;
const res5A = createMockResponse();
let next5A = false;

process.env.NODE_ENV = 'development';
resolveTenantContext(reqQueryDev, res5A as any, () => {
  next5A = true;
});

assertTest(next5A, 'Dev mode permits ?community=gupta query fallback');
assertTest(reqQueryDev.tenant?.slug === 'gupta', 'Resolves to Gupta in development');
assertTest(reqQueryDev.tenant?.source === 'query', 'Source marked as query');

// Case 5B: Production mode STRICTLY IGNORES ?community=gupta
const reqQueryProd = {
  hostname: 'samaz.in',
  headers: { host: 'samaz.in' },
  query: { community: 'gupta' },
} as unknown as TenantRequest;
const res5B = createMockResponse();
let next5B = false;

process.env.NODE_ENV = 'production';
resolveTenantContext(reqQueryProd, res5B as any, () => {
  next5B = true;
});

assertTest(next5B, 'Production mode processes request safely');
assertTest(
  reqQueryProd.tenant === undefined,
  'Production mode strictly ignores ?community query parameter (req.tenant is undefined)'
);
assertTest(reqQueryProd.db === prisma, 'Production mode falls back to central prisma');

// Restore NODE_ENV
process.env.NODE_ENV = 'test';

// ---------------------------------------------------------------------------
// 6. Hardened CORS Origin Validation
// ---------------------------------------------------------------------------
console.log('\n--- 6. Hardened CORS Origin Validation ---');

// Approved production origins
assertTest(
  isCorsOriginAllowed('https://apna-samaj.vercel.app', { isProduction: true }),
  'Allows approved production frontend: apna-samaj.vercel.app'
);
assertTest(
  isCorsOriginAllowed('https://apna-samaj-admin.vercel.app', { isProduction: true }),
  'Allows approved production admin: apna-samaj-admin.vercel.app'
);
assertTest(
  isCorsOriginAllowed('https://samaz.in', { isProduction: true }),
  'Allows apex domain: samaz.in'
);
assertTest(
  isCorsOriginAllowed('https://www.samaz.in', { isProduction: true }),
  'Allows www domain: www.samaz.in'
);
assertTest(
  isCorsOriginAllowed('https://kewat.samaz.in', { isProduction: true }),
  'Allows Kewat community subdomain: kewat.samaz.in'
);
assertTest(
  isCorsOriginAllowed('https://gupta.samaz.in', { isProduction: true }),
  'Allows Gupta community subdomain: gupta.samaz.in'
);
assertTest(
  isCorsOriginAllowed('https://admin.samaz.in', { isProduction: true }),
  'Allows Admin subdomain: admin.samaz.in'
);

// Arbitrary *.vercel.app REJECTION in production
assertTest(
  !isCorsOriginAllowed('https://attacker.vercel.app', { isProduction: true }),
  'STRICTLY REJECTS arbitrary attacker Vercel origin: attacker.vercel.app'
);
assertTest(
  !isCorsOriginAllowed('https://evil-phishing.vercel.app', { isProduction: true }),
  'STRICTLY REJECTS arbitrary phishing Vercel origin: evil-phishing.vercel.app'
);
assertTest(
  !isCorsOriginAllowed('https://random-app.vercel.app', { isProduction: true }),
  'STRICTLY REJECTS unapproved Vercel origin: random-app.vercel.app'
);
assertTest(
  !isCorsOriginAllowed('https://evil-site.com', { isProduction: true }),
  'STRICTLY REJECTS arbitrary third-party domain: evil-site.com'
);

// Localhost behavior in dev vs prod
assertTest(
  isCorsOriginAllowed('http://localhost:5173', { isProduction: false }),
  'Allows localhost:5173 in non-production environments'
);
assertTest(
  isCorsOriginAllowed('http://localhost:5174', { isProduction: false }),
  'Allows localhost:5174 in non-production environments'
);
assertTest(
  !isCorsOriginAllowed('http://localhost:5173', { isProduction: true }),
  'Rejects unconfigured localhost in production mode'
);

// No-origin requests (curl, mobile native apps)
assertTest(
  isCorsOriginAllowed(undefined, { isProduction: true }),
  'Allows requests with no origin header (curl, mobile native apps)'
);

console.log('\n================================================================');
console.log(`   Phase 15C.1 Security Hardening Tests: ${passedTests} Passed, ${failedTests} Failed   `);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
