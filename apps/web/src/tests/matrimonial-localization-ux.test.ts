import assert from 'node:assert/strict';
import {
  resources,
  i18n,
  changeLanguage,
  getCurrentLanguage,
  TRANSLATION_NAMESPACES,
} from '@apnasamaj/i18n';

console.log('================================================================');
console.log(' Apna Samaj — Batch 15H.3: Matrimonial Localization UX Test    ');
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

  test('Translation namespaces include "matrimonial"', () => {
    assert.ok(
      (TRANSLATION_NAMESPACES as readonly string[]).includes('matrimonial'),
      'TRANSLATION_NAMESPACES must contain "matrimonial"'
    );
  });

  test('Both "en" and "hi" matrimonial resources are registered in resources object', () => {
    assert.ok(resources.hi.matrimonial, 'resources.hi.matrimonial must exist');
    assert.ok(resources.en.matrimonial, 'resources.en.matrimonial must exist');
  });

  // -------------------------------------------------------------------------
  // 2. Resource Key Parity & Completeness
  // -------------------------------------------------------------------------
  console.log('--- 2. Resource Key Parity & Completeness ---');

  test('English and Hindi matrimonial resources have 100% key parity', () => {
    const enKeys = Object.keys(resources.en.matrimonial).sort();
    const hiKeys = Object.keys(resources.hi.matrimonial).sort();

    assert.equal(
      enKeys.length,
      hiKeys.length,
      `Key count mismatch: EN has ${enKeys.length}, HI has ${hiKeys.length}`
    );

    const missingInHi = enKeys.filter((k) => !(k in resources.hi.matrimonial));
    const missingInEn = hiKeys.filter((k) => !(k in resources.en.matrimonial));

    assert.deepEqual(missingInHi, [], 'Keys missing in Hindi matrimonial locale');
    assert.deepEqual(missingInEn, [], 'Keys missing in English matrimonial locale');
  });

  test('All translation values are non-empty strings', () => {
    for (const [key, val] of Object.entries(resources.hi.matrimonial)) {
      assert.ok(
        typeof val === 'string' && val.trim().length > 0,
        `Hindi key "${key}" has invalid or empty translation: ${val}`
      );
    }
    for (const [key, val] of Object.entries(resources.en.matrimonial)) {
      assert.ok(
        typeof val === 'string' && val.trim().length > 0,
        `English key "${key}" has invalid or empty translation: ${val}`
      );
    }
  });

  // -------------------------------------------------------------------------
  // 3. Cultural and Domain Authenticity
  // -------------------------------------------------------------------------
  console.log('--- 3. Cultural & Domain Authenticity ---');

  test('Hindi matrimonial vocabulary uses respectful and culturally authentic terminology', () => {
    const hi = resources.hi.matrimonial;
    assert.equal(hi.discoveryTitle, 'समाज वैवाहिक खोज');
    assert.equal(hi.myProfileAndPreferences, 'मेरी प्रोफाइल और प्राथमिकताएं');
    assert.equal(hi.tabPersonal, 'व्यक्तिगत विवरण');
    assert.equal(hi.tabEducationCareer, 'शिक्षा और करियर');
    assert.equal(hi.tabFamilyLifestyle, 'परिवार और जीवनशैली');
    assert.equal(hi.tabPartnerPreferences, 'जीवनसाथी प्राथमिकताएं');
    assert.equal(hi.tabReceivedInterests, 'प्राप्त प्रस्ताव');
    assert.equal(hi.tabSentInterests, 'भेजे गए प्रस्ताव');
    assert.equal(hi.genderBrides, 'कन्या (वधू)');
    assert.equal(hi.genderGrooms, 'वर (दूल्हा)');
    assert.equal(hi.maritalNeverMarried, 'अविवाहित');
    assert.equal(hi.manglikNonManglik, 'अमांगलिक');
    assert.equal(hi.manglikManglik, 'मांगलिक');
    assert.equal(hi.dietVegetarian, 'शाकाहारी');
    assert.equal(hi.sendInterestBtn, 'रिश्ते का प्रस्ताव भेजें');
  });

  test('English matrimonial vocabulary is clear, professional, and consistent', () => {
    const en = resources.en.matrimonial;
    assert.equal(en.discoveryTitle, 'Samaj Matrimony Discovery');
    assert.equal(en.myProfileAndPreferences, 'My Profile & Preferences');
    assert.equal(en.tabPersonal, 'Personal Details');
    assert.equal(en.tabEducationCareer, 'Education & Career');
    assert.equal(en.tabFamilyLifestyle, 'Family & Lifestyle');
    assert.equal(en.tabPartnerPreferences, 'Partner Preferences');
    assert.equal(en.tabReceivedInterests, 'Received Interests');
    assert.equal(en.tabSentInterests, 'Sent Interests');
    assert.equal(en.genderBrides, 'Female (Brides)');
    assert.equal(en.genderGrooms, 'Male (Grooms)');
    assert.equal(en.maritalNeverMarried, 'Never Married');
    assert.equal(en.sendInterestBtn, 'Send Interest');
  });

  // -------------------------------------------------------------------------
  // 4. Dynamic Language Switching
  // -------------------------------------------------------------------------
  console.log('--- 4. Dynamic Language Switching ---');

  await test('i18n instance switches dynamically between Hindi and English', async () => {
    // Switch to Hindi
    await changeLanguage('hi');
    assert.equal(getCurrentLanguage(), 'hi');
    assert.equal(i18n.t('matrimonial:discoveryTitle'), 'समाज वैवाहिक खोज');
    assert.equal(i18n.t('matrimonial:viewFullProfile'), 'पूरी प्रोफाइल देखें');
    assert.equal(i18n.t('matrimonial:submitForApproval'), 'स्वीकृति हेतु सबमिट करें');

    // Switch to English
    await changeLanguage('en');
    assert.equal(getCurrentLanguage(), 'en');
    assert.equal(i18n.t('matrimonial:discoveryTitle'), 'Samaj Matrimony Discovery');
    assert.equal(i18n.t('matrimonial:viewFullProfile'), 'View Full Profile');
    assert.equal(i18n.t('matrimonial:submitForApproval'), 'Submit for Approval');

    // Switch back to Hindi
    await changeLanguage('hi');
    assert.equal(getCurrentLanguage(), 'hi');
    assert.equal(i18n.t('matrimonial:discoveryTitle'), 'समाज वैवाहिक खोज');
  });

  // -------------------------------------------------------------------------
  // 5. Interpolation & Pluralization
  // -------------------------------------------------------------------------
  console.log('--- 5. Interpolation & Pluralization ---');

  await test('Dynamic interpolation renders variables correctly in Hindi and English', async () => {
    await changeLanguage('en');
    assert.equal(
      i18n.t('matrimonial:showingProfilesMeta', { current: 12, total: 48 }),
      'Showing 12 of 48 approved profiles'
    );
    assert.equal(
      i18n.t('matrimonial:yearsOld', { age: 26 }),
      '26 yrs'
    );
    assert.equal(
      i18n.t('matrimonial:heightCm', { height: 172 }),
      '172 cm'
    );
    assert.equal(
      i18n.t('matrimonial:subCastePrefix', { value: 'Kashyap' }),
      'Sub-caste: Kashyap'
    );
    assert.equal(
      i18n.t('matrimonial:sendInterestModalDesc', { name: 'Pooja Kewat' }),
      'You are sending an interest request to Pooja Kewat. If they accept your request, verified contact details will be unlocked for both of you.'
    );

    await changeLanguage('hi');
    assert.equal(
      i18n.t('matrimonial:showingProfilesMeta', { current: 12, total: 48 }),
      'कुल 48 में से 12 स्वीकृत प्रोफाइल दिखाई जा रही हैं'
    );
    assert.equal(
      i18n.t('matrimonial:yearsOld', { age: 26 }),
      '26 वर्ष'
    );
    assert.equal(
      i18n.t('matrimonial:heightCm', { height: 172 }),
      '172 सेमी'
    );
    assert.equal(
      i18n.t('matrimonial:subCastePrefix', { value: 'कश्यप' }),
      'उप-जाति: कश्यप'
    );
    assert.equal(
      i18n.t('matrimonial:sendInterestModalDesc', { name: 'पूजा केवट' }),
      'आप पूजा केवट को रिश्ते का प्रस्ताव भेज रहे हैं। यदि वे आपका प्रस्ताव स्वीकार करते हैं, तो दोनों के लिए सत्यापित संपर्क नंबर उपलब्ध हो जाएंगे।'
    );
  });

  await test('Filter pluralization correctly reflects singular and plural active filters', async () => {
    await changeLanguage('en');
    assert.equal(i18n.t('matrimonial:activeFilterCount', { count: 1 }), '1 active filter');
    assert.equal(i18n.t('matrimonial:activeFilterCount_plural', { count: 3 }), '3 active filters');

    await changeLanguage('hi');
    assert.equal(i18n.t('matrimonial:activeFilterCount', { count: 1 }), '1 सक्रिय फिल्टर');
    assert.equal(i18n.t('matrimonial:activeFilterCount_plural', { count: 3 }), '3 सक्रिय फिल्टर');
  });

  // -------------------------------------------------------------------------
  // 6. Option Mappings Coverage
  // -------------------------------------------------------------------------
  console.log('--- 6. Option Mappings Coverage ---');

  test('All standard matrimonial enum choices have valid translations in both languages', () => {
    const maritalKeys = ['maritalNeverMarried', 'maritalDivorced', 'maritalWidowed', 'maritalAwaitingDivorce'];
    const manglikKeys = ['manglikNonManglik', 'manglikManglik', 'manglikAnshik', 'manglikDontKnow'];
    const dietKeys = ['dietVegetarian', 'dietNonVegetarian', 'dietEggetarian', 'dietJain'];
    const familyTypeKeys = ['familyTypeNuclear', 'familyTypeJoint'];
    const familyValueKeys = ['valuesTraditional', 'valuesModerate', 'valuesLiberal'];
    const habitKeys = ['habitNever', 'habitOccasionally', 'habitRegularly'];

    for (const key of [...maritalKeys, ...manglikKeys, ...dietKeys, ...familyTypeKeys, ...familyValueKeys, ...habitKeys]) {
      assert.ok(resources.hi.matrimonial[key as keyof typeof resources.hi.matrimonial], `Missing Hindi translation for ${key}`);
      assert.ok(resources.en.matrimonial[key as keyof typeof resources.en.matrimonial], `Missing English translation for ${key}`);
    }
  });

  // -------------------------------------------------------------------------
  // 7. Privacy Invariant & Sensitive Data Protection
  // -------------------------------------------------------------------------
  console.log('--- 7. Privacy Invariant & Sensitive Data Protection ---');

  await test('Phone number locked / unlocked privacy copy is correctly localized and protected', async () => {
    await changeLanguage('hi');
    assert.equal(i18n.t('matrimonial:contactLockedTitle'), 'फोन एवं संपर्क नंबर सुरक्षित');
    assert.ok(i18n.t('matrimonial:contactLockedDesc').includes('गोपनीयता'));
    assert.equal(i18n.t('matrimonial:contactUnlockedNotice'), 'संपर्क उपलब्ध (पारस्परिक जुड़ाव)');
    assert.equal(i18n.t('matrimonial:ownProfileContactNotice'), 'सार्वजनिक खोज में आपकी स्वयं की संपर्क जानकारी निजी रहती है।');

    await changeLanguage('en');
    assert.equal(i18n.t('matrimonial:contactLockedTitle'), 'Phone & Contact Locked');
    assert.ok(i18n.t('matrimonial:contactLockedDesc').includes('privacy'));
    assert.equal(i18n.t('matrimonial:contactUnlockedNotice'), 'Contact Unlocked (Mutually Connected)');
  });

  // -------------------------------------------------------------------------
  // 8. Raw User-Generated Data Preservation (Invariant)
  // -------------------------------------------------------------------------
  console.log('--- 8. Raw User-Generated Data Preservation ---');

  await test('Raw user inputs (names, bios, gotra, addresses) are preserved untranslated', async () => {
    const rawProfile = {
      fullName: 'Ramesh Kewat',
      aboutMe: 'Working as a Senior Engineer at Indore, fond of classical music.',
      gotra: 'Kashyap',
      birthCity: 'Ujjain',
      fatherName: 'Late Shri Mohanlal Kewat',
    };

    await changeLanguage('en');
    const formattedGotraEn = `${i18n.t('matrimonial:overviewGotra')}: ${rawProfile.gotra}`;
    assert.equal(formattedGotraEn, 'Gotra: Kashyap');

    await changeLanguage('hi');
    const formattedGotraHi = `${i18n.t('matrimonial:overviewGotra')}: ${rawProfile.gotra}`;
    assert.equal(formattedGotraHi, 'गोत्र: Kashyap');

    // Bio remains intact
    assert.equal(rawProfile.aboutMe, 'Working as a Senior Engineer at Indore, fond of classical music.');
  });

  // -------------------------------------------------------------------------
  // 9. Status Badge and Flow Localization
  // -------------------------------------------------------------------------
  console.log('--- 9. Status Badge and Flow Localization ---');

  await test('Moderation and interest lifecycle states are properly translated', async () => {
    await changeLanguage('hi');
    assert.equal(i18n.t('matrimonial:statusDraft'), 'ड्राफ्ट — खोज में दृश्य नहीं');
    assert.equal(i18n.t('matrimonial:statusPendingApproval'), 'समाज एडमिन अनुमोदन प्रतीक्षित');
    assert.equal(i18n.t('matrimonial:statusApproved'), 'स्वीकृत एवं खोज में दृश्य');
    assert.equal(i18n.t('matrimonial:statusRejected'), 'सुधार अपेक्षित / अस्वीकृत');

    assert.equal(i18n.t('matrimonial:interestPendingDecision'), 'निर्णय प्रतीक्षित');
    assert.equal(i18n.t('matrimonial:interestPendingResponse'), 'प्रतिक्रिया प्रतीक्षित');
    assert.equal(i18n.t('matrimonial:interestAcceptedConnected'), 'स्वीकृत एवं जुड़े हुए');
    assert.equal(i18n.t('matrimonial:interestDeclinedStatus'), 'अस्वीकृत');
    assert.equal(i18n.t('matrimonial:interestWithdrawnStatus'), 'वापस लिया गया');

    await changeLanguage('en');
    assert.equal(i18n.t('matrimonial:statusDraft'), 'Draft — Not Visible in Discovery');
    assert.equal(i18n.t('matrimonial:statusPendingApproval'), 'Pending Samaj Admin Approval');
    assert.equal(i18n.t('matrimonial:statusApproved'), 'Approved & Visible in Discovery');
    assert.equal(i18n.t('matrimonial:statusRejected'), 'Changes Requested / Rejected');

    assert.equal(i18n.t('matrimonial:interestPendingDecision'), 'Pending Decision');
    assert.equal(i18n.t('matrimonial:interestPendingResponse'), 'Pending Response');
    assert.equal(i18n.t('matrimonial:interestAcceptedConnected'), 'Accepted & Connected');
  });

  console.log('\n================================================================');
  console.log(` Summary: ${passedTests}/${totalTests} tests passed`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exitCode = 1;
  }
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exitCode = 1;
});
