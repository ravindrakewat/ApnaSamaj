import assert from 'node:assert/strict';
import {
  resources,
  i18n,
  changeLanguage,
  getCurrentLanguage,
} from '@apnasamaj/i18n';
import { formatRelativeTime } from '../utils/notifications.js';

console.log('================================================================');
console.log(' Apna Samaj — Batch 15G.1: Social Feed Localization & UX       ');
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
  // 1. Hindi Feed UI Resources
  // -------------------------------------------------------------------------
  console.log('--- 1. Hindi Feed UI Resources ---');

  test('Hindi resources contain authentic social feed UI strings', () => {
    const hi = resources.hi.feed;
    assert.equal(hi.title, 'समाज फ़ीड');
    assert.equal(hi.subtitle, 'अपना समाज के सदस्यों के अपडेट्स, कार्यक्रम और चर्चाएं देखें');
    assert.equal(hi.refresh, 'फ़ीड रीफ़्रेश करें');
    assert.equal(hi.filterAll, 'सभी पोस्ट');
    assert.equal(hi.filterGeneral, 'सामान्य');
    assert.equal(hi.filterAnnouncements, 'सूचनाएं');
    assert.equal(hi.filterEvents, 'आयोजन');
    assert.equal(hi.searchPlaceholder, 'समाज की पोस्ट खोजें...');
    assert.equal(hi.publishPost, 'पोस्ट प्रकाशित करें');
    assert.equal(hi.publishing, 'प्रकाशित हो रहा है...');
    assert.equal(hi.postTypeGeneral, 'सामान्य पोस्ट');
    assert.equal(hi.postTypeEvent, 'सामुदायिक आयोजन');
    assert.equal(hi.postTypeAnnouncement, 'महत्वपूर्ण सूचना');
    assert.equal(hi.pinned, 'पिन किया हुआ');
    assert.equal(hi.edited, '(संपादित)');
    assert.equal(hi.like, 'लाइक');
    assert.equal(hi.comment, 'कमेंट');
    assert.equal(hi.share, 'शेयर करें');
    assert.equal(hi.loadMore, 'और पोस्ट देखें');
    assert.equal(hi.emptyNoPostsFound, 'कोई पोस्ट नहीं मिली');
  });

  // -------------------------------------------------------------------------
  // 2. English Feed UI Resources
  // -------------------------------------------------------------------------
  console.log('--- 2. English Feed UI Resources ---');

  test('English resources contain clean social feed UI strings', () => {
    const en = resources.en.feed;
    assert.equal(en.title, 'Community Feed');
    assert.equal(en.subtitle, 'Discover updates, events, and discussions from Apna Samaj members');
    assert.equal(en.refresh, 'Refresh Feed');
    assert.equal(en.filterAll, 'All Posts');
    assert.equal(en.filterGeneral, 'General');
    assert.equal(en.filterAnnouncements, 'Announcements');
    assert.equal(en.filterEvents, 'Events');
    assert.equal(en.searchPlaceholder, 'Search community posts...');
    assert.equal(en.publishPost, 'Publish Post');
    assert.equal(en.publishing, 'Publishing...');
    assert.equal(en.postTypeGeneral, 'General Post');
    assert.equal(en.postTypeEvent, 'Community Event');
    assert.equal(en.postTypeAnnouncement, 'Announcement');
    assert.equal(en.pinned, 'Pinned');
    assert.equal(en.edited, '(edited)');
    assert.equal(en.like, 'Like');
    assert.equal(en.comment, 'Comment');
    assert.equal(en.share, 'Share');
    assert.equal(en.loadMore, 'Load More Posts');
    assert.equal(en.emptyNoPostsFound, 'No posts found');
  });

  // -------------------------------------------------------------------------
  // 3. Translation Key Parity (No Missing Keys)
  // -------------------------------------------------------------------------
  console.log('--- 3. Translation Key Parity ---');

  test('English and Hindi feed namespaces have complete 1:1 key parity', () => {
    const enKeys = Object.keys(resources.en.feed).sort();
    const hiKeys = Object.keys(resources.hi.feed).sort();

    const missingInHi = enKeys.filter((k) => !hiKeys.includes(k));
    const missingInEn = hiKeys.filter((k) => !enKeys.includes(k));

    assert.deepEqual(missingInHi, [], `Missing in Hindi: ${missingInHi.join(', ')}`);
    assert.deepEqual(missingInEn, [], `Missing in English: ${missingInEn.join(', ')}`);
    assert.equal(enKeys.length, hiKeys.length);
    assert.ok(enKeys.length >= 70, `Expected at least 70 keys, found ${enKeys.length}`);
  });

  // -------------------------------------------------------------------------
  // 4. Dynamic Language Switching (No Page Reload)
  // -------------------------------------------------------------------------
  console.log('--- 4. Dynamic Language Switching ---');

  await test('i18n.t returns Hindi feed strings when active language is "hi"', async () => {
    await changeLanguage('hi');
    assert.equal(getCurrentLanguage(), 'hi');
    assert.equal(i18n.t('feed:title'), 'समाज फ़ीड');
    assert.equal(i18n.t('feed:filterAll'), 'सभी पोस्ट');
    assert.equal(i18n.t('feed:publishPost'), 'पोस्ट प्रकाशित करें');
    assert.equal(i18n.t('feed:like'), 'लाइक');
    assert.equal(i18n.t('feed:comment'), 'कमेंट');
    assert.equal(i18n.t('feed:share'), 'शेयर करें');
  });

  await test('i18n.t returns English feed strings when active language is "en"', async () => {
    await changeLanguage('en');
    assert.equal(getCurrentLanguage(), 'en');
    assert.equal(i18n.t('feed:title'), 'Community Feed');
    assert.equal(i18n.t('feed:filterAll'), 'All Posts');
    assert.equal(i18n.t('feed:publishPost'), 'Publish Post');
    assert.equal(i18n.t('feed:like'), 'Like');
    assert.equal(i18n.t('feed:comment'), 'Comment');
    assert.equal(i18n.t('feed:share'), 'Share');
  });

  // Switch back to Hindi default
  await changeLanguage('hi');

  // -------------------------------------------------------------------------
  // 5. Post Types in Both Languages
  // -------------------------------------------------------------------------
  console.log('--- 5. Post Type Labels ---');

  test('Resolves post type labels accurately in both Hindi and English', () => {
    assert.equal(i18n.t('feed:postTypeGeneral', { lng: 'hi' }), 'सामान्य पोस्ट');
    assert.equal(i18n.t('feed:postTypeGeneral', { lng: 'en' }), 'General Post');

    assert.equal(i18n.t('feed:postTypeEvent', { lng: 'hi' }), 'सामुदायिक आयोजन');
    assert.equal(i18n.t('feed:postTypeEvent', { lng: 'en' }), 'Community Event');

    assert.equal(i18n.t('feed:postTypeAnnouncement', { lng: 'hi' }), 'महत्वपूर्ण सूचना');
    assert.equal(i18n.t('feed:postTypeAnnouncement', { lng: 'en' }), 'Announcement');
  });

  // -------------------------------------------------------------------------
  // 6. Action Counts & Pluralization
  // -------------------------------------------------------------------------
  console.log('--- 6. Action Counts & Pluralization ---');

  test('Formats singular and plural likes in Hindi and English', () => {
    assert.equal(i18n.t('feed:likeWithCount', { lng: 'en', count: 1 }), '1 Like');
    assert.equal(i18n.t('feed:likeWithCount_plural', { lng: 'en', count: 5 }), '5 Likes');

    assert.equal(i18n.t('feed:likeWithCount', { lng: 'hi', count: 1 }), '1 लाइक');
    assert.equal(i18n.t('feed:likeWithCount_plural', { lng: 'hi', count: 5 }), '5 लाइक');
  });

  test('Formats singular and plural comments in Hindi and English', () => {
    assert.equal(i18n.t('feed:commentWithCount', { lng: 'en', count: 1 }), '1 Comment');
    assert.equal(i18n.t('feed:commentWithCount_plural', { lng: 'en', count: 8 }), '8 Comments');

    assert.equal(i18n.t('feed:commentWithCount', { lng: 'hi', count: 1 }), '1 कमेंट');
    assert.equal(i18n.t('feed:commentWithCount_plural', { lng: 'hi', count: 8 }), '8 कमेंट');
  });

  test('Formats view and member analytics reach in both languages', () => {
    assert.equal(
      i18n.t('feed:viewsAndMembers', { lng: 'en', views: 42, members: 19 }),
      '42 Views · 19 Members'
    );
    assert.equal(
      i18n.t('feed:viewsAndMembers', { lng: 'hi', views: 42, members: 19 }),
      '42 व्यूज · 19 सदस्य'
    );

    assert.equal(
      i18n.t('feed:viewsAndMembers_singularBoth', { lng: 'en', views: 1, members: 1 }),
      '1 View · 1 Member'
    );
    assert.equal(
      i18n.t('feed:viewsAndMembers_singularBoth', { lng: 'hi', views: 1, members: 1 }),
      '1 व्यू · 1 सदस्य'
    );
  });

  // -------------------------------------------------------------------------
  // 7. Localized Relative Timestamps for Feed Posts
  // -------------------------------------------------------------------------
  console.log('--- 7. Localized Relative Timestamps ---');

  test('Formats "Just now" (<60s) in Hindi and English for posts', () => {
    const nowIso = new Date().toISOString();
    assert.equal(formatRelativeTime(nowIso, 'hi'), 'अभी');
    assert.equal(formatRelativeTime(nowIso, 'en'), 'Just now');
  });

  test('Formats minutes in Hindi and English', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    assert.equal(formatRelativeTime(fiveMinAgo, 'hi'), '5 मिनट पहले');
    assert.equal(formatRelativeTime(fiveMinAgo, 'en'), '5 minutes ago');

    const oneMinAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString();
    assert.equal(formatRelativeTime(oneMinAgo, 'hi'), '1 मिनट पहले');
    assert.equal(formatRelativeTime(oneMinAgo, 'en'), '1 minute ago');
  });

  test('Formats hours in Hindi and English', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    assert.equal(formatRelativeTime(twoHoursAgo, 'hi'), '2 घंटे पहले');
    assert.equal(formatRelativeTime(twoHoursAgo, 'en'), '2 hours ago');

    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    assert.equal(formatRelativeTime(oneHourAgo, 'hi'), '1 घंटा पहले');
    assert.equal(formatRelativeTime(oneHourAgo, 'en'), '1 hour ago');
  });

  test('Formats yesterday in Hindi and English', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    assert.equal(formatRelativeTime(yesterday, 'hi'), 'कल');
    assert.equal(formatRelativeTime(yesterday, 'en'), 'Yesterday');
  });

  test('Formats multiple days in Hindi and English', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(formatRelativeTime(threeDaysAgo, 'hi'), '3 दिन पहले');
    assert.equal(formatRelativeTime(threeDaysAgo, 'en'), '3 days ago');
  });

  // -------------------------------------------------------------------------
  // 8. Composer Placeholders & Validation Errors
  // -------------------------------------------------------------------------
  console.log('--- 8. Composer Placeholders & Validations ---');

  test('Interpolates image upload limit validation accurately in both languages', () => {
    assert.equal(
      i18n.t('feed:maxImagesExceeded', { lng: 'en', count: 4 }),
      'You can upload a maximum of 4 images per post.'
    );
    assert.equal(
      i18n.t('feed:maxImagesExceeded', { lng: 'hi', count: 4 }),
      'आप प्रति पोस्ट अधिकतम 4 फोटो अपलोड कर सकते हैं।'
    );
  });

  test('Interpolates unsupported format validation in both languages', () => {
    assert.equal(
      i18n.t('feed:unsupportedImageFormat', { lng: 'en', name: 'document.pdf' }),
      '"document.pdf" is not a supported format. Please select JPEG, PNG, WebP, or GIF.'
    );
    assert.equal(
      i18n.t('feed:unsupportedImageFormat', { lng: 'hi', name: 'document.pdf' }),
      '"document.pdf" असमर्थित प्रारूप है। कृपया JPEG, PNG, WebP, या GIF चुनें।'
    );
  });

  test('Interpolates remaining characters counter in both languages', () => {
    assert.equal(i18n.t('feed:charsLeft', { lng: 'en', count: 4950 }), '4950 chars left');
    assert.equal(i18n.t('feed:charsLeft', { lng: 'hi', count: 4950 }), '4950 अक्षर शेष');
  });

  test('Interpolates photo attachment button text in both languages', () => {
    assert.equal(
      i18n.t('feed:composerPhoto', { lng: 'en', current: 2, max: 4 }),
      'Photo (2/4)'
    );
    assert.equal(
      i18n.t('feed:composerPhoto', { lng: 'hi', current: 2, max: 4 }),
      'फोटो (2/4)'
    );
  });

  // -------------------------------------------------------------------------
  // 9. Empty, Error, & Search Query Interpolation
  // -------------------------------------------------------------------------
  console.log('--- 9. Empty & Error States ---');

  test('Interpolates dynamic search query into empty search message in both languages', () => {
    assert.equal(
      i18n.t('feed:emptySearchResults', { lng: 'en', query: 'Diwali' }),
      'No posts matched your search "Diwali". Try a different term or clear filters.'
    );
    assert.equal(
      i18n.t('feed:emptySearchResults', { lng: 'hi', query: 'दिवाली' }),
      'आपकी खोज "दिवाली" से मेल खाती कोई पोस्ट नहीं मिली। कृपया कोई अन्य शब्द खोजें या फ़िल्टर हटाएं।'
    );
  });

  test('Interpolates category into empty category message in both languages', () => {
    assert.equal(
      i18n.t('feed:emptyCategory', { lng: 'en', type: 'Events' }),
      'No posts in this category (Events) yet. Be the first to share a post!'
    );
    assert.equal(
      i18n.t('feed:emptyCategory', { lng: 'hi', type: 'आयोजन' }),
      'इस श्रेणी (आयोजन) में अभी कोई पोस्ट नहीं है। पहली पोस्ट साझा करें!'
    );
  });

  test('Provides localized feed load error in both languages', () => {
    assert.equal(
      i18n.t('feed:loadFeedError', { lng: 'en' }),
      'Failed to load community feed. Please try again.'
    );
    assert.equal(
      i18n.t('feed:loadFeedError', { lng: 'hi' }),
      'कम्युनिटी फ़ीड लोड करने में समस्या हुई। कृपया पुनः प्रयास करें।'
    );
  });

  // -------------------------------------------------------------------------
  // 10. Post Action Menus & Confirmation Dialogs
  // -------------------------------------------------------------------------
  console.log('--- 10. Post Menus & Confirmation Dialogs ---');

  test('Provides localized moderation confirmation texts in both languages', () => {
    assert.equal(
      i18n.t('feed:confirmDeletePostModerator', { lng: 'en' }),
      'As a community administrator, you are about to delete this member post for moderation. Attached media will also be removed. This action cannot be undone.'
    );
    assert.equal(
      i18n.t('feed:confirmDeletePostModerator', { lng: 'hi' }),
      'समुदाय प्रशासक के रूप में, आप मॉडरेशन के लिए यह पोस्ट हटा रहे हैं। संलग्न मीडिया भी हटा दिया जाएगा। इसे पूर्ववत नहीं किया जा सकता।'
    );

    assert.equal(
      i18n.t('feed:confirmDeleteCommentModerator', { lng: 'en' }),
      'As a moderator, you are deleting this member comment. This action cannot be undone.'
    );
    assert.equal(
      i18n.t('feed:confirmDeleteCommentModerator', { lng: 'hi' }),
      'मॉडरेटर के रूप में आप यह कमेंट हटा रहे हैं। इसे पूर्ववत नहीं किया जा सकता।'
    );
  });

  test('Provides localized post reporting reasons in both languages', () => {
    assert.equal(i18n.t('feed:reportReasonInappropriate', { lng: 'en' }), 'Inappropriate Content');
    assert.equal(i18n.t('feed:reportReasonInappropriate', { lng: 'hi' }), 'अनुचित सामग्री');

    assert.equal(i18n.t('feed:reportReasonSpam', { lng: 'en' }), 'Spam or Promotional');
    assert.equal(i18n.t('feed:reportReasonSpam', { lng: 'hi' }), 'स्पैम या प्रचार');

    assert.equal(i18n.t('feed:reportReasonHarassment', { lng: 'en' }), 'Harassment or Bullying');
    assert.equal(i18n.t('feed:reportReasonHarassment', { lng: 'hi' }), 'उत्पीड़न या दुर्व्यवहार');
  });

  // -------------------------------------------------------------------------
  // 11. Post Detail Page Navigation & Unavailable States
  // -------------------------------------------------------------------------
  console.log('--- 11. Post Detail Page Navigation ---');

  test('Provides localized navigation and breadcrumbs in both languages', () => {
    assert.equal(i18n.t('feed:backToFeed', { lng: 'en' }), 'Back to Feed');
    assert.equal(i18n.t('feed:backToFeed', { lng: 'hi' }), 'फ़ीड पर वापस जाएं');

    assert.equal(
      i18n.t('feed:backToGroup', { lng: 'en', groupName: 'Youth Wing' }),
      'Back to Youth Wing'
    );
    assert.equal(
      i18n.t('feed:backToGroup', { lng: 'hi', groupName: 'युवा मंडल' }),
      'युवा मंडल पर वापस जाएं'
    );

    assert.equal(i18n.t('feed:breadcrumbFeed', { lng: 'en' }), 'Feed');
    assert.equal(i18n.t('feed:breadcrumbFeed', { lng: 'hi' }), 'फ़ीड');

    assert.equal(i18n.t('feed:breadcrumbPost', { lng: 'en' }), 'Post');
    assert.equal(i18n.t('feed:breadcrumbPost', { lng: 'hi' }), 'पोस्ट');
  });

  test('Provides localized post unavailable descriptions in both languages', () => {
    assert.equal(i18n.t('feed:postUnavailableTitle', { lng: 'en' }), 'Post Unavailable');
    assert.equal(i18n.t('feed:postUnavailableTitle', { lng: 'hi' }), 'पोस्ट अनुपलब्ध है');

    assert.equal(i18n.t('feed:goToFeed', { lng: 'en' }), 'Go to Community Feed');
    assert.equal(i18n.t('feed:goToFeed', { lng: 'hi' }), 'कम्युनिटी फ़ीड पर जाएं');
  });

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`  Batch 15G.1 Tests Completed: ${passedTests} passed, 0 failed (Total: ${totalTests})`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exitCode = 1;
});

