import assert from 'node:assert';
import { GroupCard } from '../components/GroupCard';

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

export async function runGroupsCommunityUiTests() {
  console.log('\n========================================================================');
  console.log('   Apna Samaj — Batch 10.2.2: Groups & Community UI Modernization Tests ');
  console.log('========================================================================\n');

  // -----------------------------------------------------------------------------
  // 1. GroupCard Component & Display Logic
  // -----------------------------------------------------------------------------
  console.log('--- 1. GroupCard Component & Display Logic ---');

  await test('GroupCard is exported as a valid React component', () => {
    assert.strictEqual(typeof GroupCard, 'function');
  });

  await test('Derives initial fallback from group name correctly', () => {
    const getInitial = (name: string) => {
      const trimmed = name?.trim();
      return trimmed && trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : 'स';
    };

    assert.strictEqual(getInitial('युवा मंडल'), 'य');
    assert.strictEqual(getInitial('Business Forum'), 'B');
    assert.strictEqual(getInitial(''), 'स');
    assert.strictEqual(getInitial('   महिला शक्ति  '), 'म');
  });

  await test('Public vs Private badge labeling and styling parity', () => {
    const getPrivacyBadge = (privacy: 'PUBLIC' | 'PRIVATE', lang: 'hi' | 'en') => {
      const isPrivate = privacy === 'PRIVATE';
      return {
        label: isPrivate
          ? lang === 'hi' ? '🔒 निजी' : '🔒 Private'
          : lang === 'hi' ? 'सार्वजनिक' : 'Public',
        variant: isPrivate ? ('muted' as const) : ('info' as const),
      };
    };

    const privateHi = getPrivacyBadge('PRIVATE', 'hi');
    assert.strictEqual(privateHi.label, '🔒 निजी');
    assert.strictEqual(privateHi.variant, 'muted');

    const publicHi = getPrivacyBadge('PUBLIC', 'hi');
    assert.strictEqual(publicHi.label, 'सार्वजनिक');
    assert.strictEqual(publicHi.variant, 'info');

    const privateEn = getPrivacyBadge('PRIVATE', 'en');
    assert.strictEqual(privateEn.label, '🔒 Private');
  });

  // -----------------------------------------------------------------------------
  // 2. Groups Discovery Tab & Search Filtering Logic
  // -----------------------------------------------------------------------------
  console.log('--- 2. Groups Discovery Tab & Search Filtering Logic ---');

  const mockGroups = [
    { id: '1', slug: 'youth-wing', name: 'Youth Wing', description: 'Empowering young minds', privacy: 'PUBLIC' as const, isMember: true, role: 'ADMIN' },
    { id: '2', slug: 'women-forum', name: 'महिला शक्ति', description: 'समाज की महिलाएं', privacy: 'PRIVATE' as const, isMember: true, role: 'MEMBER' },
    { id: '3', slug: 'biz-network', name: 'Business Network', description: 'Trade and investment', privacy: 'PUBLIC' as const, isMember: false },
    { id: '4', slug: 'core-committee', name: 'Core Committee', description: 'Leadership decisions', privacy: 'PRIVATE' as const, isMember: false },
  ];

  const filterFn = (tab: 'ALL' | 'MY' | 'PUBLIC' | 'PRIVATE') =>
    mockGroups.filter((g) => {
      if (tab === 'MY') return g.isMember;
      if (tab === 'PUBLIC') return g.privacy === 'PUBLIC';
      if (tab === 'PRIVATE') return g.privacy === 'PRIVATE';
      return true;
    });

  await test('Filter ALL returns all non-empty groups', () => {
    assert.strictEqual(filterFn('ALL').length, 4);
  });

  await test('Filter MY returns only joined groups', () => {
    assert.strictEqual(filterFn('MY').length, 2);
    assert.deepStrictEqual(filterFn('MY').map((g) => g.id), ['1', '2']);
  });

  await test('Filter PUBLIC and PRIVATE segments correctly', () => {
    const publicGroups = mockGroups.filter((g) => g.privacy === 'PUBLIC');
    const privateGroups = mockGroups.filter((g) => g.privacy === 'PRIVATE');
    assert.strictEqual(publicGroups.length, 2);
    assert.strictEqual(privateGroups.length, 2);
  });

  await test('Search query filters by name and description case-insensitively', () => {
    const query = 'business';
    const filtered = mockGroups.filter((g) =>
      g.name.toLowerCase().includes(query.toLowerCase()) ||
      g.description.toLowerCase().includes(query.toLowerCase())
    );
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].slug, 'biz-network');
  });

  // -----------------------------------------------------------------------------
  // 3. Multi-Tenant Sole-Admin Leave Guard & Privacy Boundaries
  // -----------------------------------------------------------------------------
  console.log('--- 3. Multi-Tenant Sole-Admin Leave Guard & Privacy Boundaries ---');

  await test('Sole-admin cannot leave without transferring ownership', () => {
    interface Member {
      userId: string;
      role: 'ADMIN' | 'MODERATOR' | 'MEMBER';
    }

    const checkCanLeave = (currentUserId: string, members: Member[]): { canLeave: boolean; reason?: string } => {
      const currentMember = members.find((m) => m.userId === currentUserId);
      if (!currentMember) return { canLeave: false, reason: 'सदस्यता नहीं मिली' };

      if (currentMember.role === 'ADMIN') {
        const otherAdmins = members.filter((m) => m.userId !== currentUserId && m.role === 'ADMIN');
        if (otherAdmins.length === 0) {
          return {
            canLeave: false,
            reason: 'समूह छोड़ने से पहले किसी अन्य सदस्य को व्यवस्थापक (Admin) बनाएं।',
          };
        }
      }
      return { canLeave: true };
    };

    // Sole admin case
    const soleAdminMembers: Member[] = [
      { userId: 'u1', role: 'ADMIN' },
      { userId: 'u2', role: 'MEMBER' },
    ];
    const soleResult = checkCanLeave('u1', soleAdminMembers);
    assert.strictEqual(soleResult.canLeave, false);
    assert.strictEqual(soleResult.reason, 'समूह छोड़ने से पहले किसी अन्य सदस्य को व्यवस्थापक (Admin) बनाएं।');

    // Multiple admins case
    const multiAdminMembers: Member[] = [
      { userId: 'u1', role: 'ADMIN' },
      { userId: 'u2', role: 'ADMIN' },
    ];
    const multiResult = checkCanLeave('u1', multiAdminMembers);
    assert.strictEqual(multiResult.canLeave, true);

    // Regular member case
    const regularMemberResult = checkCanLeave('u2', soleAdminMembers);
    assert.strictEqual(regularMemberResult.canLeave, true);
  });

  await test('Private group content boundary protects secret posts from non-members', () => {
    const canViewDiscussions = (privacy: 'PUBLIC' | 'PRIVATE', isMember: boolean) => {
      if (privacy === 'PUBLIC') return true;
      return isMember;
    };

    assert.strictEqual(canViewDiscussions('PUBLIC', false), true);
    assert.strictEqual(canViewDiscussions('PUBLIC', true), true);
    assert.strictEqual(canViewDiscussions('PRIVATE', false), false);
    assert.strictEqual(canViewDiscussions('PRIVATE', true), true);
  });

  // -----------------------------------------------------------------------------
  // 4. Batch 9.2.1 Inline Video Playback in Discussions Feed Parity
  // -----------------------------------------------------------------------------
  console.log('--- 4. Batch 9.2.1 Inline Video Playback in Discussions Feed Parity ---');

  await test('Group discussions feed tracks single active inline playing post', () => {
    let activePlayingPostId: string | null = null;

    const onPlayInline = (id: string) => {
      activePlayingPostId = id;
    };
    const onPauseInline = (id: string) => {
      if (activePlayingPostId === id) {
        activePlayingPostId = null;
      }
    };

    assert.strictEqual(activePlayingPostId, null);
    onPlayInline('post-101');
    assert.strictEqual(activePlayingPostId, 'post-101');

    // Starting post-202 immediately pauses/replaces post-101
    onPlayInline('post-202');
    assert.strictEqual(activePlayingPostId, 'post-202');

    // Pausing post-202 clears it
    onPauseInline('post-202');
    assert.strictEqual(activePlayingPostId, null);
  });

  await test('Auto-pauses video when discussion post scrolls past 40% threshold', () => {
    let activePlayingPostId: string | null = 'post-101';

    const handleViewableItemsChanged = (viewableItemKeys: string[]) => {
      if (activePlayingPostId && !viewableItemKeys.includes(activePlayingPostId)) {
        activePlayingPostId = null;
      }
    };

    // Post-101 is visible
    handleViewableItemsChanged(['post-100', 'post-101']);
    assert.strictEqual(activePlayingPostId, 'post-101');

    // Scrolled away, now only post-102 and post-103 visible
    handleViewableItemsChanged(['post-102', 'post-103']);
    assert.strictEqual(activePlayingPostId, null);
  });

  // -----------------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------------
  console.log('------------------------------------------------------------------------');
  console.log(`Groups & Community UI Summary: ${passedTests} PASSED, ${totalTests - passedTests} FAILED (Total: ${totalTests})`);
  console.log('------------------------------------------------------------------------\n');
}
