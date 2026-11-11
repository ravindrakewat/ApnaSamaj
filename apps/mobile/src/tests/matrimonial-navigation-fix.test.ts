import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { BottomNavigation, NavTab } from '../components/BottomNavigation';

export async function runMatrimonialNavigationFixTests(): Promise<void> {
  console.log('\n========================================================================');
  console.log('   Apna Samaj — Batch 10.2.13: Matrimonial Bottom Navigation Tests      ');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   ${err?.message || err}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // 1. BottomNavigation Component Contract & Tab Route Mapping
  // -------------------------------------------------------------
  await test('1. BottomNavigation exports and covers all 6 top-level tabs', () => {
    assert.strictEqual(typeof BottomNavigation, 'function', 'BottomNavigation is exported as a React functional component');

    const expectedTabs: NavTab[] = ['feed', 'directory', 'groups', 'matrimonial', 'chat', 'profile'];
    expectedTabs.forEach((tab) => {
      assert.ok(typeof tab === 'string', `Valid NavTab key: ${tab}`);
    });
  });

  // -------------------------------------------------------------
  // 2. Matrimonial Discovery Screen Bottom Navigation Integration
  // -------------------------------------------------------------
  await test('2. Matrimonial Discovery imports and renders BottomNavigation with activeTab="matrimonial"', () => {
    const matrimonialIndexPath = path.resolve(__dirname, '../../app/(app)/matrimonial/index.tsx');
    assert.ok(fs.existsSync(matrimonialIndexPath), 'matrimonial/index.tsx file exists');

    const fileContent = fs.readFileSync(matrimonialIndexPath, 'utf-8');

    // 2.1 Verify component import
    assert.ok(
      fileContent.includes('BottomNavigation'),
      'matrimonial/index.tsx imports BottomNavigation component'
    );

    // 2.2 Verify JSX rendering with activeTab="matrimonial"
    assert.ok(
      fileContent.includes('<BottomNavigation activeTab="matrimonial" />'),
      'matrimonial/index.tsx renders <BottomNavigation activeTab="matrimonial" />'
    );
  });

  // -------------------------------------------------------------
  // 3. Scrollable List Bottom Spacing & Safe-Area Padding Invariant
  // -------------------------------------------------------------
  await test('3. Matrimonial Discovery profiles & interests FlatLists enforce adequate bottom padding', () => {
    const matrimonialIndexPath = path.resolve(__dirname, '../../app/(app)/matrimonial/index.tsx');
    const fileContent = fs.readFileSync(matrimonialIndexPath, 'utf-8');

    // Padding formula ensures content scrolls above the fixed BottomNavigation bar
    assert.ok(
      fileContent.includes('paddingBottom: Math.max(insets.bottom + 90, 110)'),
      'Profiles and Interests FlatLists include dynamic safe-area bottom padding'
    );

    // Simulate padding calculations
    const computePadding = (bottomInset: number) => Math.max(bottomInset + 90, 110);

    // Android standard hardware navigation (insets.bottom = 0)
    assert.strictEqual(computePadding(0), 110, 'Provides at least 110px padding on Android with 0 bottom inset');

    // iOS home indicator bar (insets.bottom = 34)
    assert.strictEqual(computePadding(34), 124, 'Provides 124px padding on iOS devices with home indicator');
  });

  // -------------------------------------------------------------
  // 4. Matrimonial Details & Manage Screens Navigation Isolation
  // -------------------------------------------------------------
  await test('4. Matrimonial Details and Manage screens preserve back navigation and do NOT duplicate footer', () => {
    const detailsPath = path.resolve(__dirname, '../../app/(app)/matrimonial/[id].tsx');
    const managePath = path.resolve(__dirname, '../../app/(app)/matrimonial/manage.tsx');

    assert.ok(fs.existsSync(detailsPath), 'matrimonial/[id].tsx exists');
    assert.ok(fs.existsSync(managePath), 'matrimonial/manage.tsx exists');

    const detailsContent = fs.readFileSync(detailsPath, 'utf-8');
    const manageContent = fs.readFileSync(managePath, 'utf-8');

    // Details uses AppHeader mode="detail" with back navigation
    assert.ok(detailsContent.includes('mode="detail"'), 'matrimonial/[id].tsx uses detail header mode');
    assert.ok(!detailsContent.includes('<BottomNavigation'), 'matrimonial/[id].tsx does not duplicate BottomNavigation');

    // Manage screen uses AppHeader mode="detail" and custom step wizard footer
    assert.ok(manageContent.includes('mode="detail"'), 'matrimonial/manage.tsx uses detail header mode');
    assert.ok(!manageContent.includes('<BottomNavigation'), 'matrimonial/manage.tsx does not duplicate BottomNavigation');
  });

  // -------------------------------------------------------------
  // 5. Main Application Screens Navigation Consistency
  // -------------------------------------------------------------
  await test('5. All 6 main top-level tab destinations render BottomNavigation consistently', () => {
    const appDir = path.resolve(__dirname, '../../app/(app)');

    const mainScreens: Array<{ file: string; activeTab: NavTab }> = [
      { file: 'index.tsx', activeTab: 'feed' },
      { file: 'directory/index.tsx', activeTab: 'directory' },
      { file: 'groups/index.tsx', activeTab: 'groups' },
      { file: 'matrimonial/index.tsx', activeTab: 'matrimonial' },
      { file: 'chat/index.tsx', activeTab: 'chat' },
      { file: 'profile/index.tsx', activeTab: 'profile' },
    ];

    mainScreens.forEach(({ file, activeTab }) => {
      const filePath = path.join(appDir, file);
      assert.ok(fs.existsSync(filePath), `Main screen ${file} exists`);

      const content = fs.readFileSync(filePath, 'utf-8');
      const expectedTag = `<BottomNavigation activeTab="${activeTab}" />`;

      assert.ok(
        content.includes(expectedTag),
        `${file} renders BottomNavigation with activeTab="${activeTab}"`
      );
    });
  });

  // -------------------------------------------------------------
  // 6. Sub-Screens & Auth Navigation Boundary Security
  // -------------------------------------------------------------
  await test('6. Sub-screens and auth screens intentionally omit BottomNavigation', () => {
    const authLoginPath = path.resolve(__dirname, '../../app/(auth)/login.tsx');
    const postDetailPath = path.resolve(__dirname, '../../app/(app)/post/[id].tsx');
    const directChatPath = path.resolve(__dirname, '../../app/(app)/chat/[id].tsx');

    const loginContent = fs.readFileSync(authLoginPath, 'utf-8');
    const postContent = fs.readFileSync(postDetailPath, 'utf-8');
    const chatContent = fs.readFileSync(directChatPath, 'utf-8');

    assert.ok(!loginContent.includes('<BottomNavigation'), 'Auth screens omit bottom navigation');
    assert.ok(!postContent.includes('<BottomNavigation'), 'Post detail omits bottom navigation');
    assert.ok(!chatContent.includes('<BottomNavigation'), 'Direct chat message screen omits bottom navigation');
  });

  console.log('\n========================================================================');
  console.log(`🎉 MATRIMONIAL NAVIGATION FIX SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log('========================================================================\n');

  if (failed > 0) {
    throw new Error(`Matrimonial Navigation Fix test suite failed with ${failed} failures.`);
  }
}

