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
  setupNotificationListeners,
  checkColdStartNotification,
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

    // 1. Android channels
    setupAndroidNotificationChannels().catch(console.warn);

    // 2. FCM device token registration
    registerPushTokenWithBackend().catch(console.warn);

    // 3. Notification listeners (foreground & tap)
    const cleanupListeners = setupNotificationListeners({
      onNavigate: (route) => {
        router.push(route as any);
      },
    });

    // 4. Cold start notification tap
    checkColdStartNotification((route) => {
      router.push(route as any);
    }).catch(console.warn);

    return () => {
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
