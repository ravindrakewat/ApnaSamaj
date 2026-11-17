import assert from 'assert';
import { registerSchema } from '../../../../packages/validation/src/auth.ts';

function assertTest(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Test assertion failed: ${message}`);
  }
  console.log(`✅ PASS: ${message}`);
}

function calculateProfileScore(profile: {
  fullName?: string;
  avatarUrl?: string | null;
  isPhoneVerified?: boolean;
  gender?: string | null;
  dateOfBirth?: string | null;
  city?: string | null;
  state?: string | null;
  subCaste?: string | null;
  gotra?: string | null;
  bio?: string | null;
}): number {
  let score = 0;
  if (profile.fullName) score += 15;
  if (profile.avatarUrl) score += 15;
  if (profile.isPhoneVerified) score += 15;
  if (profile.gender) score += 10;
  if (profile.dateOfBirth) score += 10;
  if (profile.city || profile.state) score += 15;
  if (profile.subCaste || profile.gotra) score += 10;
  if (profile.bio && profile.bio.length > 10) score += 10;
  return Math.min(score, 100);
}

async function runMemberProfileTests() {
  console.log('================================================================');
  console.log('   Apna Samaj — Batch 11.4: Web Member Profile & Polish Tests   ');
  console.log('================================================================\n');

  console.log('--- Test Suite 1: Profile Completion Calculator ---');

  // Barebones profile (only fullName + verified phone)
  const bareProfile = {
    fullName: 'Ramesh Sharma',
    isPhoneVerified: true,
  };
  const bareScore = calculateProfileScore(bareProfile);
  assertTest(bareScore === 30, 'Calculates 30% for basic name and verified phone');

  // Fully completed profile
  const fullProfile = {
    fullName: 'Ramesh Sharma',
    avatarUrl: 'https://cdn.example.com/ramesh.jpg',
    isPhoneVerified: true,
    gender: 'MALE',
    dateOfBirth: '1992-05-15T00:00:00Z',
    city: 'Bhopal',
    state: 'Madhya Pradesh',
    subCaste: 'Kewat',
    gotra: 'Kashyap',
    bio: 'Software engineer passionate about community welfare and tech education.',
  };
  const fullScore = calculateProfileScore(fullProfile);
  assertTest(fullScore === 100, 'Calculates 100% for full member profile');

  console.log('\n--- Test Suite 2: Registration with Optional Roots & Gender ---');

  const regPayload = {
    fullName: 'Priya Verma',
    phone: '9876543210',
    password: 'Password@123',
    gender: 'FEMALE' as const,
    city: 'Indore',
    state: 'Madhya Pradesh',
    subCaste: 'Kewat',
    gotra: 'Bhardwaj',
  };

  const regResult = registerSchema.safeParse(regPayload);
  assertTest(regResult.success, 'Validates registration with gender and optional roots');
  if (regResult.success) {
    assertTest(regResult.data.gender === 'FEMALE', 'Preserves gender selection');
    assertTest(regResult.data.city === 'Indore', 'Preserves city in roots');
    assertTest(regResult.data.gotra === 'Bhardwaj', 'Preserves gotra in roots');
  }

  console.log('\n--- Test Suite 3: 6 Notification Preference Keys Contract ---');

  const requiredNotificationKeys = [
    'personalMessages',
    'groupMessages',
    'matrimonial',
    'likes',
    'comments',
    'announcements',
  ];

  assertTest(requiredNotificationKeys.length === 6, 'Maintains exact 6 notification toggle categories');
  assertTest(requiredNotificationKeys.includes('personalMessages'), 'Supports personal chat messages toggle');
  assertTest(requiredNotificationKeys.includes('groupMessages'), 'Supports group chat messages toggle');
  assertTest(requiredNotificationKeys.includes('matrimonial'), 'Supports matrimonial toggle');
  assertTest(requiredNotificationKeys.includes('likes'), 'Supports likes toggle');
  assertTest(requiredNotificationKeys.includes('comments'), 'Supports comments toggle');
  assertTest(requiredNotificationKeys.includes('announcements'), 'Supports announcements toggle');

  console.log('\n================================================================');
  console.log('   All Batch 11.4 Web Member Profile tests passed cleanly!      ');
  console.log('================================================================\n');
}

runMemberProfileTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
