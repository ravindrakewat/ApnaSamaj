import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DirectConversationItem,
  GroupListItem,
  GroupPrivacy,
} from '@apnasamaj/shared-types';
import {
  Typography,
  Button,
  SearchBar,
  AppHeader,
  BottomNavigation,
  ChatConversationCard,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { chatApi } from '../../../src/api/chat.api';
import { groupsApi } from '../../../src/api/groups.api';
import { connectChatSocket } from '../../../src/services/socket.service';

type InboxTab = 'ALL' | 'PERSONAL' | 'GROUPS';

export type UnifiedChatItem =
  | {
      type: 'personal';
      id: string;
      name: string;
      avatarUrl: string | null;
      lastMessage: string;
      timestamp: string;
      unreadCount: number;
      raw: DirectConversationItem;
    }
  | {
      type: 'group';
      id: string;
      slug: string;
      name: string;
      coverUrl: string | null;
      privacy: GroupPrivacy;
      subtitle: string;
      timestamp: string;
      raw: GroupListItem;
    };

export default function UnifiedChatInboxScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language } = useLocalization();
  const { communitySlug } = useAuth();

  const [activeTab, setActiveTab] = useState<InboxTab>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [personalChats, setPersonalChats] = useState<DirectConversationItem[]>([]);
  const [groups, setGroups] = useState<GroupListItem[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load inbox conversations and community groups in parallel
   */
  const loadInboxData = useCallback(async () => {
    setError(null);
    try {
      const [directRes, groupsRes] = await Promise.allSettled([
        chatApi.getDirectInbox({ limit: 50 }),
        groupsApi.listGroups({ limit: 50 }),
      ]);

      if (directRes.status === 'fulfilled') {
        setPersonalChats(directRes.value.conversations || []);
      } else {
        console.warn('[UnifiedInbox] Failed to load direct inbox:', directRes.reason);
      }

      if (groupsRes.status === 'fulfilled') {
        setGroups(groupsRes.value.groups || []);
      } else {
        console.warn('[UnifiedInbox] Failed to load groups:', groupsRes.reason);
      }

      if (directRes.status === 'rejected' && groupsRes.status === 'rejected') {
        setError(
          language === 'hi'
            ? 'चैट और समूह सूची लोड करने में विफल।'
            : 'Failed to load conversations and groups.'
        );
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'डेटा लोड करने में असमर्थ।';
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [language]);

  useEffect(() => {
    setIsLoading(true);
    loadInboxData();
  }, [loadInboxData]);

  // Real-time socket updates for incoming direct messages
  useEffect(() => {
    const socket = connectChatSocket();

    const handleNewMessage = () => {
      loadInboxData();
    };

    socket.on('direct:new_message', handleNewMessage);
    socket.on('direct:message_read', handleNewMessage);

    return () => {
      socket.off('direct:new_message', handleNewMessage);
      socket.off('direct:message_read', handleNewMessage);
    };
  }, [loadInboxData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadInboxData();
  };

  /**
   * Construct unified list sorted by latest activity
   */
  const unifiedItems: UnifiedChatItem[] = useMemo(() => {
    const list: UnifiedChatItem[] = [];

    // Map personal chats
    if (activeTab === 'ALL' || activeTab === 'PERSONAL') {
      personalChats.forEach((c) => {
        list.push({
          type: 'personal',
          id: c.id,
          name: c.otherUser.fullName,
          avatarUrl: c.otherUser.avatarUrl,
          lastMessage:
            c.lastMessage?.content ||
            (language === 'hi' ? 'कोई नया संदेश नहीं' : 'No messages yet'),
          timestamp: c.lastMessage?.createdAt || c.updatedAt,
          unreadCount: c.unreadCount || 0,
          raw: c,
        });
      });
    }

    // Map community groups
    if (activeTab === 'ALL' || activeTab === 'GROUPS') {
      groups.forEach((g) => {
        list.push({
          type: 'group',
          id: g.id,
          slug: g.slug,
          name: g.name,
          coverUrl: g.coverUrl,
          privacy: g.privacy,
          subtitle:
            language === 'hi'
              ? `${g.membersCount || 0} सदस्य • समूह चैट`
              : `${g.membersCount || 0} members • Group Chat`,
          timestamp: g.createdAt,
          raw: g,
        });
      });
    }

    // Sort descending by timestamp
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply search query filter
    const query = searchQuery.trim().toLowerCase();
    if (!query) return list;

    return list.filter((item) => item.name.toLowerCase().includes(query));
  }, [personalChats, groups, activeTab, searchQuery, language]);

  // Total unread count for badge
  const totalUnread = useMemo(() => {
    return personalChats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  }, [personalChats]);

  const renderChatItem = ({ item }: { item: UnifiedChatItem }) => {
    if (item.type === 'personal') {
      return (
        <ChatConversationCard
          type="personal"
          id={item.id}
          name={item.name}
          avatarUrl={item.avatarUrl}
          lastMessage={item.lastMessage}
          timestamp={item.timestamp}
          unreadCount={item.unreadCount}
          onPress={() =>
            router.push({
              pathname: '/chat/[id]',
              params: {
                id: item.id,
                name: item.name,
                avatar: item.avatarUrl || '',
              },
            } as any)
          }
        />
      );
    }

    return (
      <ChatConversationCard
        type="group"
        id={item.id}
        name={item.name}
        avatarUrl={item.coverUrl}
        subtitle={item.subtitle}
        timestamp={item.timestamp}
        privacy={item.privacy}
        onPress={() => router.push(`/group/${item.slug}/chat` as any)}
      />
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {/* Top Modern AppHeader */}
      <AppHeader
        mode="brand"
        title={language === 'hi' ? 'संदेश व बातचीत' : 'Chats & Messages'}
        communitySlug={communitySlug}
        rightAccessory={
          <Pressable
            onPress={() => router.push('/(app)/directory' as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={language === 'hi' ? 'निर्देशिका' : 'Directory'}
            style={styles.directoryIconButton}
          >
            <Typography variant="md">👥</Typography>
          </Pressable>
        }
      />

      {/* Search Input Bar */}
      <View style={[styles.searchContainer, { backgroundColor: theme.colors.surface }]}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={language === 'hi' ? 'नाम या समूह खोजें...' : 'Search chats or groups...'}
          onClear={() => setSearchQuery('')}
        />
      </View>

      {/* Modern Segmented Filter Tabs */}
      <View style={[styles.tabsContainer, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <Pressable
          onPress={() => setActiveTab('ALL')}
          style={[styles.tabButton, activeTab === 'ALL' && [styles.activeTab, { borderBottomColor: theme.colors.primary }]]}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'ALL' }}
        >
          <View style={styles.tabContentRow}>
            <Typography
              variant="sm"
              weight={activeTab === 'ALL' ? 'bold' : 'regular'}
              color={activeTab === 'ALL' ? theme.colors.primary : theme.colors.textSecondary}
            >
              {language === 'hi' ? 'सभी चैट' : 'All Chats'}
            </Typography>
            {totalUnread > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: theme.colors.primary }]}>
                <Typography variant="xs" weight="bold" color="#FFFFFF" style={styles.tabBadgeText}>
                  {totalUnread > 99 ? '99+' : totalUnread}
                </Typography>
              </View>
            )}
          </View>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('PERSONAL')}
          style={[styles.tabButton, activeTab === 'PERSONAL' && [styles.activeTab, { borderBottomColor: theme.colors.primary }]]}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'PERSONAL' }}
        >
          <Typography
            variant="sm"
            weight={activeTab === 'PERSONAL' ? 'bold' : 'regular'}
            color={activeTab === 'PERSONAL' ? theme.colors.primary : theme.colors.textSecondary}
          >
            {language === 'hi' ? 'व्यक्तिगत' : 'Personal'}
          </Typography>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('GROUPS')}
          style={[styles.tabButton, activeTab === 'GROUPS' && [styles.activeTab, { borderBottomColor: theme.colors.primary }]]}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'GROUPS' }}
        >
          <Typography
            variant="sm"
            weight={activeTab === 'GROUPS' ? 'bold' : 'regular'}
            color={activeTab === 'GROUPS' ? theme.colors.primary : theme.colors.textSecondary}
          >
            {language === 'hi' ? 'समूह' : 'Groups'}
          </Typography>
        </Pressable>
      </View>

      {/* Chat List Body */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Typography variant="sm" color={theme.colors.textSecondary} style={styles.loadingText}>
            {language === 'hi' ? 'चैट लोड हो रही हैं...' : 'Loading chats...'}
          </Typography>
        </View>
      ) : error && unifiedItems.length === 0 ? (
        <View style={styles.centerContainer}>
          <Typography variant="sm" color={theme.colors.error} align="center" style={styles.errorText}>
            {error}
          </Typography>
          <Button
            title={language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
            variant="outline"
            size="sm"
            onPress={loadInboxData}
          />
        </View>
      ) : unifiedItems.length === 0 ? (
        <View style={styles.centerContainer}>
          <Typography variant="lg" style={styles.emptyIcon}>
            💬
          </Typography>
          <Typography variant="md" weight="bold" color={theme.colors.textPrimary} align="center">
            {language === 'hi' ? 'कोई बातचीत नहीं मिली' : 'No conversations found'}
          </Typography>
          <Typography variant="xs" color={theme.colors.textMuted} align="center" style={styles.emptySubtitle}>
            {activeTab === 'PERSONAL'
              ? language === 'hi'
                ? 'सदस्य निर्देशिका में जाकर किसी भी सदस्य को संदेश भेजें।'
                : 'Visit the Member Directory to message community members.'
              : activeTab === 'GROUPS'
              ? language === 'hi'
                ? 'समूह अनुभाग में जाकर सामुदायिक समूहों से जुड़ें।'
                : 'Join community groups from the Groups tab to chat.'
              : language === 'hi'
              ? 'निर्देशिका या समूह से नई बातचीत शुरू करें।'
              : 'Start a new conversation from Members or Groups.'}
          </Typography>
          <View style={styles.emptyActionRow}>
            <Button
              title={language === 'hi' ? '👥 सदस्य निर्देशिका' : '👥 Member Directory'}
              variant="outline"
              size="sm"
              onPress={() => router.push('/(app)/directory' as any)}
            />
            <Button
              title={language === 'hi' ? '🏛️ समूह देखें' : '🏛️ View Groups'}
              variant="outline"
              size="sm"
              onPress={() => router.push('/(app)/groups' as any)}
            />
          </View>
        </View>
      ) : (
        <FlatList
          data={unifiedItems}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          renderItem={renderChatItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 64, 80) }]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[theme.colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Bottom Navigation */}
      <BottomNavigation activeTab="chat" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  directoryIconButton: {
    padding: 6,
    borderRadius: 8,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    fontSize: 9,
  },
  activeTab: {
    borderBottomWidth: 2.5,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 10,
  },
  errorText: {
    marginBottom: 12,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  emptySubtitle: {
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
