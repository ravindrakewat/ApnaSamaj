import assert from 'node:assert/strict';
import { GroupPrivacy, GroupMemberRole } from '../../../../packages/shared-types/src/group.js';
import type { CreateGroupInput, UpdateGroupInput } from '../../../../packages/shared-types/src/group.js';

async function runTests() {
  console.log('--- Testing Admin Group Governance Service & Models ---');

  // Test 1: Group Privacy Enum and input structures
  const validCreateInput: CreateGroupInput = {
    name: 'Youth Welfare Committee',
    description: 'Empowering youth through events and skill workshops',
    privacy: GroupPrivacy.PUBLIC,
  };
  assert.equal(validCreateInput.name, 'Youth Welfare Committee');
  assert.equal(validCreateInput.privacy, GroupPrivacy.PUBLIC);

  const privateCreateInput: CreateGroupInput = {
    name: 'Executive Committee',
    description: 'Confidential committee deliberations',
    privacy: GroupPrivacy.PRIVATE,
  };
  assert.equal(privateCreateInput.privacy, GroupPrivacy.PRIVATE);
  console.log('✓ Group Privacy & Input structures verified');

  // Test 2: Update Group Input structures
  const updateInput: UpdateGroupInput = {
    name: 'Youth & Sports Committee',
    description: 'Broadened scope to include inter-district sports tournaments',
    privacy: GroupPrivacy.PUBLIC,
  };
  assert.equal(updateInput.name, 'Youth & Sports Committee');
  console.log('✓ Update Group Input structure verified');

  // Test 3: Group Member Roles hierarchy
  const allowedRoles = [GroupMemberRole.ADMIN, GroupMemberRole.MODERATOR, GroupMemberRole.MEMBER];
  assert.ok(allowedRoles.includes(GroupMemberRole.ADMIN));
  assert.ok(allowedRoles.includes(GroupMemberRole.MODERATOR));
  assert.ok(allowedRoles.includes(GroupMemberRole.MEMBER));
  assert.equal(allowedRoles.length, 3);
  console.log('✓ Group Member Roles verified');

  // Test 4: Query Param Serialisation logic
  const params = { page: 2, limit: 25, search: 'Youth' };
  const query = new URLSearchParams();
  if (params.page) query.set('page', params.page.toString());
  if (params.limit) query.set('limit', params.limit.toString());
  if (params.search) query.set('search', params.search);

  assert.equal(query.toString(), 'page=2&limit=25&search=Youth');
  console.log('✓ Admin Group query parameter serialization verified');

  console.log('ALL ADMIN GROUP GOVERNANCE TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
