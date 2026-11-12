import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/context/ThemeContext';
import { LocalizationProvider } from '../src/context/LocalizationContext';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { SplashScreen } from '../src/components/SplashScreen';
import { theme } from '../src/theme';
import {
  setupAndroidNotificationChannels,
  registerPushTokenWithBackend,
  setupPushTokenRefreshListener,
  setupNotificationListeners,
  checkColdStartNotification,
  consumePendingNotificationRoute,
  setPendingNotificationRoute,
} from '../src/services/notifications';

function NavigationGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      // Direct unauthenticated users to login
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Direct authenticated users to main app
      router.replace('/(app)');
    }
  }, [isAuthenticated, isLoading, segments, router]);

  useEffect(() => {
    if (!isAuthenticated) return;

    // 0. Route to any pending notification tapped before authentication was ready
    const pendingRoute = consumePendingNotificationRoute();
    if (pendingRoute) {
      router.push(pendingRoute as any);
    }

    // 1. Android notification channels
    setupAndroidNotificationChannels().catch(console.warn);

    // 2. FCM device token registration with backend
    registerPushTokenWithBackend().catch(console.warn);

    // 3. Runtime token refresh listener (re-registers on FCM rotation)
    const cleanupRefreshListener = setupPushTokenRefreshListener();

    // 4. Notification listeners (foreground receipt & background/tap interaction)
    const cleanupListeners = setupNotificationListeners({
      onNavigate: (route) => {
        router.push(route as any);
      },
    });

    // 5. Cold start notification tap (when opened from terminated state)
    checkColdStartNotification((route) => {
      router.push(route as any);
    }).catch(console.warn);

    return () => {
      cleanupRefreshListener();
      cleanupListeners();
    };
  }, [isAuthenticated, router]);

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      <Stack.Screen name="(app)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LocalizationProvider>
          <AuthProvider>
            <NavigationGate />
          </AuthProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
