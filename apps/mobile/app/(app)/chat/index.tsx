import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Image,
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
  Card,
  Button,
  Input,
  Badge,
  BottomNavigation,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { chatApi } from '../../../src/api/chat.api';
import { groupsApi } from '../../../src/api/groups.api';
import { getChatSocket, connectChatSocket } from '../../../src/services/socket.service';

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
      // Refresh inbox list to update preview and unread counters
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

  const formatInboxTime = (dateString: string) => {
    try {
      const d = new Date(dateString);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      if (d.toDateString() === today.toDateString()) {
        return d.toLocaleTimeString(language === 'hi' ? 'hi-IN' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      if (d.toDateString() === yesterday.toDateString()) {
        return language === 'hi' ? 'कल' : 'Yesterday';
      }
      return d.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-US', {
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return '';
    }
  };

  const renderChatItem = ({ item }: { item: UnifiedChatItem }) => {
    if (item.type === 'personal') {
      const initial = item.name.trim().charAt(0).toUpperCase() || 'M';

      return (
        <Pressable
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
          style={[styles.chatCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${item.lastMessage}`}
        >
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: theme.colors.primaryLight }]}>
                <Typography variant="sm" weight="bold" color={theme.colors.primaryDark}>
                  {initial}
                </Typography>
              </View>
            )}
          </View>

          {/* Details */}
          <View style={styles.chatDetails}>
            <View style={styles.chatHeaderRow}>
              <Typography variant="sm" weight="bold" color={theme.colors.textPrimary} numberOfLines={1} style={styles.chatName}>
                {item.name}
              </Typography>
              <Typography variant="xs" color={theme.colors.textMuted} style={styles.timeText}>
                {formatInboxTime(item.timestamp)}
              </Typography>
            </View>

            <View style={styles.previewRow}>
              <Typography variant="xs" color={theme.colors.textSecondary} numberOfLines={1} style={styles.previewText}>
                {item.lastMessage}
              </Typography>

              {item.unreadCount > 0 && (
                <View style={[styles.unreadBadge, { backgroundColor: theme.colors.primary }]}>
                  <Typography variant="xs" weight="bold" color="#FFFFFF" style={styles.unreadCountText}>
                    {item.unreadCount > 99 ? '99+' : item.unreadCount}
                  </Typography>
                </View>
              )}
            </View>
          </View>
        </Pressable>
      );
    }

    // Group chat item
    return (
      <Pressable
        onPress={() => router.push(`/group/${item.slug}/chat` as any)}
        style={[styles.chatCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, Group Chat`}
      >
        {/* Group Cover / Icon */}
        <View style={styles.avatarContainer}>
          {item.coverUrl ? (
            <Image source={{ uri: item.coverUrl }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: '#F1F5F9' }]}>
              <Typography variant="md">🏛️</Typography>
            </View>
          )}
        </View>

        {/* Details */}
        <View style={styles.chatDetails}>
          <View style={styles.chatHeaderRow}>
            <Typography variant="sm" weight="bold" color={theme.colors.textPrimary} numberOfLines={1} style={styles.chatName}>
              {item.name}
            </Typography>
            <Badge
              label={item.privacy === GroupPrivacy.PRIVATE ? (language === 'hi' ? 'निजी' : 'Private') : (language === 'hi' ? 'सार्वजनिक' : 'Public')}
              variant={item.privacy === GroupPrivacy.PRIVATE ? 'warning' : 'info'}
              size="sm"
            />
          </View>

          <View style={styles.previewRow}>
            <Typography variant="xs" color={theme.colors.textSecondary} numberOfLines={1} style={styles.previewText}>
              {item.subtitle}
            </Typography>
            <Typography variant="xs" color={theme.colors.primary} weight="semibold">
              {language === 'hi' ? 'खोलें 💬' : 'Open 💬'}
            </Typography>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {/* Top Header */}
      <View
        style={[
          styles.headerBar,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
            paddingTop: Math.max(insets.top, 14),
          },
        ]}
      >
        <Typography variant="lg" weight="bold" color={theme.colors.textPrimary}>
          {language === 'hi' ? 'संदेश व चैट' : 'Chats & Messages'}
        </Typography>
        <Badge label={communitySlug} variant="default" size="sm" />
      </View>

      {/* Search Input Bar */}
      <View style={[styles.searchContainer, { backgroundColor: theme.colors.surface }]}>
        <Input
          placeholder={language === 'hi' ? 'नाम या समूह खोजें...' : 'Search chats or groups...'}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
          containerStyle={styles.searchInput}
        />
      </View>

      {/* Segmented Filter Tabs */}
      <View style={[styles.tabsContainer, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <Pressable
          onPress={() => setActiveTab('ALL')}
          style={[styles.tabButton, activeTab === 'ALL' && [styles.activeTab, { borderBottomColor: theme.colors.primary }]]}
        >
          <Typography
            variant="sm"
            weight={activeTab === 'ALL' ? 'bold' : 'regular'}
            color={activeTab === 'ALL' ? theme.colors.primary : theme.colors.textSecondary}
          >
            {language === 'hi' ? 'सभी चैट' : 'All Chats'}
          </Typography>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('PERSONAL')}
          style={[styles.tabButton, activeTab === 'PERSONAL' && [styles.activeTab, { borderBottomColor: theme.colors.primary }]]}
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
          contentContainerStyle={styles.listContent}
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
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  searchInput: {
    marginBottom: 0,
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
  activeTab: {
    borderBottomWidth: 2,
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
    fontSize: 44,
    marginBottom: 8,
  },
  emptySubtitle: {
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  emptyActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: 24,
  },
  chatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  chatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  chatName: {
    flex: 1,
  },
  timeText: {
    fontSize: 10,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  previewText: {
    flex: 1,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadCountText: {
    fontSize: 10,
  },
});
