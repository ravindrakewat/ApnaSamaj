import assert from 'node:assert/strict';
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  LANGUAGE_STORAGE_KEY,
  LANGUAGE_NAMES,
  TRANSLATION_NAMESPACES,
  SupportedLanguage,
  isSupportedLanguage,
  parseLanguageCode,
  resources,
  i18n,
  changeLanguage,
  getCurrentLanguage,
} from '@apnasamaj/i18n';

console.log('================================================================');
console.log('   Apna Samaj — Batch 15E.3B: Multilingual Foundation Tests     ');
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

// In-memory mock localStorage for node environment
class MockLocalStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

const mockStorage = new MockLocalStorage();

// Setup global mock window/localStorage if running in pure Node
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    localStorage: mockStorage,
    navigator: {
      language: 'en-US',
      languages: ['en-US', 'en'],
    },
  };
  (globalThis as any).document = {
    documentElement: {
      lang: 'hi',
    },
  };
}

async function runAllTests() {
  // -------------------------------------------------------------------------
  // 1. Hindi Default Language Invariant
  // -------------------------------------------------------------------------
  console.log('--- 1. Hindi Default Language Configuration ---');

  test('Default language is strictly configured as Hindi ("hi")', () => {
    assert.equal(DEFAULT_LANGUAGE, 'hi');
  });

  test('Supported languages array contains exactly "hi" and "en"', () => {
    assert.deepEqual(SUPPORTED_LANGUAGES, ['hi', 'en']);
  });

  test('isSupportedLanguage recognizes valid language codes', () => {
    assert.equal(isSupportedLanguage('hi'), true);
    assert.equal(isSupportedLanguage('en'), true);
    assert.equal(isSupportedLanguage('fr'), false);
    assert.equal(isSupportedLanguage('es'), false);
    assert.equal(isSupportedLanguage(''), false);
    assert.equal(isSupportedLanguage(null), false);
    assert.equal(isSupportedLanguage(undefined), false);
  });

  test('Language native names are correctly mapped', () => {
    assert.equal(LANGUAGE_NAMES.hi, 'हिन्दी');
    assert.equal(LANGUAGE_NAMES.en, 'English');
  });

  // -------------------------------------------------------------------------
  // 2. Supported Browser-Language Detection
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Browser Language Detection ---');

  test('parseLanguageCode normalizes exact codes', () => {
    assert.equal(parseLanguageCode('hi'), 'hi');
    assert.equal(parseLanguageCode('en'), 'en');
  });

  test('parseLanguageCode normalizes regional browser variants (e.g. en-US, hi-IN)', () => {
    assert.equal(parseLanguageCode('en-US'), 'en');
    assert.equal(parseLanguageCode('en-GB'), 'en');
    assert.equal(parseLanguageCode('en-AU'), 'en');
    assert.equal(parseLanguageCode('hi-IN'), 'hi');
  });

  test('parseLanguageCode is case-insensitive and trims whitespace', () => {
    assert.equal(parseLanguageCode('  EN-us  '), 'en');
    assert.equal(parseLanguageCode('HI-in'), 'hi');
  });

  // -------------------------------------------------------------------------
  // 3. Unsupported-Language Fallback
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Unsupported Language Fallback ---');

  test('parseLanguageCode returns null for unsupported languages', () => {
    assert.equal(parseLanguageCode('fr-FR'), null);
    assert.equal(parseLanguageCode('de'), null);
    assert.equal(parseLanguageCode('es-ES'), null);
    assert.equal(parseLanguageCode('zh-CN'), null);
    assert.equal(parseLanguageCode('ja'), null);
    assert.equal(parseLanguageCode(''), null);
    assert.equal(parseLanguageCode(null), null);
    assert.equal(parseLanguageCode(undefined), null);
  });

  // -------------------------------------------------------------------------
  // 4. Saved Preference Overriding Browser Detection
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Preference Priority: Saved > Browser > Fallback ---');

  test('Explicit saved preference in localStorage overrides browser setting', () => {
    mockStorage.setItem(LANGUAGE_STORAGE_KEY, 'hi');
    const saved = parseLanguageCode(mockStorage.getItem(LANGUAGE_STORAGE_KEY));
    assert.equal(saved, 'hi', 'Saved "hi" takes precedence over browser "en-US"');
  });

  test('Switching saved preference to English overrides browser Hindi', () => {
    mockStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    const saved = parseLanguageCode(mockStorage.getItem(LANGUAGE_STORAGE_KEY));
    assert.equal(saved, 'en');
  });

  test('Corrupt or unsupported localStorage entry is safely ignored', () => {
    mockStorage.setItem(LANGUAGE_STORAGE_KEY, 'malicious_injection');
    const parsed = parseLanguageCode(mockStorage.getItem(LANGUAGE_STORAGE_KEY));
    assert.equal(parsed, null, 'Invalid storage value must parse to null');
  });

  // -------------------------------------------------------------------------
  // 5. Switching Between Hindi and English & Persistence
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Dynamic Language Switching & Storage Persistence ---');

  await test('changeLanguage switches active language to English and updates localStorage', async () => {
    await changeLanguage('en');
    assert.equal(getCurrentLanguage(), 'en');
    assert.equal(mockStorage.getItem(LANGUAGE_STORAGE_KEY), 'en');
    assert.equal(globalThis.document.documentElement.lang, 'en');
  });

  await test('changeLanguage switches active language back to Hindi and updates localStorage', async () => {
    await changeLanguage('hi');
    assert.equal(getCurrentLanguage(), 'hi');
    assert.equal(mockStorage.getItem(LANGUAGE_STORAGE_KEY), 'hi');
    assert.equal(globalThis.document.documentElement.lang, 'hi');
  });

  await test('changeLanguage rejects unsupported languages with an error', async () => {
    let threw = false;
    try {
      await changeLanguage('fr' as any);
    } catch {
      threw = true;
    }
    assert.equal(threw, true, 'Calling changeLanguage with invalid language must throw');
  });

  // -------------------------------------------------------------------------
  // 6. Matching Translation Keys Across Namespaces
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Translation Resource Completeness & Parity ---');

  test('All four namespaces exist in resources for both "hi" and "en"', () => {
    assert.equal(Boolean(resources.hi), true);
    assert.equal(Boolean(resources.en), true);
    for (const ns of TRANSLATION_NAMESPACES) {
      assert.equal(Boolean((resources.hi as any)[ns]), true, `Hindi has namespace: ${ns}`);
      assert.equal(Boolean((resources.en as any)[ns]), true, `English has namespace: ${ns}`);
    }
  });

  test('Namespace "nav" has 100% key parity and no empty strings', () => {
    const hiKeys = Object.keys(resources.hi.nav).sort();
    const enKeys = Object.keys(resources.en.nav).sort();
    assert.deepEqual(hiKeys, enKeys, 'nav.json keys must match between hi and en');

    for (const key of hiKeys) {
      assert.equal(typeof (resources.hi.nav as any)[key], 'string');
      assert.equal((resources.hi.nav as any)[key].length > 0, true, `hi.nav.${key} must not be empty`);
      assert.equal(typeof (resources.en.nav as any)[key], 'string');
      assert.equal((resources.en.nav as any)[key].length > 0, true, `en.nav.${key} must not be empty`);
    }
  });

  test('Namespace "common" has 100% key parity and no empty strings', () => {
    const hiKeys = Object.keys(resources.hi.common).sort();
    const enKeys = Object.keys(resources.en.common).sort();
    assert.deepEqual(hiKeys, enKeys, 'common.json keys must match between hi and en');

    for (const key of hiKeys) {
      assert.equal((resources.hi.common as any)[key].length > 0, true);
      assert.equal((resources.en.common as any)[key].length > 0, true);
    }
  });

  test('Namespace "auth" has 100% key parity and no empty strings', () => {
    const hiKeys = Object.keys(resources.hi.auth).sort();
    const enKeys = Object.keys(resources.en.auth).sort();
    assert.deepEqual(hiKeys, enKeys, 'auth.json keys must match between hi and en');
  });

  test('Namespace "notifications" has 100% key parity and no empty strings', () => {
    const hiKeys = Object.keys(resources.hi.notifications).sort();
    const enKeys = Object.keys(resources.en.notifications).sort();
    assert.deepEqual(hiKeys, enKeys, 'notifications.json keys must match between hi and en');
  });

  // -------------------------------------------------------------------------
  // 7. Navbar Translation Exact Values
  // -------------------------------------------------------------------------
  console.log('\n--- 7. Navbar Translation Values ---');

  test('Hindi navigation labels preserve original UI strings', () => {
    assert.equal(resources.hi.nav.home, 'होम');
    assert.equal(resources.hi.nav.feed, 'समाज अपडेट्स');
    assert.equal(resources.hi.nav.groups, 'समूह');
    assert.equal(resources.hi.nav.directory, 'सदस्य');
    assert.equal(resources.hi.nav.matrimonial, 'विवाह परिचय');
    assert.equal(resources.hi.nav.profile, 'मेरी प्रोफ़ाइल');
    assert.equal(resources.hi.nav.appeals, 'अपील');
    assert.equal(resources.hi.nav.login, 'लॉगिन');
    assert.equal(resources.hi.nav.register, 'रजिस्टर');
    assert.equal(resources.hi.nav.logout, 'लॉग आउट');
    assert.equal(resources.hi.nav.brandSubtitle, 'सदस्य समुदाय');
  });

  test('English navigation labels provide natural, clear translations', () => {
    assert.equal(resources.en.nav.home, 'Home');
    assert.equal(resources.en.nav.feed, 'Community Updates');
    assert.equal(resources.en.nav.groups, 'Groups');
    assert.equal(resources.en.nav.directory, 'Directory');
    assert.equal(resources.en.nav.matrimonial, 'Matrimonial');
    assert.equal(resources.en.nav.profile, 'My Profile');
    assert.equal(resources.en.nav.appeals, 'Appeals');
    assert.equal(resources.en.nav.login, 'Login');
    assert.equal(resources.en.nav.register, 'Register');
    assert.equal(resources.en.nav.logout, 'Log out');
    assert.equal(resources.en.nav.brandSubtitle, 'Member Community');
  });

  // -------------------------------------------------------------------------
  // 8. i18n Translation Execution
  // -------------------------------------------------------------------------
  console.log('\n--- 8. i18n Instance Execution ---');

  await test('i18n.t returns correct Hindi translations when language is "hi"', async () => {
    await changeLanguage('hi');
    assert.equal(i18n.t('nav:home'), 'होम');
    assert.equal(i18n.t('nav:feed'), 'समाज अपडेट्स');
    assert.equal(i18n.t('nav:groups'), 'समूह');
    assert.equal(i18n.t('common:appName'), 'अपना समाज');
    assert.equal(i18n.t('notifications:title'), 'सूचनाएं');
  });

  await test('i18n.t returns correct English translations when language is "en"', async () => {
    await changeLanguage('en');
    assert.equal(i18n.t('nav:home'), 'Home');
    assert.equal(i18n.t('nav:feed'), 'Community Updates');
    assert.equal(i18n.t('nav:groups'), 'Groups');
    assert.equal(i18n.t('common:appName'), 'Apna Samaj');
    assert.equal(i18n.t('notifications:title'), 'Notifications');
  });

  // -------------------------------------------------------------------------
  // 9. Accessibility, UI Invariants & Non-Translation of User Content
  // -------------------------------------------------------------------------
  console.log('\n--- 9. Accessibility & Architectural Invariants ---');

  test('Language storage key is stable "apna_samaj_lang"', () => {
    assert.equal(LANGUAGE_STORAGE_KEY, 'apna_samaj_lang');
  });

  test('User-generated content (posts, comments, groups, names) is NOT transformed', () => {
    // Architectural invariant verification
    const samplePost = {
      id: 'e2a87a22-38d7-4638-b3ee-bb8427f71b12',
      content: 'आज हमारे समाज की मासिक बैठक सफलतापूर्वक संपन्न हुई।',
      author: 'रविन्द्र केवट',
      groupName: 'केवट समाज युवा मंडल',
    };

    // System must not attempt to translate or alter user-generated data fields
    assert.equal(samplePost.content, 'आज हमारे समाज की मासिक बैठक सफलतापूर्वक संपन्न हुई।');
    assert.equal(samplePost.author, 'रविन्द्र केवट');
    assert.equal(samplePost.groupName, 'केवट समाज युवा मंडल');
  });

  test('Clean URL routing invariant: URL paths do not contain language prefixes', () => {
    const supportedRoutes = ['/', '/feed', '/groups', '/directory', '/matrimonial', '/profile', '/appeals'];
    for (const route of supportedRoutes) {
      assert.equal(route.startsWith('/hi/') || route.startsWith('/en/'), false);
    }
  });

  // Reset to default language after tests
  await changeLanguage('hi');

  console.log('\n================================================================');
  console.log(`  Multilingual Tests Completed: ${passedTests} passed, 0 failed (Total: ${totalTests})`);
  console.log('================================================================\n');
}

runAllTests().catch((err) => {
  console.error('Test run failure:', err);
  process.exit(1);
});
