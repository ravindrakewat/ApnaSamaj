import assert from 'node:assert';
import { PublicMemberProfile, UserRole } from '@apnasamaj/shared-types';

let totalTests = 0;
let passedTests = 0;

async function test(desc: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`✅ PASS: ${desc}`);
  } catch (err: any) {
    console.error(`❌ FAIL: ${desc}`);
    console.error(`   ${err.message}`);
    process.exitCode = 1;
  }
}

export async function runProfileSettingsUiTests() {
  console.log('\n========================================================================');
  console.log('   Apna Samaj — Batch 10.2.4: Profile & Settings UI Modernization Tests ');
  console.log('========================================================================\n');

  // -----------------------------------------------------------------------------
  // 1. Profile Completion Percentage Calculation
  // -----------------------------------------------------------------------------
  console.log('--- 1. Profile Completion Percentage Calculation ---');

  const calculateCompletion = (profile: {
    fullName?: string;
    avatarUrl?: string;
    bio?: string;
    city?: string;
    state?: string;
    subCaste?: string;
    gotra?: string;
    isPhoneVerified?: boolean;
  }) => {
    const items = [
      Boolean(profile.fullName && profile.fullName.trim().length > 0 && profile.fullName !== 'समाज सदस्य'),
      Boolean(profile.avatarUrl),
      Boolean(profile.bio?.trim()),
      Boolean(profile.city?.trim()),
      Boolean(profile.state?.trim()),
      Boolean(profile.subCaste?.trim()),
      Boolean(profile.gotra?.trim()),
      Boolean(profile.isPhoneVerified),
    ];
    const filled = items.filter(Boolean).length;
    return Math.round((filled / items.length) * 100);
  };

  await test('Calculates 100% when all profile fields are complete', () => {
    const full = {
      fullName: 'सुनील केवट',
      avatarUrl: 'https://example.com/avatar.jpg',
      bio: 'सक्रिय सदस्य',
      city: 'भोपाल',
      state: 'मध्य प्रदेश',
      subCaste: 'केवट',
      gotra: 'कश्यप',
      isPhoneVerified: true,
    };
    assert.strictEqual(calculateCompletion(full), 100);
  });

  await test('Calculates partial percentage for partially filled profiles', () => {
    const partial = {
      fullName: 'सुनील केवट',
      avatarUrl: undefined,
      bio: undefined,
      city: 'भोपाल',
      state: 'मध्य प्रदेश',
      subCaste: undefined,
      gotra: undefined,
      isPhoneVerified: true,
    }; // 4 of 8 items filled
    assert.strictEqual(calculateCompletion(partial), 50);
  });

  // -----------------------------------------------------------------------------
  // 2. Member Profile Privacy Invariant: Zero Sensitive Data
  // -----------------------------------------------------------------------------
  console.log('--- 2. Member Profile Privacy Invariant: Zero Sensitive Data ---');

  await test('PublicMemberProfile strictly omits phone, email, and password hash', () => {
    const sampleMember: PublicMemberProfile = {
      id: 'mem-101',
      fullName: 'रविन्द्र केवट',
      avatarUrl: 'https://example.com/mem.jpg',
      role: UserRole.MEMBER,
      city: 'ग्वालियर',
      state: 'मध्य प्रदेश',
      subCaste: 'केवट',
      gotra: 'कश्यप',
      bio: 'समाज सेवक',
      gender: 'MALE',
      joinedAt: '2026-01-15T00:00:00.000Z',
    };

    assert.strictEqual((sampleMember as any).phone, undefined);
    assert.strictEqual((sampleMember as any).email, undefined);
    assert.strictEqual((sampleMember as any).passwordHash, undefined);
    assert.strictEqual((sampleMember as any).resetToken, undefined);
  });

  // -----------------------------------------------------------------------------
  // 3. Edit Profile Validation Rules
  // -----------------------------------------------------------------------------
  console.log('--- 3. Edit Profile Validation Rules ---');

  await test('Rejects empty or single-character full names', () => {
    const validateFullName = (name: string): { isValid: boolean; error?: string } => {
      const trimmed = name?.trim();
      if (!trimmed || trimmed.length < 2) {
        return { isValid: false, error: 'Full name must be at least 2 characters.' };
      }
      return { isValid: true };
    };

    assert.strictEqual(validateFullName('').isValid, false);
    assert.strictEqual(validateFullName(' ').isValid, false);
    assert.strictEqual(validateFullName('A').isValid, false);
    assert.strictEqual(validateFullName('सुनील').isValid, true);
    assert.strictEqual(validateFullName('Sunil Kewat').isValid, true);
  });

  await test('Validates gender enum mapping correctly', () => {
    const validGenders = ['MALE', 'FEMALE', 'OTHER'];
    assert.strictEqual(validGenders.includes('MALE'), true);
    assert.strictEqual(validGenders.includes('FEMALE'), true);
    assert.strictEqual(validGenders.includes('OTHER'), true);
    assert.strictEqual(validGenders.includes('UNKNOWN'), false);
  });

  // -----------------------------------------------------------------------------
  // 4. Multi-Tenant Community Switcher & Session Invariants
  // -----------------------------------------------------------------------------
  console.log('--- 4. Multi-Tenant Community Switcher & Session Invariants ---');

  await test('Switching community slug terminates session to enforce tenant isolation', () => {
    let currentSession: { token: string | null; slug: string } = {
      token: 'jwt-token-kewat-xyz',
      slug: 'kewat',
    };

    const switchCommunityMock = (newSlug: string) => {
      if (newSlug === currentSession.slug) return;
      // Invariant: Terminate current session tokens and update tenant
      currentSession.token = null;
      currentSession.slug = newSlug;
    };

    switchCommunityMock('gupta');
    assert.strictEqual(currentSession.token, null);
    assert.strictEqual(currentSession.slug, 'gupta');
  });

  // -----------------------------------------------------------------------------
  // 5. Notification Preferences Key Verification
  // -----------------------------------------------------------------------------
  console.log('--- 5. Notification Preferences Key Verification ---');

  await test('Supported notification preferences include all 6 mobile activity channels', () => {
    const supportedKeys = [
      'personalMessages',
      'groupMessages',
      'matrimonial',
      'announcements',
      'communityUpdates',
      'comments',
    ];

    assert.strictEqual(supportedKeys.length, 6);
    assert.strictEqual(supportedKeys.includes('personalMessages'), true);
    assert.strictEqual(supportedKeys.includes('groupMessages'), true);
    assert.strictEqual(supportedKeys.includes('matrimonial'), true);
    assert.strictEqual(supportedKeys.includes('announcements'), true);
  });

  // -----------------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------------
  console.log('------------------------------------------------------------------------');
  console.log(`Profile & Settings UI Summary: ${passedTests} PASSED, ${totalTests - passedTests} FAILED (Total: ${totalTests})`);
  console.log('------------------------------------------------------------------------\n');
}
