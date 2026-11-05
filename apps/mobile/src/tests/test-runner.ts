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
  if (id === 'react-native-safe-area-context') {
    return originalRequire.call(this, path.resolve(__dirname, './mocks/react-native-safe-area-context'));
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
}

runAll();
