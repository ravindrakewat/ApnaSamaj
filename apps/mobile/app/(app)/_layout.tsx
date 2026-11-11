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
          headerShown: false,
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
      <Stack.Screen
        name="group/[slug]/chat"
        options={{
          title: 'समूह चैट',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="matrimonial/index"
        options={{
          title: 'विवाह परिचय',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="matrimonial/[id]"
        options={{
          title: 'विवाह प्रोफ़ाइल',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="matrimonial/manage"
        options={{
          title: 'विवाह बायोडाटा',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="employment/index"
        options={{
          title: 'रोजगार व करियर',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="employment/[id]"
        options={{
          title: 'नौकरी विवरण',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="government-schemes/index"
        options={{
          title: 'सरकारी योजनाएँ',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="government-schemes/[id]"
        options={{
          title: 'योजना विवरण',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="chat/index"
        options={{
          title: 'संदेश व चैट',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="chat/[id]"
        options={{
          title: 'निजी चैट',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="profile/index"
        options={{
          title: 'मेरी प्रोफ़ाइल',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="profile/settings"
        options={{
          title: 'सेटिंग्स',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="notifications/index"
        options={{
          title: 'सूचनाएँ',
          headerShown: false,
        }}
      />
    </Stack>
  );
}

