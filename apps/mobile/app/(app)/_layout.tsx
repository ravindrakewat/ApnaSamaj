import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';

export default function AppLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTintColor: theme.colors.textPrimary,
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 18,
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="post/[id]"
        options={{
          title: 'पोस्ट विवरण',
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="post/create"
        options={{
          title: 'नई पोस्ट',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="directory/index"
        options={{
          title: 'सदस्य निर्देशिका',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="directory/[id]"
        options={{
          title: 'सदस्य प्रोफ़ाइल',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="groups/index"
        options={{
          title: 'समाज समूह',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="group/[slug]"
        options={{
          title: 'समूह विवरण',
          headerShown: false,
        }}
      />
    </Stack>
  );
}

