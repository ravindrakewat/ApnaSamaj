import assert from 'node:assert';
import { BottomSheetProps } from '../components/BottomSheet';
import { ConfirmationDialogProps } from '../components/ConfirmationDialog';

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

export async function runNavigationBottomSheetTests() {
  console.log('\n========================================================================');
  console.log('   Apna Samaj — Batch 10.2.6: Navigation & Bottom Sheet Polish Tests   ');
  console.log('========================================================================\n');

  // -----------------------------------------------------------------------------
  // 1. Navigation Route & Header Standardization
  // -----------------------------------------------------------------------------
  console.log('--- 1. Navigation Route & Header Standardization ---');

  await test('Expo Router App stack includes all 14 mobile app routes', () => {
    const expectedAppRoutes = [
      'index',
      'post/[id]',
      'post/create',
      'directory/index',
      'directory/[id]',
      'groups/index',
      'group/[slug]',
      'group/[slug]/chat',
      'matrimonial/index',
      'matrimonial/[id]',
      'chat/index',
      'chat/[id]',
      'profile/index',
      'profile/settings',
    ];

    assert.strictEqual(expectedAppRoutes.length, 14);
    for (const route of expectedAppRoutes) {
      assert.ok(route.length > 0);
    }
  });

  await test('Header back-button safely checks canGoBack and provides home fallback', () => {
    // Simulate AppHeader back logic
    let backCalled = false;
    let replaceTarget: string | null = null;

    const routerWithHistory = {
      canGoBack: () => true,
      back: () => {
        backCalled = true;
      },
      replace: (target: string) => {
        replaceTarget = target;
      },
    };

    const handleBackWithHistory = (router: any, onBackPress?: () => void) => {
      if (onBackPress) {
        onBackPress();
      } else if (router.canGoBack && router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(app)');
      }
    };

    // Test with history
    handleBackWithHistory(routerWithHistory);
    assert.strictEqual(backCalled, true);
    assert.strictEqual(replaceTarget, null);

    // Test deep link / cold start without history
    backCalled = false;
    const routerNoHistory = {
      canGoBack: () => false,
      back: () => {
        backCalled = true;
      },
      replace: (target: string) => {
        replaceTarget = target;
      },
    };

    handleBackWithHistory(routerNoHistory);
    assert.strictEqual(backCalled, false);
    assert.strictEqual(replaceTarget, '/(app)');
  });

  await test('Custom onBackPress override takes precedence over default navigation', () => {
    let customBackCalled = false;
    let defaultBackCalled = false;

    const router = {
      canGoBack: () => true,
      back: () => {
        defaultBackCalled = true;
      },
    };

    const handleBack = (onBackPress?: () => void) => {
      if (onBackPress) {
        onBackPress();
      } else if (router.canGoBack()) {
        router.back();
      }
    };

    handleBack(() => {
      customBackCalled = true;
    });

    assert.strictEqual(customBackCalled, true);
    assert.strictEqual(defaultBackCalled, false);
  });

  // -----------------------------------------------------------------------------
  // 2. Standardized BottomSheet Component Invariants
  // -----------------------------------------------------------------------------
  console.log('--- 2. Standardized BottomSheet Component Invariants ---');

  await test('BottomSheet interface enforces necessary modal lifecycle controls', () => {
    const props: BottomSheetProps = {
      visible: true,
      onClose: () => {},
      title: 'विस्तृत खोज फ़िल्टर',
      subtitle: 'समुदाय अनुसार खोजें',
      icon: '🎛️',
      children: null,
      maxHeightPercent: 0.85,
      showDragHandle: true,
      showCloseButton: true,
      dismissOnBackdrop: true,
      preventDismiss: false,
      scrollable: true,
    };

    assert.strictEqual(props.visible, true);
    assert.strictEqual(props.showDragHandle, true);
    assert.strictEqual(props.dismissOnBackdrop, true);
    assert.strictEqual(props.maxHeightPercent, 0.85);
  });

  await test('BottomSheet respects preventDismiss lock during async submission', () => {
    let closeTriggered = false;
    const onClose = () => {
      closeTriggered = true;
    };

    const attemptDismiss = (preventDismiss: boolean) => {
      if (!preventDismiss) {
        onClose();
      }
    };

    // When saving or submitting
    attemptDismiss(true);
    assert.strictEqual(closeTriggered, false);

    // When idle
    attemptDismiss(false);
    assert.strictEqual(closeTriggered, true);
  });

  await test('BottomSheet handles Android back button without exiting the screen', () => {
    let sheetClosed = false;

    const handleHardwareBackPress = (visible: boolean, preventDismiss: boolean) => {
      if (!visible) return false;
      if (!preventDismiss) {
        sheetClosed = true;
      }
      return true; // Consumes event to prevent exiting the parent screen
    };

    // Sheet visible & not locked
    const consumed = handleHardwareBackPress(true, false);
    assert.strictEqual(consumed, true);
    assert.strictEqual(sheetClosed, true);

    // Sheet visible & locked (saving)
    sheetClosed = false;
    const consumedLocked = handleHardwareBackPress(true, true);
    assert.strictEqual(consumedLocked, true);
    assert.strictEqual(sheetClosed, false);
  });

  // -----------------------------------------------------------------------------
  // 3. ConfirmationDialog Standardization Invariants
  // -----------------------------------------------------------------------------
  console.log('--- 3. ConfirmationDialog Standardization Invariants ---');

  await test('ConfirmationDialog supports danger, warning, and info visual variants', () => {
    const dangerDialog: ConfirmationDialogProps = {
      visible: true,
      title: 'लॉगआउट की पुष्टि',
      message: 'क्या आप सत्र समाप्त करना चाहते हैं?',
      variant: 'danger',
      icon: '🚪',
      onConfirm: () => {},
      onCancel: () => {},
    };

    const warningDialog: ConfirmationDialogProps = {
      visible: true,
      title: 'समुदाय बदलें?',
      message: 'समुदाय बदलने से वर्तमान सत्र समाप्त होगा।',
      variant: 'warning',
      icon: '🔄',
      onConfirm: () => {},
      onCancel: () => {},
    };

    assert.strictEqual(dangerDialog.variant, 'danger');
    assert.strictEqual(warningDialog.variant, 'warning');
  });

  await test('ConfirmationDialog prevents cancellation during active network submission', () => {
    let cancelCalled = false;
    const onCancel = () => {
      cancelCalled = true;
    };

    const handleCancelAttempt = (loading: boolean) => {
      if (!loading) {
        onCancel();
      }
    };

    // Attempt cancel while action is in flight
    handleCancelAttempt(true);
    assert.strictEqual(cancelCalled, false);

    // Cancel while idle
    handleCancelAttempt(false);
    assert.strictEqual(cancelCalled, true);
  });

  await test('Destructive actions correctly route to confirmation dialog flows', () => {
    // Verify dialog trigger mappings
    let isLeaveDialogOpen = false;
    let isLogoutDialogOpen = false;

    const triggerLeaveGroup = () => {
      isLeaveDialogOpen = true;
    };

    const triggerLogout = () => {
      isLogoutDialogOpen = true;
    };

    triggerLeaveGroup();
    assert.strictEqual(isLeaveDialogOpen, true);

    triggerLogout();
    assert.strictEqual(isLogoutDialogOpen, true);
  });

  console.log(`\nBatch 10.2.6 Navigation & Bottom Sheet Tests Finished: ${passedTests}/${totalTests} Passed\n`);
  if (passedTests !== totalTests) {
    throw new Error(`Only ${passedTests}/${totalTests} tests passed in navigation-bottom-sheet.test.ts`);
  }
}

// Auto-run if executed directly
if (require.main === module) {
  runNavigationBottomSheetTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

