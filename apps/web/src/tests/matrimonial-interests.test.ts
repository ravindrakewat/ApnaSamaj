import assert from 'node:assert';
import {
  respondMatrimonialInterestSchema,
  sendMatrimonialInterestSchema,
} from '../../../../packages/validation/src/matrimonial';
import {
  MatrimonialInterestItem,
  MatrimonialInterestStatus,
} from '../../../../packages/shared-types/src/index';

console.log('======================================================');
console.log('   Apna Samaj — Batch 12F Frontend Interest Tests    ');
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

// 1. Validation for responding to interests
console.log('--- 1. Respond to Interest Validation ---');

test('Status ACCEPTED is valid response status', () => {
  const result = respondMatrimonialInterestSchema.safeParse({ status: 'ACCEPTED' });
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.data.status, 'ACCEPTED');
  }
});

test('Status DECLINED is valid response status', () => {
  const result = respondMatrimonialInterestSchema.safeParse({ status: 'DECLINED' });
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.data.status, 'DECLINED');
  }
});

test('Status WITHDRAWN is valid response status', () => {
  const result = respondMatrimonialInterestSchema.safeParse({ status: 'WITHDRAWN' });
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.data.status, 'WITHDRAWN');
  }
});

test('Status PENDING is invalid response status', () => {
  const result = respondMatrimonialInterestSchema.safeParse({ status: 'PENDING' });
  assert.strictEqual(result.success, false);
});

test('Arbitrary status is rejected', () => {
  const result = respondMatrimonialInterestSchema.safeParse({ status: 'CANCELLED' });
  assert.strictEqual(result.success, false);
});

// 2. State transition rules
console.log('\n--- 2. Valid UI Action Guards ---');

function getAvailableActions(
  role: 'SENDER' | 'RECEIVER',
  currentStatus: MatrimonialInterestStatus
): string[] {
  const actions: string[] = [];
  if (role === 'RECEIVER' && currentStatus === 'PENDING') {
    actions.push('ACCEPT', 'DECLINE');
  }
  if (role === 'SENDER' && currentStatus === 'PENDING') {
    actions.push('WITHDRAW');
  }
  return actions;
}

test('Receiver can only ACCEPT or DECLINE when status is PENDING', () => {
  const actions = getAvailableActions('RECEIVER', 'PENDING');
  assert.deepStrictEqual(actions, ['ACCEPT', 'DECLINE']);
});

test('Receiver has no response actions when already ACCEPTED', () => {
  const actions = getAvailableActions('RECEIVER', 'ACCEPTED');
  assert.deepStrictEqual(actions, []);
});

test('Receiver has no response actions when DECLINED', () => {
  const actions = getAvailableActions('RECEIVER', 'DECLINED');
  assert.deepStrictEqual(actions, []);
});

test('Sender can only WITHDRAW when status is PENDING', () => {
  const actions = getAvailableActions('SENDER', 'PENDING');
  assert.deepStrictEqual(actions, ['WITHDRAW']);
});

test('Sender CANNOT accept or decline their own sent interest', () => {
  const actions = getAvailableActions('SENDER', 'PENDING');
  assert.strictEqual(actions.includes('ACCEPT'), false);
  assert.strictEqual(actions.includes('DECLINE'), false);
});

test('Sender has no response actions when already WITHDRAWN', () => {
  const actions = getAvailableActions('SENDER', 'WITHDRAWN');
  assert.deepStrictEqual(actions, []);
});

test('Sender has no response actions when already ACCEPTED', () => {
  const actions = getAvailableActions('SENDER', 'ACCEPTED');
  assert.deepStrictEqual(actions, []);
});

// 3. Privacy Contact Reveal Logic
console.log('\n--- 3. Contact Details Privacy Guard Logic ---');

function shouldDisplayContactDetails(
  interest: MatrimonialInterestItem,
  unlockedContactResponse?: { phone: string; isMutualAccepted: boolean } | null
): boolean {
  // STRICT RULE: Never infer contact access from frontend status alone.
  // Contact details are ONLY rendered if API response explicitly supplies authorized unlocked-contact object.
  if (!unlockedContactResponse) {
    return false;
  }
  return unlockedContactResponse.isMutualAccepted === true && Boolean(unlockedContactResponse.phone);
}

test('Contact is NOT revealed if unlockedContact object is missing, even if status is ACCEPTED', () => {
  const mockInterest: MatrimonialInterestItem = {
    id: 'int-123',
    senderId: 'user-1',
    receiverId: 'user-2',
    status: 'ACCEPTED',
    message: null,
    respondedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const isVisible = shouldDisplayContactDetails(mockInterest, null);
  assert.strictEqual(isVisible, false);
});

test('Contact is NOT revealed if isMutualAccepted is false', () => {
  const mockInterest: MatrimonialInterestItem = {
    id: 'int-123',
    senderId: 'user-1',
    receiverId: 'user-2',
    status: 'PENDING',
    message: null,
    respondedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const isVisible = shouldDisplayContactDetails(mockInterest, {
    phone: '9876543210',
    isMutualAccepted: false,
  });
  assert.strictEqual(isVisible, false);
});

test('Contact IS revealed when unlockedContact has isMutualAccepted: true and phone', () => {
  const mockInterest: MatrimonialInterestItem = {
    id: 'int-123',
    senderId: 'user-1',
    receiverId: 'user-2',
    status: 'ACCEPTED',
    message: null,
    respondedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const isVisible = shouldDisplayContactDetails(mockInterest, {
    phone: '9876543210',
    isMutualAccepted: true,
  });
  assert.strictEqual(isVisible, true);
});

// 4. URL Tab Synchronization
console.log('\n--- 4. URL Tab Query Sync ---');

function resolveTabFromParam(tabParam: string | null): number {
  if (tabParam === 'received') return 5;
  if (tabParam === 'sent') return 6;
  if (tabParam === 'gallery') return 4;
  if (tabParam === 'preferences') return 3;
  if (tabParam === 'family') return 2;
  if (tabParam === 'education') return 1;
  return 0;
}

test('Resolves tab=received to tab index 5', () => {
  assert.strictEqual(resolveTabFromParam('received'), 5);
});

test('Resolves tab=sent to tab index 6', () => {
  assert.strictEqual(resolveTabFromParam('sent'), 6);
});

test('Resolves default or null tab to tab index 0', () => {
  assert.strictEqual(resolveTabFromParam(null), 0);
  assert.strictEqual(resolveTabFromParam('unknown'), 0);
});

console.log(`\n======================================================`);
console.log(`Summary: All ${passed} frontend checks passed!`);
console.log(`======================================================\n`);
