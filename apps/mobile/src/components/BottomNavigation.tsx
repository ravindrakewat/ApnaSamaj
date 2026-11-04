import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography } from './Typography';
import { useTheme } from '../hooks/useTheme';
import { useLocalization } from '../hooks/useLocalization';

export type NavTab = 'feed' | 'directory' | 'groups' | 'matrimonial' | 'chat' | 'profile';

export interface BottomNavigationProps {
  activeTab: NavTab;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ activeTab }) => {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language } = useLocalization();

  const tabs: Array<{ key: NavTab; labelHi: string; labelEn: string; icon: string; route: string }> = [
    {
      key: 'feed',
      labelHi: 'फ़ीड',
      labelEn: 'Feed',
      icon: '📰',
      route: '/(app)',
    },
    {
      key: 'directory',
      labelHi: 'सदस्य',
      labelEn: 'Members',
      icon: '👥',
      route: '/(app)/directory',
    },
    {
      key: 'groups',
      labelHi: 'समूह',
      labelEn: 'Groups',
      icon: '🏛️',
      route: '/(app)/groups',
    },
    {
      key: 'matrimonial',
      labelHi: 'विवाह',
      labelEn: 'Matrimony',
      icon: '💍',
      route: '/(app)/matrimonial',
    },
    {
      key: 'chat',
      labelHi: 'चैट',
      labelEn: 'Chat',
      icon: '💬',
      route: '/(app)/chat',
    },
    {
      key: 'profile',
      labelHi: 'प्रोफ़ाइल',
      labelEn: 'Profile',
      icon: '👤',
      route: '/(app)/profile',
    },
  ];

  const handleTabPress = (tabKey: NavTab, route: string) => {
    if (activeTab === tabKey) return;
    router.push(route as any);
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const label = language === 'hi' ? tab.labelHi : tab.labelEn;

        return (
          <Pressable
            key={tab.key}
            onPress={() => handleTabPress(tab.key, tab.route)}
            style={styles.tabButton}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
          >
            <View
              style={[
                styles.iconContainer,
                isActive && { backgroundColor: theme.colors.primaryLight },
              ]}
            >
              <Typography
                variant="sm"
                style={styles.iconText}
              >
                {tab.icon}
              </Typography>
            </View>
            <Typography
              variant="xs"
              weight={isActive ? 'bold' : 'regular'}
              color={isActive ? theme.colors.primary : theme.colors.textMuted}
              style={styles.tabLabel}
              numberOfLines={1}
            >
              {label}
            </Typography>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    minWidth: 0,
  },
  iconContainer: {
    width: 32,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  iconText: {
    fontSize: 15,
    lineHeight: 17,
  },
  tabLabel: {
    fontSize: 10,
    textAlign: 'center',
  },
});
