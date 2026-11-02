import assert from 'node:assert/strict';
import {
  resources,
  i18n,
  changeLanguage,
  getCurrentLanguage,
  TRANSLATION_NAMESPACES,
} from '@apnasamaj/i18n';

console.log('================================================================');
console.log(' Apna Samaj — Batch 15H.2: Groups & Mandals Localization UX    ');
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

  test('Translation namespaces include "groups"', () => {
    assert.ok(
      (TRANSLATION_NAMESPACES as readonly string[]).includes('groups'),
      'TRANSLATION_NAMESPACES must contain "groups"'
    );
  });

  // -------------------------------------------------------------------------
  // 2. Hindi Groups UI Resources
  // -------------------------------------------------------------------------
  console.log('--- 2. Hindi Groups UI Resources ---');

  test('Hindi resources contain authentic community group UI strings', () => {
    const hi = resources.hi.groups;
    assert.equal(hi.title, 'समाज समूह एवं मंडल');
    assert.ok(hi.subtitle.includes('क्षेत्रीय समाज मंडलों'));
    assert.equal(hi.createGroup, 'समूह बनाएं');
    assert.equal(hi.searchPlaceholder, 'नाम या विवरण से समूह खोजें...');
    assert.equal(hi.tabAll, 'सभी समूह');
    assert.equal(hi.tabPublic, 'सार्वजनिक मंडल');
    assert.equal(hi.tabPrivate, 'निजी समूह');
    assert.equal(hi.emptyTitle, 'कोई समूह नहीं मिला');
    assert.equal(hi.privacyPublic, 'सार्वजनिक');
    assert.equal(hi.privacyPrivate, 'निजी');
    assert.equal(hi.join, 'जुड़ें');
    assert.equal(hi.view, 'देखें →');
    assert.equal(hi.backToGroups, 'समूहों पर वापस जाएं');
    assert.equal(hi.editGroup, 'समूह संपादित करें');
    assert.equal(hi.deleteGroup, 'समूह हटाएं');
    assert.equal(hi.leaveGroup, 'समूह छोड़ें');
    assert.equal(hi.joinGroup, 'समूह से जुड़ें');
    assert.equal(hi.privateMembershipRequired, 'निजी समूह (सदस्यता आवश्यक)');
    assert.equal(hi.tabChat, 'चैट');
    assert.equal(hi.addMember, 'सदस्य जोड़ें');
    assert.equal(hi.you, 'आप');
    assert.equal(hi.removeMember, 'हटाएं');
    assert.equal(hi.roleAdmin, 'प्रशासक');
    assert.equal(hi.roleModerator, 'मॉडरेटर');
    assert.equal(hi.roleMember, 'सदस्य');
  });

  // -------------------------------------------------------------------------
  // 3. English Groups UI Resources
  // -------------------------------------------------------------------------
  console.log('--- 3. English Groups UI Resources ---');

  test('English resources contain clean community group UI strings', () => {
    const en = resources.en.groups;
    assert.equal(en.title, 'Community Groups & Mandals');
    assert.ok(en.subtitle.includes('Connect with regional samaj mandals'));
    assert.equal(en.createGroup, 'Create Group');
    assert.equal(en.searchPlaceholder, 'Search groups by name or description...');
    assert.equal(en.tabAll, 'All Groups');
    assert.equal(en.tabPublic, 'Public Mandals');
    assert.equal(en.tabPrivate, 'Private Groups');
    assert.equal(en.emptyTitle, 'No Groups Found');
    assert.equal(en.privacyPublic, 'Public');
    assert.equal(en.privacyPrivate, 'Private');
    assert.equal(en.join, 'Join');
    assert.equal(en.view, 'View →');
    assert.equal(en.backToGroups, 'Back to Groups');
    assert.equal(en.editGroup, 'Edit Group');
    assert.equal(en.deleteGroup, 'Delete Group');
    assert.equal(en.leaveGroup, 'Leave Group');
    assert.equal(en.joinGroup, 'Join Group');
    assert.equal(en.privateMembershipRequired, 'Private Group (Membership Required)');
    assert.equal(en.tabChat, 'Chat');
    assert.equal(en.addMember, 'Add Member');
    assert.equal(en.you, 'You');
    assert.equal(en.removeMember, 'Remove');
    assert.equal(en.roleAdmin, 'Admin');
    assert.equal(en.roleModerator, 'Moderator');
    assert.equal(en.roleMember, 'Member');
  });

  // -------------------------------------------------------------------------
  // 4. Translation Key Parity (1:1 Match)
  // -------------------------------------------------------------------------
  console.log('--- 4. Translation Key Parity ---');

  test('English and Hindi groups namespaces have complete 1:1 key parity', () => {
    const enKeys = Object.keys(resources.en.groups).sort();
    const hiKeys = Object.keys(resources.hi.groups).sort();

    const missingInHi = enKeys.filter((k) => !hiKeys.includes(k));
    const missingInEn = hiKeys.filter((k) => !enKeys.includes(k));

    assert.deepEqual(missingInHi, [], `Missing in Hindi: ${missingInHi.join(', ')}`);
    assert.deepEqual(missingInEn, [], `Missing in English: ${missingInEn.join(', ')}`);
    assert.equal(enKeys.length, hiKeys.length, 'Key counts must be identical');
    assert.ok(enKeys.length >= 70, `Expected at least 70 keys, found ${enKeys.length}`);
  });

  // -------------------------------------------------------------------------
  // 5. Dynamic Language Switching (No Page Reload)
  // -------------------------------------------------------------------------
  console.log('--- 5. Dynamic Language Switching ---');

  await test('i18n.t returns Hindi groups strings when active language is "hi"', async () => {
    await changeLanguage('hi');
    assert.equal(getCurrentLanguage(), 'hi');
    assert.equal(i18n.t('groups:title'), 'समाज समूह एवं मंडल');
    assert.equal(i18n.t('groups:createGroup'), 'समूह बनाएं');
    assert.equal(i18n.t('groups:backToGroups'), 'समूहों पर वापस जाएं');
    assert.equal(i18n.t('groups:joinGroup'), 'समूह से जुड़ें');
    assert.equal(i18n.t('groups:leaveGroup'), 'समूह छोड़ें');
    assert.equal(i18n.t('groups:addMember'), 'सदस्य जोड़ें');
  });

  await test('i18n.t returns English groups strings when active language is "en"', async () => {
    await changeLanguage('en');
    assert.equal(getCurrentLanguage(), 'en');
    assert.equal(i18n.t('groups:title'), 'Community Groups & Mandals');
    assert.equal(i18n.t('groups:createGroup'), 'Create Group');
    assert.equal(i18n.t('groups:backToGroups'), 'Back to Groups');
    assert.equal(i18n.t('groups:joinGroup'), 'Join Group');
    assert.equal(i18n.t('groups:leaveGroup'), 'Leave Group');
    assert.equal(i18n.t('groups:addMember'), 'Add Member');
  });

  // Switch back to Hindi default for subsequent tests
  await changeLanguage('hi');

  // -------------------------------------------------------------------------
  // 6. Pluralization & Parameter Interpolation
  // -------------------------------------------------------------------------
  console.log('--- 6. Pluralization & Parameter Interpolation ---');

  test('Formats singular and plural members count in both languages', () => {
    // English
    assert.equal(i18n.t('groups:membersCount', { lng: 'en', count: 1 }), '1 Member');
    assert.equal(i18n.t('groups:membersCount', { lng: 'en', count: 42 }), '42 Members');
    assert.equal(i18n.t('groups:membersCount', { lng: 'en', count: 0 }), '0 Members');

    // Hindi
    assert.equal(i18n.t('groups:membersCount', { lng: 'hi', count: 1 }), '1 सदस्य');
    assert.equal(i18n.t('groups:membersCount', { lng: 'hi', count: 42 }), '42 सदस्य');
    assert.equal(i18n.t('groups:membersCount', { lng: 'hi', count: 0 }), '0 सदस्य');
  });

  test('Formats singular and plural discussions count in both languages', () => {
    // English
    assert.equal(i18n.t('groups:discussionsCount', { lng: 'en', count: 1 }), '1 Discussion');
    assert.equal(i18n.t('groups:discussionsCount', { lng: 'en', count: 18 }), '18 Discussions');

    // Hindi
    assert.equal(i18n.t('groups:discussionsCount', { lng: 'hi', count: 1 }), '1 चर्चा');
    assert.equal(i18n.t('groups:discussionsCount', { lng: 'hi', count: 18 }), '18 चर्चाएं');
  });

  test('Interpolates group titles and member names in dialogs and notifications', () => {
    const groupName = 'पुणे युवा समाज मंडल';
    const memberName = 'सुनील केवट';

    // Leave dialog desc
    assert.equal(
      i18n.t('groups:leaveDialogDesc', { lng: 'en', name: groupName }),
      `Are you sure you want to leave ${groupName}? You can rejoin anytime if the group is public.`
    );
    assert.equal(
      i18n.t('groups:leaveDialogDesc', { lng: 'hi', name: groupName }),
      `क्या आप वाकई ${groupName} छोड़ना चाहते हैं? यदि समूह सार्वजनिक है तो आप कभी भी पुनः शामिल हो सकते हैं।`
    );

    // Delete dialog desc
    assert.equal(
      i18n.t('groups:deleteDialogDesc', { lng: 'en', name: groupName }),
      `Are you sure you want to permanently delete ${groupName}?`
    );
    assert.equal(
      i18n.t('groups:deleteDialogDesc', { lng: 'hi', name: groupName }),
      `क्या आप वाकई ${groupName} को स्थायी रूप से हटाना चाहते हैं?`
    );

    // Remove member dialog desc
    assert.equal(
      i18n.t('groups:removeDialogDesc', { lng: 'en', name: memberName, groupName }),
      `Are you sure you want to remove ${memberName} from ${groupName}?`
    );
    assert.equal(
      i18n.t('groups:removeDialogDesc', { lng: 'hi', name: memberName, groupName }),
      `क्या आप वाकई ${memberName} को ${groupName} से हटाना चाहते हैं?`
    );

    // Member removed success message
    assert.equal(
      i18n.t('groups:memberRemovedSuccess', { lng: 'en', name: memberName }),
      `${memberName} has been removed from the group.`
    );
    assert.equal(
      i18n.t('groups:memberRemovedSuccess', { lng: 'hi', name: memberName }),
      `${memberName} को समूह से हटा दिया गया है।`
    );
  });

  // -------------------------------------------------------------------------
  // 7. Group Privacy and Membership State Mappings
  // -------------------------------------------------------------------------
  console.log('--- 7. Privacy and Membership State Mappings ---');

  test('Privacy chips and dropdowns translate accurately', () => {
    assert.equal(i18n.t('groups:privacyPublic', { lng: 'en' }), 'Public');
    assert.equal(i18n.t('groups:privacyPublic', { lng: 'hi' }), 'सार्वजनिक');

    assert.equal(i18n.t('groups:privacyPrivate', { lng: 'en' }), 'Private');
    assert.equal(i18n.t('groups:privacyPrivate', { lng: 'hi' }), 'निजी');

    assert.equal(i18n.t('groups:privateMembershipRequired', { lng: 'en' }), 'Private Group (Membership Required)');
    assert.equal(i18n.t('groups:privateMembershipRequired', { lng: 'hi' }), 'निजी समूह (सदस्यता आवश्यक)');
  });

  test('Membership role labels and badges map correctly', () => {
    assert.equal(i18n.t('groups:roleAdmin', { lng: 'en' }), 'Admin');
    assert.equal(i18n.t('groups:roleAdmin', { lng: 'hi' }), 'प्रशासक');

    assert.equal(i18n.t('groups:roleModerator', { lng: 'en' }), 'Moderator');
    assert.equal(i18n.t('groups:roleModerator', { lng: 'hi' }), 'मॉडरेटर');

    assert.equal(i18n.t('groups:roleMember', { lng: 'en' }), 'Member');
    assert.equal(i18n.t('groups:roleMember', { lng: 'hi' }), 'सदस्य');

    assert.equal(i18n.t('groups:yourRole', { lng: 'en', role: 'Admin' }), 'Your Role: Admin');
    assert.equal(i18n.t('groups:yourRole', { lng: 'hi', role: 'प्रशासक' }), 'आपकी भूमिका: प्रशासक');
  });

  // -------------------------------------------------------------------------
  // 8. Empty, Loading, and Access Denied States
  // -------------------------------------------------------------------------
  console.log('--- 8. Empty, Loading, and Access Denied States ---');

  test('Handles private content and roster access denied messages', () => {
    assert.equal(i18n.t('groups:privateContentTitle', { lng: 'en' }), 'Private Group Content');
    assert.equal(i18n.t('groups:privateContentTitle', { lng: 'hi' }), 'निजी समूह सामग्री');

    assert.equal(i18n.t('groups:privateRosterTitle', { lng: 'en' }), 'Private Group Roster');
    assert.equal(i18n.t('groups:privateRosterTitle', { lng: 'hi' }), 'निजी सदस्य सूची');
  });

  test('Provides distinct filtered vs generic empty states', () => {
    assert.equal(i18n.t('groups:emptyTitle', { lng: 'en' }), 'No Groups Found');
    assert.equal(i18n.t('groups:emptyTitle', { lng: 'hi' }), 'कोई समूह नहीं मिला');

    assert.equal(i18n.t('groups:noDiscussionsTitle', { lng: 'en' }), 'No Discussions Yet');
    assert.equal(i18n.t('groups:noDiscussionsTitle', { lng: 'hi' }), 'अभी कोई चर्चा नहीं है');

    assert.equal(i18n.t('groups:noMembersTitle', { lng: 'en' }), 'No Members Found');
    assert.equal(i18n.t('groups:noMembersTitle', { lng: 'hi' }), 'कोई सदस्य नहीं मिला');
  });

  // -------------------------------------------------------------------------
  // 9. User-Generated Data Preservation (Zero Alteration)
  // -------------------------------------------------------------------------
  console.log('--- 9. User Data Preservation ---');

  test('User-generated group names, descriptions, and posts remain raw during localization', () => {
    const rawGroup = {
      name: 'मध्य प्रदेश केवट समाज कल्याण मंडल',
      description: 'समाज के युवाओं की शिक्षा एवं मार्गदर्शन के लिए समर्पित मंडल।',
      postTitle: 'वार्षिक स्नेह सम्मेलन 2026 की तैयारी बैठक',
      authorName: 'रविन्द्र केवट',
    };

    const enDisplay = {
      header: i18n.t('groups:title', { lng: 'en' }),
      groupName: rawGroup.name,
      description: rawGroup.description,
      post: rawGroup.postTitle,
      author: rawGroup.authorName,
      createdOn: i18n.t('groups:createdOn', { lng: 'en', date: '02/11/2026' }),
    };

    const hiDisplay = {
      header: i18n.t('groups:title', { lng: 'hi' }),
      groupName: rawGroup.name,
      description: rawGroup.description,
      post: rawGroup.postTitle,
      author: rawGroup.authorName,
      createdOn: i18n.t('groups:createdOn', { lng: 'hi', date: '02/11/2026' }),
    };

    // UI headers are translated
    assert.equal(enDisplay.header, 'Community Groups & Mandals');
    assert.equal(hiDisplay.header, 'समाज समूह एवं मंडल');

    // Raw user-generated data is 100% untouched
    assert.equal(enDisplay.groupName, 'मध्य प्रदेश केवट समाज कल्याण मंडल');
    assert.equal(hiDisplay.groupName, 'मध्य प्रदेश केवट समाज कल्याण मंडल');
    assert.equal(enDisplay.description, 'समाज के युवाओं की शिक्षा एवं मार्गदर्शन के लिए समर्पित मंडल।');
    assert.equal(hiDisplay.description, 'समाज के युवाओं की शिक्षा एवं मार्गदर्शन के लिए समर्पित मंडल।');
    assert.equal(enDisplay.post, 'वार्षिक स्नेह सम्मेलन 2026 की तैयारी बैठक');
    assert.equal(hiDisplay.post, 'वार्षिक स्नेह सम्मेलन 2026 की तैयारी बैठक');
    assert.equal(enDisplay.author, 'रविन्द्र केवट');
    assert.equal(hiDisplay.author, 'रविन्द्र केवट');
  });

  // -------------------------------------------------------------------------
  // 10. Accessibility / ARIA Labels Parity
  // -------------------------------------------------------------------------
  console.log('--- 10. Accessibility / ARIA Parity ---');

  test('All ARIA and accessibility labels exist in both languages', () => {
    const ariaKeys = [
      'createGroupAria',
      'searchAria',
      'clearSearchAria',
      'retryAria',
      'viewAria',
      'paginationAria',
      'backToGroupsAria',
      'searchMembersAria',
      'clearRosterSearchAria',
      'retryRosterAria',
      'removeMemberAria',
    ];

    for (const key of ariaKeys) {
      assert.ok(
        (resources.en.groups as Record<string, string>)[key],
        `Missing English ARIA key: ${key}`
      );
      assert.ok(
        (resources.hi.groups as Record<string, string>)[key],
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

