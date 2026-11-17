import assert from 'node:assert/strict';
import { generateMemberListCsv, sanitizeCsvCell } from '../utils/csv-export.js';
import { UserRole, UserStatus } from '../../../../packages/shared-types/src/user.js';
import type { AdminUserListItem } from '../../../../packages/shared-types/src/user.js';

async function runTests() {
  console.log('--- Testing Admin Content Specialization & Export ---');

  // Test 1: Formula Injection Sanitization
  const dangerousCell = '=cmd|"/C calc"!A0';
  const sanitized = sanitizeCsvCell(dangerousCell);
  assert.equal(sanitized, `"'=cmd|""/C calc""!A0"`, 'Formula cell should be prepended with a quote and escaped in RFC-4180 quotes');

  const formulaSimple = '+12345';
  const sanitizedSimple = sanitizeCsvCell(formulaSimple);
  assert.equal(sanitizedSimple, "'+12345", 'Formula cell should be prepended with a single quote');

  const commaCell = 'Kewat, Madhya Pradesh';
  const sanitizedComma = sanitizeCsvCell(commaCell);
  assert.equal(sanitizedComma, '"Kewat, Madhya Pradesh"', 'Cell with comma should be enclosed in quotes');
  console.log('✓ CSV formula injection protection verified');

  // Test 2: Member List CSV Generation with Zero Sensitive Data
  const sampleMembers: AdminUserListItem[] = [
    {
      id: 'usr-1',
      phone: '+919876543210',
      role: UserRole.MEMBER,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      createdAt: '2026-01-15T10:00:00.000Z',
      updatedAt: '2026-01-15T10:00:00.000Z',
      profile: {
        fullName: 'रविंद्र केवट / Ravindra Kewat',
        gender: 'MALE',
        city: 'Indore',
        state: 'Madhya Pradesh',
        subCaste: 'Kashyap',
        gotra: 'Kashyap',
      },
    },
    {
      id: 'usr-2',
      phone: '+919876543211',
      role: UserRole.COMMUNITY_ADMIN,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      createdAt: '2026-02-01T12:00:00.000Z',
      updatedAt: '2026-02-01T12:00:00.000Z',
      profile: {
        fullName: 'अमित गुप्ता',
        gender: 'MALE',
        city: 'Bhopal',
        state: 'Madhya Pradesh',
        subCaste: 'Vaishya',
        gotra: 'Garg',
      },
    },
  ];

  const csvOutput = generateMemberListCsv(sampleMembers);

  // Verification: Headers exist
  assert.ok(csvOutput.includes('Member Name,Mobile Number,Role,Status'), 'Headers should be present');
  // Verification: Member data exists
  assert.ok(csvOutput.includes('रविंद्र केवट / Ravindra Kewat'), 'Devanagari text should be preserved');
  assert.ok(csvOutput.includes('+919876543210'), 'Phone number should be exported');
  assert.ok(csvOutput.includes('Indore'), 'City should be exported');

  // Verification: Security invariant - ZERO secrets exposed
  assert.ok(!csvOutput.toLowerCase().includes('password'), 'CSV must never contain password field');
  assert.ok(!csvOutput.toLowerCase().includes('token'), 'CSV must never contain token field');
  assert.ok(!csvOutput.toLowerCase().includes('hash'), 'CSV must never contain hash field');
  assert.ok(!csvOutput.toLowerCase().includes('secret'), 'CSV must never contain secret field');
  console.log('✓ Member CSV export generated with zero sensitive data exposure');

  // Test 3: Content Specialization Filter Categorization
  const testPosts = [
    { id: 'p1', title: 'Need React Developer', content: '[रोजगार / Employment] Hiring Frontend Developer in Indore' },
    { id: 'p2', title: 'PM Awas Yojana Update', content: '[सरकारी योजना / Govt Scheme] How to apply for benefits' },
    { id: 'p3', title: 'Community Gathering Notice', content: 'Annual picnic at Regional Park this Sunday' },
  ];

  const filterEmployment = (text: string) =>
    text.includes('[रोजगार') || text.includes('रोजगार') || text.toLowerCase().includes('job') || text.toLowerCase().includes('employment');
  const filterScheme = (text: string) =>
    text.includes('[सरकारी योजना') || text.includes('सरकारी योजना') || text.toLowerCase().includes('scheme');

  assert.equal(filterEmployment(testPosts[0].content), true);
  assert.equal(filterEmployment(testPosts[1].content), false);
  assert.equal(filterScheme(testPosts[1].content), true);
  assert.equal(filterScheme(testPosts[2].content), false);
  console.log('✓ Content specialization filter categorization verified');

  console.log('ALL ADMIN CONTENT SPECIALIZATION & EXPORT TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
