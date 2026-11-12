import moduleMod from 'module';
import path from 'path';

// Hook require for react-native, expo-secure-store, and safe area in Node test runtime
const originalRequire = (moduleMod.prototype as any).require;
(moduleMod.prototype as any).require = function (id: string) {
  if (id === 'react-native') {
    return originalRequire.call(this, path.resolve(__dirname, './mocks/react-native'));
  }
  if (id === 'expo-secure-store') {
    return originalRequire.call(this, path.resolve(__dirname, './mocks/expo-secure-store'));
  }
  if (id === 'expo-constants') {
    return originalRequire.call(this, path.resolve(__dirname, './mocks/expo-constants'));
  }
  if (id === 'expo-notifications') {
    return originalRequire.call(this, path.resolve(__dirname, './mocks/expo-notifications'));
  }
  if (id === 'expo-av') {
    return originalRequire.call(this, path.resolve(__dirname, './mocks/expo-av'));
  }
  if (id === 'react-native-safe-area-context') {
    return originalRequire.call(this, path.resolve(__dirname, './mocks/react-native-safe-area-context'));
  }
  if (id === 'expo-router') {
    return originalRequire.call(this, path.resolve(__dirname, './mocks/expo-router'));
  }
  return originalRequire.apply(this, arguments);
};

// Import test suites sequentially
async function runAll() {
  await import('./mobile-foundation.test');
  await import('./auth-flow.test');
  await import('./auth-verification.test');
  await import('./feed-flow.test');
  await import('./post-creation.test');
  await import('./directory-flow.test');
  await import('./groups-flow.test');
  const { runMatrimonialFlowTests } = await import('./matrimonial-flow.test');
  await runMatrimonialFlowTests();
  await import('./ui-navigation-audit.test');
  const { runSessionPersistenceTests } = await import('./session-persistence.test');
  await runSessionPersistenceTests();
  const { runProfileSettingsFlowTests } = await import('./profile-settings-flow.test');
  await runProfileSettingsFlowTests();
  const { runGroupChatFlowTests } = await import('./group-chat-flow.test');
  await runGroupChatFlowTests();
  const { runPersonalChatFlowTests } = await import('./personal-chat-flow.test');
  await runPersonalChatFlowTests();
  const { runChatMediaAttachmentsFlowTests } = await import('./chat-media-attachments-flow.test');
  await runChatMediaAttachmentsFlowTests();
  const { runPushNotificationsFlowTests } = await import('./push-notifications-flow.test');
  await runPushNotificationsFlowTests();
  const { runOfflineChatSyncFlowTests } = await import('./offline-chat-sync-flow.test');
  await runOfflineChatSyncFlowTests();
  const { runVoiceNotesFlowTests } = await import('./voice-notes-flow.test');
  await runVoiceNotesFlowTests();
  const { runChatReactionsRepliesFlowTests } = await import('./chat-reactions-replies-flow.test');
  await runChatReactionsRepliesFlowTests();
  const { runChatSearchMediaMobileTests } = await import('./chat-search-media-flow.test');
  await runChatSearchMediaMobileTests();
  const { runChatDeletionModerationMobileTests } = await import('./chat-deletion-moderation-flow.test');
  await runChatDeletionModerationMobileTests();
  const { runUnifiedVideoPlayerTests } = await import('./unified-video-player.test');
  await runUnifiedVideoPlayerTests();
  const { runInlineVideoPlaybackTests } = await import('./inline-video-playback.test');
  await runInlineVideoPlaybackTests();
  const { runWebToMobilePostParityTests } = await import('./web-to-mobile-post-parity.test');
  await runWebToMobilePostParityTests();
  const { runDesignSystemFoundationTests } = await import('./design-system-foundation.test');
  await runDesignSystemFoundationTests();
  const { runGroupsCommunityUiTests } = await import('./groups-community-ui.test');
  await runGroupsCommunityUiTests();
  const { runMatrimonialUiTests } = await import('./matrimonial-ui.test');
  await runMatrimonialUiTests();
  const { runProfileSettingsUiTests } = await import('./profile-settings-ui.test');
  await runProfileSettingsUiTests();
  const { runAuthUiTests } = await import('./auth-ui.test');
  await runAuthUiTests();
  const { runNavigationBottomSheetTests } = await import('./navigation-bottom-sheet.test');
  await runNavigationBottomSheetTests();
  const { runChatUiTests } = await import('./chat-ui.test');
  await runChatUiTests();
  const { runMatrimonialProfileManagementTests } = await import('./matrimonial-profile-management.test');
  await runMatrimonialProfileManagementTests();
  const { runEmploymentFlowTests } = await import('./employment-flow.test');
  await runEmploymentFlowTests();
  const { runGovernmentSchemesFlowTests } = await import('./government-schemes-flow.test');
  await runGovernmentSchemesFlowTests();
  const { runPasswordRecoveryFlowTests } = await import('./password-recovery-flow.test');
  await runPasswordRecoveryFlowTests();
  const { runNotificationsFlowTests } = await import('./notifications-flow.test');
  await runNotificationsFlowTests();
  const { runMatrimonialNavigationFixTests } = await import('./matrimonial-navigation-fix.test');
  await runMatrimonialNavigationFixTests();
  const { runYouTubeChatPreviewTests } = await import('./youtube-chat-preview.test');
  await runYouTubeChatPreviewTests();
  const { runRealPushNotificationsTests } = await import('./real-push-notifications.test');
  await runRealPushNotificationsTests();
}

runAll()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test runner failure:', err);
    process.exit(1);
  });
