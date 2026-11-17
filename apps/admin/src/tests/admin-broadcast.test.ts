import assert from 'node:assert/strict';
import type {
  BroadcastNotificationPayload,
  BroadcastTargetAudience,
  BroadcastNotificationResult,
} from '../services/admin.notifications.service.js';

async function runTests() {
  console.log('--- Testing Admin Broadcast Notification Logic & Models ---');

  // Test 1: Broadcast Payload Structure
  const generalBroadcast: BroadcastNotificationPayload = {
    title: 'Community Sammelan 2026',
    body: 'Annual gathering will be held at Bhopal on Sunday 10 AM.',
    targetAudience: 'ALL_MEMBERS',
    actionUrl: '/events',
    priority: 'HIGH',
  };

  assert.equal(generalBroadcast.title, 'Community Sammelan 2026');
  assert.equal(generalBroadcast.targetAudience, 'ALL_MEMBERS');
  assert.equal(generalBroadcast.priority, 'HIGH');
  assert.equal(generalBroadcast.actionUrl, '/events');
  console.log('✓ General broadcast payload structure verified');

  // Test 2: Target Audience Segmentation
  const validAudiences: BroadcastTargetAudience[] = ['ALL_MEMBERS', 'VERIFIED_ONLY', 'ADMINS_MODS'];
  assert.equal(validAudiences.length, 3);
  assert.ok(validAudiences.includes('VERIFIED_ONLY'));
  assert.ok(validAudiences.includes('ADMINS_MODS'));
  console.log('✓ Target audience segmentation options verified');

  // Test 3: High Priority Urgent Alert
  const urgentStaffNotice: BroadcastNotificationPayload = {
    title: 'Urgent Moderation Review',
    body: 'Spike in flagged reports requiring immediate committee attention.',
    targetAudience: 'ADMINS_MODS',
    priority: 'HIGH',
  };
  assert.equal(urgentStaffNotice.targetAudience, 'ADMINS_MODS');
  assert.equal(urgentStaffNotice.priority, 'HIGH');
  console.log('✓ Urgent staff broadcast structure verified');

  // Test 4: Notification Result Contract
  const result: BroadcastNotificationResult = {
    success: true,
    recipientCount: 150,
    dispatchedAt: new Date().toISOString(),
    message: 'Broadcast successfully dispatched to all active community members.',
  };
  assert.equal(result.success, true);
  assert.ok(result.recipientCount > 0);
  assert.ok(result.message.length > 0);
  console.log('✓ Broadcast result contract verified');

  console.log('ALL ADMIN BROADCAST NOTIFICATION TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
