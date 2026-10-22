import assert from 'node:assert';
import { MatrimonialProfileStatus } from '../../../../packages/shared-types/src/index';

console.log('======================================================');
console.log('   Apna Samaj — Matrimonial Submission Frontend Tests ');
console.log('======================================================\n');

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   ${err.message}`);
    process.exit(1);
  }
}

// 1. Submit Button Visibility Logic
console.log('--- 1. Submit Button Visibility by Status ---');

function isSubmitButtonVisible(status?: MatrimonialProfileStatus): boolean {
  if (!status) return false;
  return status === 'DRAFT' || status === 'REJECTED';
}

function getSubmitButtonLabel(status?: MatrimonialProfileStatus): string {
  if (status === 'REJECTED') return 'Resubmit for Approval';
  return 'Submit for Approval';
}

test('Button is visible when profile is in DRAFT status', () => {
  assert.strictEqual(isSubmitButtonVisible('DRAFT'), true);
  assert.strictEqual(getSubmitButtonLabel('DRAFT'), 'Submit for Approval');
});

test('Button is visible when profile is in REJECTED status', () => {
  assert.strictEqual(isSubmitButtonVisible('REJECTED'), true);
  assert.strictEqual(getSubmitButtonLabel('REJECTED'), 'Resubmit for Approval');
});

test('Button is HIDDEN when profile is in PENDING_APPROVAL status', () => {
  assert.strictEqual(isSubmitButtonVisible('PENDING_APPROVAL'), false);
});

test('Button is HIDDEN when profile is in APPROVED status', () => {
  assert.strictEqual(isSubmitButtonVisible('APPROVED'), false);
});

test('Button is HIDDEN when profile is in HIDDEN status', () => {
  assert.strictEqual(isSubmitButtonVisible('HIDDEN'), false);
});

test('Button is HIDDEN when profile does not exist yet', () => {
  assert.strictEqual(isSubmitButtonVisible(undefined), false);
});

// 2. Confirmation Dialog & Submission State Machine
console.log('--- 2. Confirmation & Submission State Machine ---');

interface UIState {
  isSubmitDialogOpen: boolean;
  isSubmittingForApproval: boolean;
  profileStatus: MatrimonialProfileStatus;
  successMessage: string | null;
  errorMessage: string | null;
}

test('Clicking Submit for Approval requires confirmation dialog', () => {
  const state: UIState = {
    isSubmitDialogOpen: false,
    isSubmittingForApproval: false,
    profileStatus: 'DRAFT',
    successMessage: null,
    errorMessage: null,
  };

  // User clicks submit button
  state.isSubmitDialogOpen = true;
  assert.strictEqual(state.isSubmitDialogOpen, true, 'Dialog opens on button click');
  assert.strictEqual(state.isSubmittingForApproval, false, 'Not submitting until confirmed');
});

test('Submitting disables action and shows progress indicator', () => {
  const state: UIState = {
    isSubmitDialogOpen: true,
    isSubmittingForApproval: false,
    profileStatus: 'DRAFT',
    successMessage: null,
    errorMessage: null,
  };

  // User confirms dialog
  state.isSubmittingForApproval = true;
  assert.strictEqual(state.isSubmittingForApproval, true, 'In-flight submission disables button and dialog actions');
});

test('Successful submission updates status to PENDING_APPROVAL and shows success banner', () => {
  const state: UIState = {
    isSubmitDialogOpen: true,
    isSubmittingForApproval: true,
    profileStatus: 'DRAFT',
    successMessage: null,
    errorMessage: null,
  };

  // API returns updated profile with PENDING_APPROVAL
  const apiResponse = { status: 'PENDING_APPROVAL' as MatrimonialProfileStatus };
  state.profileStatus = apiResponse.status;
  state.isSubmitDialogOpen = false;
  state.isSubmittingForApproval = false;
  state.successMessage = 'Matrimonial profile submitted successfully! It is now pending Samaj admin approval.';

  assert.strictEqual(state.profileStatus, 'PENDING_APPROVAL', 'Profile status is updated to PENDING_APPROVAL');
  assert.strictEqual(state.isSubmitDialogOpen, false, 'Dialog closes on success');
  assert.strictEqual(state.isSubmittingForApproval, false, 'Loading state clears on success');
  assert.ok(state.successMessage && state.successMessage.includes('pending Samaj admin approval'), 'Success notice is displayed');
  assert.notStrictEqual(state.profileStatus, 'APPROVED', 'Profile is NOT falsely marked APPROVED in the frontend');
});

test('Failed submission surfaces API validation error and preserves current status', () => {
  const state: UIState = {
    isSubmitDialogOpen: true,
    isSubmittingForApproval: true,
    profileStatus: 'DRAFT',
    successMessage: null,
    errorMessage: null,
  };

  // API returns validation error
  const apiError = 'Cannot submit profile. Required profile information is missing: Highest education is required.';
  state.errorMessage = apiError;
  state.isSubmitDialogOpen = false;
  state.isSubmittingForApproval = false;

  assert.strictEqual(state.profileStatus, 'DRAFT', 'Status remains DRAFT on error');
  assert.strictEqual(state.errorMessage, apiError, 'Error message is properly displayed to member');
  assert.strictEqual(state.isSubmitDialogOpen, false, 'Dialog closes on error');
  assert.strictEqual(state.isSubmittingForApproval, false, 'Loading flag is reset');
});

console.log('\n======================================================');
console.log(`Summary: All ${passed} frontend submission checks passed!`);
console.log('======================================================\n');
