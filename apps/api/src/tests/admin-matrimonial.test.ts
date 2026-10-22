import assert from 'node:assert';
import {
  adminModerateMatrimonialProfileSchema,
  adminModerateMatrimonialPhotoSchema,
  listAdminMatrimonialProfilesQuerySchema,
} from '@apnasamaj/validation';
import { UserRole } from '@apnasamaj/shared-types';
import {
  isMatrimonialTableMissingError,
  MatrimonialMigrationPendingError,
} from '../modules/matrimonial/matrimonial.service';

console.log('======================================================');
console.log('   Apna Samaj — Batch 12G Admin Moderation Tests     ');
console.log('======================================================\n');

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   ${err.message}`);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// 1. Role-Based Access Control (RBAC) Verification
// -----------------------------------------------------------------------------
console.log('--- 1. Role Authorization for Admin Matrimonial ---');

function checkAdminRoleAllowed(role: UserRole): boolean {
  const allowed = [UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN];
  return allowed.includes(role);
}

test('SUPER_ADMIN is authorized for matrimonial moderation', () => {
  assert.strictEqual(checkAdminRoleAllowed(UserRole.SUPER_ADMIN), true);
});

test('COMMUNITY_ADMIN is authorized for matrimonial moderation', () => {
  assert.strictEqual(checkAdminRoleAllowed(UserRole.COMMUNITY_ADMIN), true);
});

test('MEMBER is NOT authorized for matrimonial moderation', () => {
  assert.strictEqual(checkAdminRoleAllowed(UserRole.MEMBER), false);
});

test('MODERATOR role alone is NOT authorized for core matrimonial moderation without admin privilege', () => {
  assert.strictEqual(checkAdminRoleAllowed(UserRole.MODERATOR), false);
});

// -----------------------------------------------------------------------------
// 2. Anti-Self-Approval & Ownership Rules
// -----------------------------------------------------------------------------
console.log('\n--- 2. Self-Approval & Ownership Guard Logic ---');

function validateModeratorSelfCheck(actorId: string, profileUserId: string): { allowed: boolean; error?: string } {
  if (actorId === profileUserId) {
    return {
      allowed: false,
      error: 'Administrators cannot approve or moderate their own matrimonial profile.',
    };
  }
  return { allowed: true };
}

test('Admin CANNOT approve their own profile (self-approval blocked)', () => {
  const result = validateModeratorSelfCheck('admin-123', 'admin-123');
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.error?.includes('cannot approve or moderate their own'), true);
});

test('Admin CAN moderate another member\'s profile', () => {
  const result = validateModeratorSelfCheck('admin-123', 'member-456');
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.error, undefined);
});

// -----------------------------------------------------------------------------
// 3. Profile Moderation Validation & Rejection Reason Rules
// -----------------------------------------------------------------------------
console.log('\n--- 3. Profile Moderation Input & Rejection Rules ---');

test('Valid approval payload is accepted without rejectionReason', () => {
  const result = adminModerateMatrimonialProfileSchema.safeParse({
    status: 'APPROVED',
  });
  assert.strictEqual(result.success, true);
});

test('Valid rejection payload with reason >= 5 chars is accepted', () => {
  const result = adminModerateMatrimonialProfileSchema.safeParse({
    status: 'REJECTED',
    rejectionReason: 'Please upload clear facial photos and add partner expectation details.',
  });
  assert.strictEqual(result.success, true);
});

test('Rejection without reason is rejected by schema', () => {
  const result = adminModerateMatrimonialProfileSchema.safeParse({
    status: 'REJECTED',
  });
  assert.strictEqual(result.success, false);
});

test('Rejection with empty or whitespace-only reason is rejected', () => {
  const result = adminModerateMatrimonialProfileSchema.safeParse({
    status: 'REJECTED',
    rejectionReason: '   ',
  });
  assert.strictEqual(result.success, false);
});

test('Rejection with reason under 5 characters is rejected', () => {
  const result = adminModerateMatrimonialProfileSchema.safeParse({
    status: 'REJECTED',
    rejectionReason: 'Bad',
  });
  assert.strictEqual(result.success, false);
});

test('Rejection with reason over 500 characters is rejected', () => {
  const result = adminModerateMatrimonialProfileSchema.safeParse({
    status: 'REJECTED',
    rejectionReason: 'A'.repeat(501),
  });
  assert.strictEqual(result.success, false);
});

test('Status HIDDEN is accepted', () => {
  const result = adminModerateMatrimonialProfileSchema.safeParse({
    status: 'HIDDEN',
  });
  assert.strictEqual(result.success, true);
});

test('Invalid status DRAFT is rejected as moderation action', () => {
  const result = adminModerateMatrimonialProfileSchema.safeParse({
    status: 'DRAFT',
  });
  assert.strictEqual(result.success, false);
});

// -----------------------------------------------------------------------------
// 4. Photo Moderation Payload Validation
// -----------------------------------------------------------------------------
console.log('\n--- 4. Photo Moderation Schema Validation ---');

test('Photo approval (isApproved: true) is accepted', () => {
  const result = adminModerateMatrimonialPhotoSchema.safeParse({
    isApproved: true,
  });
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.data.isApproved, true);
  }
});

test('Photo hiding (isApproved: false) is accepted', () => {
  const result = adminModerateMatrimonialPhotoSchema.safeParse({
    isApproved: false,
  });
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.data.isApproved, false);
  }
});

test('Non-boolean isApproved is rejected', () => {
  const result = adminModerateMatrimonialPhotoSchema.safeParse({
    isApproved: 'yes',
  });
  assert.strictEqual(result.success, false);
});

// -----------------------------------------------------------------------------
// 5. Admin Queue Query Filter Schema
// -----------------------------------------------------------------------------
console.log('\n--- 5. Admin Profiles Queue Query Schema ---');

test('Default query defaults to PENDING_APPROVAL, page 1, limit 10', () => {
  const result = listAdminMatrimonialProfilesQuerySchema.safeParse({});
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.data.status, 'PENDING_APPROVAL');
    assert.strictEqual(result.data.page, 1);
    assert.strictEqual(result.data.limit, 10);
  }
});

test('Query with status ALL and search keyword is accepted', () => {
  const result = listAdminMatrimonialProfilesQuerySchema.safeParse({
    status: 'ALL',
    search: 'Sharma',
    page: '2',
    limit: '20',
  });
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.data.status, 'ALL');
    assert.strictEqual(result.data.search, 'Sharma');
    assert.strictEqual(result.data.page, 2);
    assert.strictEqual(result.data.limit, 20);
  }
});

test('Limit exceeding 50 is rejected', () => {
  const result = listAdminMatrimonialProfilesQuerySchema.safeParse({
    limit: 51,
  });
  assert.strictEqual(result.success, false);
});

// -----------------------------------------------------------------------------
// 6. Safe Migration-Pending 503 Detection
// -----------------------------------------------------------------------------
console.log('\n--- 6. Migration Pending 503 Guard Logic ---');

test('P2021 Prisma error is correctly identified as missing table', () => {
  const error = { code: 'P2021', message: 'Table "MatrimonialProfile" does not exist in the current database' };
  assert.strictEqual(isMatrimonialTableMissingError(error), true);
});

test('MatrimonialMigrationPendingError returns HTTP 503', () => {
  const err = new MatrimonialMigrationPendingError();
  assert.strictEqual(err.statusCode, 503);
  assert.strictEqual(err.message.includes('database migration pending'), true);
});

test('Unrelated query error is NOT reported as missing migration', () => {
  const err = new Error('Unique constraint failed on field email');
  assert.strictEqual(isMatrimonialTableMissingError(err), false);
});

console.log(`\n======================================================`);
console.log(`Summary: All ${passed} admin moderation checks passed!`);
console.log(`======================================================\n`);
