import assert from 'node:assert/strict';
import {
  resources,
  i18n,
  changeLanguage,
  getCurrentLanguage,
  TRANSLATION_NAMESPACES,
} from '@apnasamaj/i18n';
import type { UserRole as UserRoleType } from '@apnasamaj/shared-types';

const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  COMMUNITY_ADMIN: 'COMMUNITY_ADMIN',
  MODERATOR: 'MODERATOR',
  MEMBER: 'MEMBER',
} as const;

console.log('================================================================');
console.log(' Apna Samaj — Batch 15H.1: Directory & Profile Localization UX ');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(description: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => {
          passedTests++;
          console.log(`✅ PASS: ${description}`);
        })
        .catch((err) => {
          console.error(`❌ FAIL: ${description}`);
          console.error(err);
          process.exitCode = 1;
        });
    } else {
      passedTests++;
      console.log(`✅ PASS: ${description}`);
    }
  } catch (err) {
    console.error(`❌ FAIL: ${description}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runTests() {
  // -------------------------------------------------------------------------
  // 1. Namespace Registration
  // -------------------------------------------------------------------------
  console.log('--- 1. Namespace Registration ---');

  test('Translation namespaces include "directory"', () => {
    assert.ok(
      (TRANSLATION_NAMESPACES as readonly string[]).includes('directory'),
      'TRANSLATION_NAMESPACES must contain "directory"'
    );
  });

  // -------------------------------------------------------------------------
  // 2. Hindi Directory UI Resources
  // -------------------------------------------------------------------------
  console.log('--- 2. Hindi Directory UI Resources ---');

  test('Hindi resources contain authentic directory and profile UI strings', () => {
    const hi = resources.hi.directory;
    assert.equal(hi.title, 'समाज सदस्य निर्देशिका');
    assert.ok(hi.subtitle.includes('सत्यापित अपना समाज के सदस्यों से जुड़ें'));
    assert.equal(hi.verifiedMemberBadge, 'सत्यापित सदस्य');
    assert.equal(hi.searchPlaceholder, 'नाम, गोत्र, शहर या उप-जाति से खोजें...');
    assert.equal(hi.filterCity, 'शहर से फ़िल्टर करें...');
    assert.equal(hi.filterState, 'राज्य से फ़िल्टर करें...');
    assert.equal(hi.filterSubCaste, 'उप-जाति से फ़िल्टर करें...');
    assert.equal(hi.filterGotra, 'गोत्र से फ़िल्टर करें...');
    assert.equal(hi.resetFilters, 'फ़िल्टर रीसेट करें');
    assert.equal(hi.clearAllFilters, 'सभी फ़िल्टर साफ़ करें');
    assert.equal(hi.emptyTitle, 'कोई सदस्य नहीं मिला');
    assert.equal(hi.communityInfo, 'समुदाय जानकारी');
    assert.equal(hi.location, 'स्थान');
    assert.equal(hi.gotra, 'गोत्र');
    assert.equal(hi.subCaste, 'उप-जाति');
    assert.equal(hi.gender, 'लिंग');
    assert.equal(hi.notSpecified, 'निर्दिष्ट नहीं');
    assert.equal(hi.roleMember, 'सदस्य');
    assert.equal(hi.roleModerator, 'मॉडरेटर');
    assert.equal(hi.roleAdmin, 'प्रशासक');
    assert.equal(hi.roleSuperAdmin, 'मुख्य प्रशासक');
    assert.equal(hi.genderMale, 'पुरुष');
    assert.equal(hi.genderFemale, 'महिला');
    assert.equal(hi.genderOther, 'अन्य');
  });

  // -------------------------------------------------------------------------
  // 3. English Directory UI Resources
  // -------------------------------------------------------------------------
  console.log('--- 3. English Directory UI Resources ---');

  test('English resources contain clean directory and profile UI strings', () => {
    const en = resources.en.directory;
    assert.equal(en.title, 'Community Member Directory');
    assert.ok(en.subtitle.includes('Connect with verified Apna Samaj community members'));
    assert.equal(en.verifiedMemberBadge, 'Verified Member');
    assert.equal(en.searchPlaceholder, 'Search by name, gotra, city, or sub-caste...');
    assert.equal(en.filterCity, 'Filter by city...');
    assert.equal(en.filterState, 'Filter by state...');
    assert.equal(en.filterSubCaste, 'Filter by sub-caste...');
    assert.equal(en.filterGotra, 'Filter by gotra...');
    assert.equal(en.resetFilters, 'Reset Filters');
    assert.equal(en.clearAllFilters, 'Clear All Filters');
    assert.equal(en.emptyTitle, 'No Community Members Found');
    assert.equal(en.communityInfo, 'Community Information');
    assert.equal(en.location, 'Location');
    assert.equal(en.gotra, 'Gotra');
    assert.equal(en.subCaste, 'Sub-Caste');
    assert.equal(en.gender, 'Gender');
    assert.equal(en.notSpecified, 'Not specified');
    assert.equal(en.roleMember, 'Member');
    assert.equal(en.roleModerator, 'Moderator');
    assert.equal(en.roleAdmin, 'Admin');
    assert.equal(en.roleSuperAdmin, 'Super Admin');
    assert.equal(en.genderMale, 'Male');
    assert.equal(en.genderFemale, 'Female');
    assert.equal(en.genderOther, 'Other');
  });

  // -------------------------------------------------------------------------
  // 4. Translation Key Parity (1:1 Match)
  // -------------------------------------------------------------------------
  console.log('--- 4. Translation Key Parity ---');

  test('English and Hindi directory namespaces have complete 1:1 key parity', () => {
    const enKeys = Object.keys(resources.en.directory).sort();
    const hiKeys = Object.keys(resources.hi.directory).sort();

    const missingInHi = enKeys.filter((k) => !hiKeys.includes(k));
    const missingInEn = hiKeys.filter((k) => !enKeys.includes(k));

    assert.deepEqual(missingInHi, [], `Missing in Hindi: ${missingInHi.join(', ')}`);
    assert.deepEqual(missingInEn, [], `Missing in English: ${missingInEn.join(', ')}`);
    assert.equal(enKeys.length, hiKeys.length, 'Key counts must be identical');
    assert.ok(enKeys.length >= 55, `Expected at least 55 keys, found ${enKeys.length}`);
  });

  // -------------------------------------------------------------------------
  // 5. Dynamic Language Switching (No Page Reload)
  // -------------------------------------------------------------------------
  console.log('--- 5. Dynamic Language Switching ---');

  await test('i18n.t returns Hindi directory strings when active language is "hi"', async () => {
    await changeLanguage('hi');
    assert.equal(getCurrentLanguage(), 'hi');
    assert.equal(i18n.t('directory:title'), 'समाज सदस्य निर्देशिका');
    assert.equal(i18n.t('directory:verifiedMemberBadge'), 'सत्यापित सदस्य');
    assert.equal(i18n.t('directory:communityInfo'), 'समुदाय जानकारी');
    assert.equal(i18n.t('directory:back'), 'पीछे जाएं');
    assert.equal(i18n.t('directory:backToDirectory'), 'निर्देशिका पर वापस जाएं');
  });

  await test('i18n.t returns English directory strings when active language is "en"', async () => {
    await changeLanguage('en');
    assert.equal(getCurrentLanguage(), 'en');
    assert.equal(i18n.t('directory:title'), 'Community Member Directory');
    assert.equal(i18n.t('directory:verifiedMemberBadge'), 'Verified Member');
    assert.equal(i18n.t('directory:communityInfo'), 'Community Information');
    assert.equal(i18n.t('directory:back'), 'Back');
    assert.equal(i18n.t('directory:backToDirectory'), 'Back to Directory');
  });

  // Switch back to Hindi default for subsequent tests
  await changeLanguage('hi');

  // -------------------------------------------------------------------------
  // 6. Pluralization & Interpolation
  // -------------------------------------------------------------------------
  console.log('--- 6. Pluralization & Interpolation ---');

  test('Formats singular and plural verified members count in Hindi and English', () => {
    // English
    assert.equal(
      i18n.t('directory:verifiedMembers', { lng: 'en', count: 1 }),
      '1 Verified Member'
    );
    assert.equal(
      i18n.t('directory:verifiedMembers', { lng: 'en', count: 42 }),
      '42 Verified Members'
    );
    assert.equal(
      i18n.t('directory:verifiedMembers', { lng: 'en', count: 0 }),
      '0 Verified Members'
    );

    // Hindi
    assert.equal(
      i18n.t('directory:verifiedMembers', { lng: 'hi', count: 1 }),
      '1 सत्यापित सदस्य'
    );
    assert.equal(
      i18n.t('directory:verifiedMembers', { lng: 'hi', count: 42 }),
      '42 सत्यापित सदस्य'
    );
    assert.equal(
      i18n.t('directory:verifiedMembers', { lng: 'hi', count: 0 }),
      '0 सत्यापित सदस्य'
    );
  });

  test('Interpolates gotra label in both languages', () => {
    assert.equal(
      i18n.t('directory:gotraLabel', { lng: 'en', gotra: 'Kashyap' }),
      'Gotra: Kashyap'
    );
    assert.equal(
      i18n.t('directory:gotraLabel', { lng: 'hi', gotra: 'कश्यप' }),
      'गोत्र: कश्यप'
    );
  });

  test('Interpolates memberSince date string in both languages', () => {
    assert.equal(
      i18n.t('directory:memberSince', { lng: 'en', date: 'November 2026' }),
      'Member since November 2026'
    );
    assert.equal(
      i18n.t('directory:memberSince', { lng: 'hi', date: 'नवंबर 2026' }),
      'नवंबर 2026 से सदस्य'
    );
  });

  // -------------------------------------------------------------------------
  // 7. Role and Gender Translation Mapping
  // -------------------------------------------------------------------------
  console.log('--- 7. Role and Gender Localization ---');

  test('Role translation maps correctly for all UserRole values', () => {
    const resolveRole = (role: UserRole, lng: string) => {
      switch (role) {
        case UserRole.SUPER_ADMIN:
          return i18n.t('directory:roleSuperAdmin', { lng });
        case UserRole.COMMUNITY_ADMIN:
          return i18n.t('directory:roleAdmin', { lng });
        case UserRole.MODERATOR:
          return i18n.t('directory:roleModerator', { lng });
        default:
          return i18n.t('directory:roleMember', { lng });
      }
    };

    assert.equal(resolveRole(UserRole.SUPER_ADMIN, 'en'), 'Super Admin');
    assert.equal(resolveRole(UserRole.COMMUNITY_ADMIN, 'en'), 'Admin');
    assert.equal(resolveRole(UserRole.MODERATOR, 'en'), 'Moderator');
    assert.equal(resolveRole(UserRole.MEMBER, 'en'), 'Member');

    assert.equal(resolveRole(UserRole.SUPER_ADMIN, 'hi'), 'मुख्य प्रशासक');
    assert.equal(resolveRole(UserRole.COMMUNITY_ADMIN, 'hi'), 'प्रशासक');
    assert.equal(resolveRole(UserRole.MODERATOR, 'hi'), 'मॉडरेटर');
    assert.equal(resolveRole(UserRole.MEMBER, 'hi'), 'सदस्य');
  });

  test('Gender translation maps correctly for all standard gender strings', () => {
    const resolveGender = (gender: string | null | undefined, lng: string) => {
      if (!gender) return i18n.t('directory:notSpecified', { lng });
      const upper = gender.toUpperCase();
      if (upper === 'MALE') return i18n.t('directory:genderMale', { lng });
      if (upper === 'FEMALE') return i18n.t('directory:genderFemale', { lng });
      return i18n.t('directory:genderOther', { lng });
    };

    assert.equal(resolveGender('male', 'en'), 'Male');
    assert.equal(resolveGender('Female', 'en'), 'Female');
    assert.equal(resolveGender('other', 'en'), 'Other');
    assert.equal(resolveGender(null, 'en'), 'Not specified');

    assert.equal(resolveGender('male', 'hi'), 'पुरुष');
    assert.equal(resolveGender('female', 'hi'), 'महिला');
    assert.equal(resolveGender('other', 'hi'), 'अन्य');
    assert.equal(resolveGender(undefined, 'hi'), 'निर्दिष्ट नहीं');
  });

  // -------------------------------------------------------------------------
  // 8. User-Generated Data Preservation (Zero Alteration)
  // -------------------------------------------------------------------------
  console.log('--- 8. User Data Preservation ---');

  test('User-generated names, bios, and locations remain untouched during localization', () => {
    const userProfile = {
      fullName: 'सुनील केवट',
      city: 'उज्जैन',
      state: 'मध्य प्रदेश',
      gotra: 'कश्यप',
      subCaste: 'केवट',
      bio: 'समाज सेवा एवं सामाजिक एकता हमारा ध्येय है।',
    };

    // Verify raw user data is preserved as-is regardless of active language
    const joinedFormattedEn = new Date('2026-03-15').toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });
    const joinedFormattedHi = new Date('2026-03-15').toLocaleDateString('hi-IN', {
      month: 'long',
      year: 'numeric',
    });

    const enProfileOutput = {
      name: userProfile.fullName,
      bio: userProfile.bio,
      location: [userProfile.city, userProfile.state].filter(Boolean).join(', '),
      gotra: userProfile.gotra,
      subCaste: userProfile.subCaste,
      since: i18n.t('directory:memberSince', { lng: 'en', date: joinedFormattedEn }),
    };

    const hiProfileOutput = {
      name: userProfile.fullName,
      bio: userProfile.bio,
      location: [userProfile.city, userProfile.state].filter(Boolean).join(', '),
      gotra: userProfile.gotra,
      subCaste: userProfile.subCaste,
      since: i18n.t('directory:memberSince', { lng: 'hi', date: joinedFormattedHi }),
    };

    assert.equal(enProfileOutput.name, 'सुनील केवट');
    assert.equal(enProfileOutput.bio, 'समाज सेवा एवं सामाजिक एकता हमारा ध्येय है।');
    assert.equal(enProfileOutput.location, 'उज्जैन, मध्य प्रदेश');
    assert.equal(enProfileOutput.gotra, 'कश्यप');
    assert.equal(enProfileOutput.subCaste, 'केवट');
    assert.equal(enProfileOutput.since, 'Member since March 2026');

    assert.equal(hiProfileOutput.name, 'सुनील केवट');
    assert.equal(hiProfileOutput.bio, 'समाज सेवा एवं सामाजिक एकता हमारा ध्येय है।');
    assert.equal(hiProfileOutput.location, 'उज्जैन, मध्य प्रदेश');
    assert.equal(hiProfileOutput.gotra, 'कश्यप');
    assert.equal(hiProfileOutput.subCaste, 'केवट');
    assert.ok(hiProfileOutput.since.includes('2026 से सदस्य'));
  });

  // -------------------------------------------------------------------------
  // 9. Date Formatting Consistency (hi-IN vs en-IN)
  // -------------------------------------------------------------------------
  console.log('--- 9. Date Formatting Consistency ---');

  test('Date formatting adheres to Indian locale conventions for Hindi and English', () => {
    const testDate = new Date('2026-11-02T10:00:00.000Z');

    const enFormatted = testDate.toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });
    assert.equal(enFormatted, 'November 2026');

    const hiFormatted = testDate.toLocaleDateString('hi-IN', {
      month: 'long',
      year: 'numeric',
    });
    // hi-IN formats with Hindi month name (e.g., नवंबर 2026)
    assert.ok(
      hiFormatted.includes('2026'),
      `Expected year 2026 in Hindi formatted date, got "${hiFormatted}"`
    );
  });

  // -------------------------------------------------------------------------
  // 10. ARIA and Accessibility Strings Parity
  // -------------------------------------------------------------------------
  console.log('--- 10. Accessibility / ARIA Parity ---');

  test('All ARIA and accessibility labels exist in both languages', () => {
    const ariaKeys = [
      'searchAria',
      'clearSearchAria',
      'filterCityAria',
      'clearCityAria',
      'filterStateAria',
      'clearStateAria',
      'filterSubCasteAria',
      'clearSubCasteAria',
      'filterGotraAria',
      'clearGotraAria',
      'retryAria',
      'paginationAria',
      'backAria',
      'backToDirectoryAria',
      'retryProfileAria',
    ];

    for (const key of ariaKeys) {
      assert.ok(
        (resources.en.directory as Record<string, string>)[key],
        `Missing English ARIA key: ${key}`
      );
      assert.ok(
        (resources.hi.directory as Record<string, string>)[key],
        `Missing Hindi ARIA key: ${key}`
      );
    }
  });

  console.log('\n================================================================');
  console.log(` Summary: ${passedTests}/${totalTests} Tests Passed Successfully!`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
