import assert from 'node:assert';
import {
  communitySlugSchema,
  extractCommunitySubdomain,
  createCommunitySchema,
  RESERVED_SUBDOMAINS,
} from '@apnasamaj/validation';
import {
  TenantContext,
  CommunityMemberRole,
  CommunityMembershipStatus,
} from '@apnasamaj/shared-types';

console.log('================================================================');
console.log('   Apna Samaj — Phase 15A Multi-Community Foundation Tests      ');
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
// 1. Community Slug Validation Tests
// ---------------------------------------------------------------------------
console.log('--- 1. Community Slug & Reserved Subdomain Validation ---');

const validSlugs = ['kewat', 'gupta', 'agrawal', 'patel-samaj', 'kewat-delhi-ncr'];
for (const slug of validSlugs) {
  const result = communitySlugSchema.safeParse(slug);
  assertTest(result.success, `Valid slug accepted: "${slug}"`);
}

const invalidSlugs = [
  'k', // too short (< 2 chars)
  'kewat_samaj', // underscore not allowed
  'kewat--samaj', // consecutive hyphens not allowed
  '-kewat', // leading hyphen
  'kewat@samaj', // special character not allowed
  'this-is-a-community-slug-that-exceeds-the-maximum-allowed-length-limit-of-thirty', // > 30 chars
];
for (const slug of invalidSlugs) {
  const result = communitySlugSchema.safeParse(slug);
  assertTest(!result.success, `Invalid slug rejected: "${slug}"`);
}

// Test auto-normalization
assertTest(
  communitySlugSchema.parse('  Kewat  ') === 'kewat',
  'Auto-normalizes and trims "  Kewat  " to "kewat"'
);

// Verify reserved subdomains cannot be registered as community slugs
for (const reserved of RESERVED_SUBDOMAINS) {
  const result = communitySlugSchema.safeParse(reserved);
  assertTest(!result.success, `Reserved subdomain blocked from slug creation: "${reserved}"`);
}

// ---------------------------------------------------------------------------
// 2. Subdomain Extraction from Hostnames
// ---------------------------------------------------------------------------
console.log('\n--- 2. Hostname Community Subdomain Extraction ---');

assertTest(
  extractCommunitySubdomain('kewat.samaz.in') === 'kewat',
  'Extracts "kewat" from "kewat.samaz.in"'
);

assertTest(
  extractCommunitySubdomain('gupta.samaz.in') === 'gupta',
  'Extracts "gupta" from "gupta.samaz.in"'
);

assertTest(
  extractCommunitySubdomain('kewat.samaz.in:5173') === 'kewat',
  'Extracts "kewat" from "kewat.samaz.in:5173" (port stripped)'
);

assertTest(
  extractCommunitySubdomain('samaz.in') === null,
  'Apex domain "samaz.in" returns null (portal)'
);

assertTest(
  extractCommunitySubdomain('www.samaz.in') === null,
  'Apex www "www.samaz.in" returns null (portal)'
);

assertTest(
  extractCommunitySubdomain('admin.samaz.in') === null,
  'Reserved admin subdomain "admin.samaz.in" returns null'
);

assertTest(
  extractCommunitySubdomain('api.samaz.in') === null,
  'Reserved API subdomain "api.samaz.in" returns null'
);

assertTest(
  extractCommunitySubdomain('kewat.localhost') === 'kewat',
  'Local development "kewat.localhost" resolves to "kewat"'
);

assertTest(
  extractCommunitySubdomain('admin.localhost') === null,
  'Local development reserved "admin.localhost" returns null'
);

// ---------------------------------------------------------------------------
// 3. Community Creation Schema Validation
// ---------------------------------------------------------------------------
console.log('\n--- 3. Create Community Schema Validation ---');

const validKewatInput = {
  name: 'Kewat Samaj',
  slug: 'kewat',
  description: 'Official community portal for Kewat Samaj members.',
  primaryColor: '#E65100',
};
const parsedKewat = createCommunitySchema.safeParse(validKewatInput);
assertTest(parsedKewat.success, 'Valid Kewat community creation payload passes validation');

const validGuptaInput = {
  name: 'Gupta Samaj',
  slug: 'gupta',
  description: 'Official community portal for Gupta Samaj members.',
  primaryColor: '#1976D2',
};
const parsedGupta = createCommunitySchema.safeParse(validGuptaInput);
assertTest(parsedGupta.success, 'Valid Gupta community creation payload passes validation');

const invalidColorInput = {
  name: 'Test Samaj',
  slug: 'test-samaj',
  primaryColor: 'red', // not hex format
};
assertTest(
  !createCommunitySchema.safeParse(invalidColorInput).success,
  'Rejects non-hex primary color'
);

// ---------------------------------------------------------------------------
// 4. Server-Side Tenant Context Resolution Simulation
// ---------------------------------------------------------------------------
console.log('\n--- 4. Server-Side Tenant Authorization Invariants ---');

interface MockDbCommunity {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
}

interface MockDbMembership {
  communityId: string;
  userId: string;
  role: CommunityMemberRole;
  status: CommunityMembershipStatus;
}

const mockCommunities: MockDbCommunity[] = [
  { id: 'comm-kewat-uuid', slug: 'kewat', name: 'Kewat Samaj', isActive: true },
  { id: 'comm-gupta-uuid', slug: 'gupta', name: 'Gupta Samaj', isActive: true },
];

const mockMemberships: MockDbMembership[] = [
  {
    communityId: 'comm-kewat-uuid',
    userId: 'user-kewat-member',
    role: 'MEMBER',
    status: 'APPROVED',
  },
  {
    communityId: 'comm-kewat-uuid',
    userId: 'user-kewat-admin',
    role: 'COMMUNITY_ADMIN',
    status: 'APPROVED',
  },
  {
    communityId: 'comm-gupta-uuid',
    userId: 'user-gupta-member',
    role: 'MEMBER',
    status: 'APPROVED',
  },
];

/**
 * Simulates server-side tenant context resolver.
 * Enforces:
 * 1. Community must exist and be active.
 * 2. Caller must have an APPROVED membership in the resolved community (unless SUPER_ADMIN).
 * 3. Never trust client-supplied ID without verifying against server membership records.
 */
function resolveServerTenantContext(params: {
  hostname: string;
  userId: string;
  isSuperAdmin?: boolean;
}): { context: TenantContext | null; error?: string; statusCode?: number } {
  const slug = extractCommunitySubdomain(params.hostname);
  if (!slug) {
    return { context: null, error: 'No community specified or apex domain', statusCode: 400 };
  }

  const community = mockCommunities.find((c) => c.slug === slug);
  if (!community || !community.isActive) {
    return { context: null, error: 'Community not found or inactive', statusCode: 404 };
  }

  if (params.isSuperAdmin) {
    return {
      context: {
        communityId: community.id,
        communitySlug: community.slug,
        communityName: community.name,
        isSuperAdmin: true,
      },
    };
  }

  const membership = mockMemberships.find(
    (m) => m.communityId === community.id && m.userId === params.userId
  );

  if (!membership || membership.status !== 'APPROVED') {
    return {
      context: null,
      error: 'Forbidden: You are not an approved member of this community',
      statusCode: 403,
    };
  }

  return {
    context: {
      communityId: community.id,
      communitySlug: community.slug,
      communityName: community.name,
      memberRole: membership.role,
      membershipStatus: membership.status,
      isSuperAdmin: false,
    },
  };
}

// Test: Kewat member accessing Kewat community
const kewatAccess = resolveServerTenantContext({
  hostname: 'kewat.samaz.in',
  userId: 'user-kewat-member',
});
assertTest(
  kewatAccess.context?.communitySlug === 'kewat' && kewatAccess.context?.memberRole === 'MEMBER',
  'Approved Kewat member resolves valid tenant context on kewat.samaz.in'
);

// Test: Kewat member attempting to access Gupta community
const crossAccess = resolveServerTenantContext({
  hostname: 'gupta.samaz.in',
  userId: 'user-kewat-member',
});
assertTest(
  crossAccess.context === null && crossAccess.statusCode === 403,
  'Kewat member denied access (403) on gupta.samaz.in'
);

// Test: Gupta member attempting to access Kewat community
const reverseCrossAccess = resolveServerTenantContext({
  hostname: 'kewat.samaz.in',
  userId: 'user-gupta-member',
});
assertTest(
  reverseCrossAccess.context === null && reverseCrossAccess.statusCode === 403,
  'Gupta member denied access (403) on kewat.samaz.in'
);

// Test: Platform SUPER_ADMIN accessing any community
const superAdminAccessKewat = resolveServerTenantContext({
  hostname: 'kewat.samaz.in',
  userId: 'user-super-admin',
  isSuperAdmin: true,
});
assertTest(
  superAdminAccessKewat.context?.isSuperAdmin === true &&
    superAdminAccessKewat.context?.communitySlug === 'kewat',
  'SUPER_ADMIN resolves valid tenant context for administration on kewat.samaz.in'
);

const superAdminAccessGupta = resolveServerTenantContext({
  hostname: 'gupta.samaz.in',
  userId: 'user-super-admin',
  isSuperAdmin: true,
});
assertTest(
  superAdminAccessGupta.context?.isSuperAdmin === true &&
    superAdminAccessGupta.context?.communitySlug === 'gupta',
  'SUPER_ADMIN resolves valid tenant context for administration on gupta.samaz.in'
);

// Test: Unregistered user / unknown community
const unknownCommunity = resolveServerTenantContext({
  hostname: 'unknown.samaz.in',
  userId: 'user-kewat-member',
});
assertTest(
  unknownCommunity.context === null && unknownCommunity.statusCode === 404,
  'Unknown community hostname returns 404 Not Found'
);

// ---------------------------------------------------------------------------
// 5. Query Filter Scoping Invariant Simulation
// ---------------------------------------------------------------------------
console.log('\n--- 5. Tenant Query Filter Scoping Simulation ---');

interface MockDbPost {
  id: string;
  communityId: string;
  authorId: string;
  content: string;
}

const mockPosts: MockDbPost[] = [
  { id: 'post-1', communityId: 'comm-kewat-uuid', authorId: 'user-kewat-member', content: 'Kewat Post 1' },
  { id: 'post-2', communityId: 'comm-kewat-uuid', authorId: 'user-kewat-admin', content: 'Kewat Post 2' },
  { id: 'post-3', communityId: 'comm-gupta-uuid', authorId: 'user-gupta-member', content: 'Gupta Post 1' },
];

function queryFeedWithTenantScoping(context: TenantContext): MockDbPost[] {
  // Invariant: Query MUST include where: { communityId: context.communityId }
  return mockPosts.filter((p) => p.communityId === context.communityId);
}

const kewatFeed = queryFeedWithTenantScoping(kewatAccess.context!);
assertTest(
  kewatFeed.length === 2 && kewatFeed.every((p) => p.communityId === 'comm-kewat-uuid'),
  'Kewat feed query strictly returns only Kewat community posts (2 posts)'
);
assertTest(
  !kewatFeed.some((p) => p.communityId === 'comm-gupta-uuid'),
  'Zero Gupta posts leaked into Kewat feed'
);

const guptaAccess = resolveServerTenantContext({
  hostname: 'gupta.samaz.in',
  userId: 'user-gupta-member',
});
const guptaFeed = queryFeedWithTenantScoping(guptaAccess.context!);
assertTest(
  guptaFeed.length === 1 && guptaFeed[0].communityId === 'comm-gupta-uuid',
  'Gupta feed query strictly returns only Gupta community posts (1 post)'
);

console.log('\n================================================================');
console.log(`   Phase 15A Multi-Community Tests: ${passedTests} Passed, ${failedTests} Failed   `);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
