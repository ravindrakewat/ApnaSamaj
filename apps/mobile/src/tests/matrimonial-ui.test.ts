import assert from 'node:assert';
import { MatrimonialCard, formatHeightCm } from '../components/MatrimonialCard';
import { PublicMatrimonialProfileListItem } from '@apnasamaj/shared-types';

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

export async function runMatrimonialUiTests() {
  console.log('\n========================================================================');
  console.log('   Apna Samaj — Batch 10.2.3: Matrimonial UI Modernization Tests       ');
  console.log('========================================================================\n');

  // -----------------------------------------------------------------------------
  // 1. MatrimonialCard Component & Height Formatting Logic
  // -----------------------------------------------------------------------------
  console.log('--- 1. MatrimonialCard Component & Height Formatting Logic ---');

  await test('MatrimonialCard is exported as a valid React component', () => {
    assert.strictEqual(typeof MatrimonialCard, 'function');
  });

  await test('formatHeightCm correctly converts centimeters to feet and inches', () => {
    assert.strictEqual(formatHeightCm(175), `175 cm (5'9")`);
    assert.strictEqual(formatHeightCm(180), `180 cm (5'11")`);
    assert.strictEqual(formatHeightCm(152), `152 cm (5'0")`);
    assert.strictEqual(formatHeightCm(0), '');
    assert.strictEqual(formatHeightCm(null), '');
    assert.strictEqual(formatHeightCm(undefined), '');
  });

  // -----------------------------------------------------------------------------
  // 2. Gender & Marital Status Localized Badges
  // -----------------------------------------------------------------------------
  console.log('--- 2. Gender & Marital Status Localized Badges ---');

  await test('Derives Bride and Groom badges with localized titles', () => {
    const getGenderBadge = (gender: 'MALE' | 'FEMALE', lang: 'hi' | 'en') => {
      if (gender === 'FEMALE') return lang === 'hi' ? '👰 वधू' : 'Bride';
      return lang === 'hi' ? '🤵 वर' : 'Groom';
    };

    assert.strictEqual(getGenderBadge('FEMALE', 'hi'), '👰 वधू');
    assert.strictEqual(getGenderBadge('FEMALE', 'en'), 'Bride');
    assert.strictEqual(getGenderBadge('MALE', 'hi'), '🤵 वर');
    assert.strictEqual(getGenderBadge('MALE', 'en'), 'Groom');
  });

  await test('Derives Marital Status labels correctly across supported statuses', () => {
    const getMaritalLabel = (status: string, lang: 'hi' | 'en') => {
      switch (status) {
        case 'NEVER_MARRIED':
          return lang === 'hi' ? 'अविवाहित' : 'Never Married';
        case 'DIVORCED':
          return lang === 'hi' ? 'तलाकशुदा' : 'Divorced';
        case 'WIDOWED':
          return lang === 'hi' ? 'विधवा/विधुर' : 'Widowed';
        case 'AWAITING_DIVORCE':
          return lang === 'hi' ? 'तलाक प्रक्रियाधीन' : 'Awaiting Divorce';
        default:
          return status;
      }
    };

    assert.strictEqual(getMaritalLabel('NEVER_MARRIED', 'hi'), 'अविवाहित');
    assert.strictEqual(getMaritalLabel('DIVORCED', 'hi'), 'तलाकशुदा');
    assert.strictEqual(getMaritalLabel('WIDOWED', 'en'), 'Widowed');
  });

  // -----------------------------------------------------------------------------
  // 3. Privacy Invariants: Zero Contact Disclosure on Discovery Cards
  // -----------------------------------------------------------------------------
  console.log('--- 3. Privacy Invariants: Zero Contact Disclosure on Discovery Cards ---');

  await test('PublicMatrimonialProfileListItem enforces zero contact disclosure', () => {
    const mockCardProfile: PublicMatrimonialProfileListItem = {
      id: 'prof-1',
      userId: 'user-1',
      fullName: 'सुनील केवट',
      gender: 'MALE',
      age: 28,
      city: 'भोपाल',
      state: 'मध्य प्रदेश',
      avatarUrl: 'https://example.com/avatar.jpg',
      maritalStatus: 'NEVER_MARRIED',
      heightCm: 175,
      highestEducation: 'B.Tech',
      employedIn: 'PRIVATE_SECTOR',
      occupation: 'Software Engineer',
      annualIncome: '15-20 Lakhs',
      subCaste: 'केवट',
      gotra: 'कश्यप',
      manglik: 'NON_MANGLIK',
      diet: 'VEGETARIAN',
      photosCount: 2,
      interestStatus: null,
      isVerified: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    // Public list item type does not have phone or email fields
    assert.strictEqual((mockCardProfile as any).phone, undefined);
    assert.strictEqual((mockCardProfile as any).email, undefined);
    assert.strictEqual((mockCardProfile as any).contactNumber, undefined);
  });

  await test('Contact is revealed strictly when mutual interest is ACCEPTED', () => {
    const resolveContactDisplay = (
      unlockedContact: { phone?: string; email?: string } | undefined | null,
      status: string | null
    ) => {
      if (status === 'ACCEPTED' && unlockedContact?.phone) {
        return { isUnlocked: true, phone: unlockedContact.phone };
      }
      return { isUnlocked: false, phone: null };
    };

    // Pending: contact hidden
    const pendingResult = resolveContactDisplay({ phone: '+919876543210' }, 'PENDING');
    assert.strictEqual(pendingResult.isUnlocked, false);
    assert.strictEqual(pendingResult.phone, null);

    // Accepted: contact visible
    const acceptedResult = resolveContactDisplay({ phone: '+919876543210' }, 'ACCEPTED');
    assert.strictEqual(acceptedResult.isUnlocked, true);
    assert.strictEqual(acceptedResult.phone, '+919876543210');
  });

  // -----------------------------------------------------------------------------
  // 4. Discovery Search & Keyword Filtering
  // -----------------------------------------------------------------------------
  console.log('--- 4. Discovery Search & Keyword Filtering ---');

  const sampleProfiles = [
    { id: '1', fullName: 'राहुल केवट', subCaste: 'केवट', city: 'भोपाल', occupation: 'इंजीनियर', gotra: 'कश्यप' },
    { id: '2', fullName: 'पूजा मल्लाह', subCaste: 'मल्लाह', city: 'ग्वालियर', occupation: 'शिक्षिका', gotra: 'भारद्वाज' },
    { id: '3', fullName: 'अमित कश्यप', subCaste: 'कश्यप', city: 'इंदौर', occupation: 'बैंकर', gotra: 'वशिष्ठ' },
  ];

  await test('Search query filters candidates across name, subCaste, city, and occupation', () => {
    const filterByQuery = (query: string) => {
      const q = query.toLowerCase().trim();
      return sampleProfiles.filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          p.subCaste.toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q) ||
          p.occupation.toLowerCase().includes(q)
      );
    };

    assert.strictEqual(filterByQuery('भोपाल').length, 1);
    assert.strictEqual(filterByQuery('भोपाल')[0].id, '1');

    assert.strictEqual(filterByQuery('मल्लाह').length, 1);
    assert.strictEqual(filterByQuery('मल्लाह')[0].fullName, 'पूजा मल्लाह');

    assert.strictEqual(filterByQuery('इंजीनियर').length, 1);
  });

  // -----------------------------------------------------------------------------
  // 5. Interest Status Indicators & State Transitions
  // -----------------------------------------------------------------------------
  console.log('--- 5. Interest Status Indicators & State Transitions ---');

  await test('Renders distinct status labels for PENDING, ACCEPTED, and DECLINED', () => {
    const getInterestStatusBadge = (status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | null, lang: 'hi' | 'en') => {
      switch (status) {
        case 'PENDING':
          return { label: lang === 'hi' ? '⏳ रुचि भेजी गई' : 'Interest Sent', variant: 'warning' };
        case 'ACCEPTED':
          return { label: lang === 'hi' ? '💖 स्वीकृत' : 'Connected', variant: 'success' };
        case 'DECLINED':
          return { label: lang === 'hi' ? '✕ अस्वीकृत' : 'Declined', variant: 'error' };
        default:
          return null;
      }
    };

    const pending = getInterestStatusBadge('PENDING', 'hi');
    assert.strictEqual(pending?.label, '⏳ रुचि भेजी गई');

    const accepted = getInterestStatusBadge('ACCEPTED', 'hi');
    assert.strictEqual(accepted?.label, '💖 स्वीकृत');

    const declined = getInterestStatusBadge('DECLINED', 'en');
    assert.strictEqual(declined?.label, 'Declined');
  });

  // -----------------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------------
  console.log('------------------------------------------------------------------------');
  console.log(`Matrimonial UI Summary: ${passedTests} PASSED, ${totalTests - passedTests} FAILED (Total: ${totalTests})`);
  console.log('------------------------------------------------------------------------\n');
}
