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
          borderTopColor: '#E2E8F0',
          paddingBottom: Math.max(insets.bottom, 8),
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
            hitSlop={4}
          >
            {/* Top Active Indicator Highlight */}
            {isActive && <View style={[styles.activeIndicatorBar, { backgroundColor: theme.colors.primary }]} />}

            <View
              style={[
                styles.iconContainer,
                isActive && { backgroundColor: '#E0F2FE' },
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
              weight={isActive ? 'bold' : 'medium'}
              color={isActive ? theme.colors.primary : '#64748B'}
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 4,
    elevation: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    zIndex: 10,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    minWidth: 0,
    position: 'relative',
  },
  activeIndicatorBar: {
    position: 'absolute',
    top: -4,
    width: 24,
    height: 3,
    borderRadius: 1.5,
  },
  iconContainer: {
    width: 36,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  iconText: {
    fontSize: 15,
    lineHeight: 18,
  },
  tabLabel: {
    fontSize: 10.5,
    textAlign: 'center',
    letterSpacing: -0.1,
  },
});
