import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GroupDetails,
  GroupPrivacy,
  GroupMemberRole,
  PostItem,
} from '@apnasamaj/shared-types';
import {
  Typography,
  Card,
  Button,
  Badge,
  PostCard,
  AppHeader,
  ConfirmationDialog,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { groupsApi } from '../../../src/api/groups.api';
import { postsApi } from '../../../src/api/posts.api';

export default function GroupDetailsScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language } = useLocalization();
  const { communitySlug } = useAuth();

  // Group Details State
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [loadingGroup, setLoadingGroup] = useState<boolean>(true);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [isLeaving, setIsLeaving] = useState<boolean>(false);
  const [isLeaveDialogVisible, setIsLeaveDialogVisible] = useState<boolean>(false);
  const [imageError, setImageError] = useState<boolean>(false);

  // Discussions State
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loadingPosts, setLoadingPosts] = useState<boolean>(false);
  const [refreshingPosts, setRefreshingPosts] = useState<boolean>(false);
  const [fetchingMorePosts, setFetchingMorePosts] = useState<boolean>(false);
  const [postsError, setPostsError] = useState<string | null>(null);

  // Facebook-Style Inline Video Playback State (Only 1 active video)
  const [activePlayingPostId, setActivePlayingPostId] = useState<string | null>(null);
  const activePlayingPostIdRef = useRef<string | null>(null);

  useEffect(() => {
    activePlayingPostIdRef.current = activePlayingPostId;
  }, [activePlayingPostId]);

  // Pause & release decoder resources when the playing post scrolls out of visible viewport
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item: PostItem }> }) => {
    if (activePlayingPostIdRef.current) {
      const isStillVisible = viewableItems.some((v) => v.item?.id === activePlayingPostIdRef.current);
      if (!isStillVisible) {
        setActivePlayingPostId(null);
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 40,
  }).current;

  const isFetchingPostsRef = useRef<boolean>(false);

  /**
   * Loads group details by slug.
   */
  const loadGroupDetails = useCallback(async () => {
    if (!slug || !slug.trim()) {
      setGroupError(
        language === 'hi' ? 'समूह स्लग आवश्यक है।' : 'Group slug is required.'
      );
      setLoadingGroup(false);
      return;
    }

    setLoadingGroup(true);
    setGroupError(null);

    try {
      const data = await groupsApi.getGroupBySlug(slug.trim());
      setGroup(data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : language === 'hi'
            ? 'समूह विवरण लोड करने में असमर्थ।'
            : 'Failed to load group details.';
      setGroupError(msg);
    } finally {
      setLoadingGroup(false);
    }
  }, [slug, language]);

  /**
   * Loads group discussion posts.
   * Private groups require active membership.
   */
  const loadGroupDiscussions = useCallback(
    async (targetPage: number = 1, isRefresh: boolean = false) => {
      if (!slug || isFetchingPostsRef.current) return;
      isFetchingPostsRef.current = true;

      if (isRefresh) {
        setRefreshingPosts(true);
      } else if (targetPage === 1) {
        setLoadingPosts(true);
      } else {
        setFetchingMorePosts(true);
      }
      setPostsError(null);

      try {
        const res = await groupsApi.getGroupPosts(slug.trim(), targetPage, 10);
        if (targetPage === 1) {
          setPosts(res.posts);
        } else {
          setPosts((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const newPosts = res.posts.filter((p) => !existingIds.has(p.id));
            return [...prev, ...newPosts];
          });
        }
        setPage(targetPage);
        setTotalPages(res.pagination.totalPages);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : language === 'hi'
              ? 'समूह चर्चाएं लोड करने में समस्या हुई।'
              : 'Failed to load group discussions.';
        setPostsError(msg);
      } finally {
        isFetchingPostsRef.current = false;
        setLoadingPosts(false);
        setRefreshingPosts(false);
        setFetchingMorePosts(false);
      }
    },
    [slug, language]
  );

  useEffect(() => {
    loadGroupDetails();
  }, [loadGroupDetails]);

  // Load discussions once group details are fetched and access is verified
  useEffect(() => {
    if (group) {
      const canAccess = group.privacy === 'PUBLIC' || group.isMember;
      if (canAccess) {
        loadGroupDiscussions(1);
      }
    }
  }, [group, loadGroupDiscussions]);

  const handleJoin = async () => {
    if (!group || isJoining) return;
    setIsJoining(true);

    try {
      const res = await groupsApi.joinGroup(group.id);
      setGroup((prev) =>
        prev
          ? {
            ...prev,
            isMember: true,
            myRole: res.role,
            membersCount: prev.membersCount + 1,
          }
          : null
      );
      Alert.alert(
        language === 'hi' ? 'सफल' : 'Success',
        res.message || (language === 'hi' ? 'समूह में सफलतापूर्वक शामिल हुए!' : 'Joined group successfully!')
      );
      // Reload discussions now that user is a member
      loadGroupDiscussions(1, true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to join group.';
      Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', msg);
    } finally {
      setIsJoining(false);
    }
  };

  const executeLeave = async () => {
    if (!group) return;
    setIsLeaving(true);

    try {
      const res = await groupsApi.leaveGroup(group.id);
      setGroup((prev) =>
        prev
          ? {
            ...prev,
            isMember: false,
            myRole: null,
            membersCount: Math.max(0, prev.membersCount - 1),
          }
          : null
      );
      Alert.alert(
        language === 'hi' ? 'सफल' : 'Success',
        res.message || (language === 'hi' ? 'आप समूह से बाहर हो गए हैं।' : 'Left group successfully.')
      );

      // If group is private, clear discussions
      if (group.privacy === 'PRIVATE') {
        setPosts([]);
      }
      setIsLeaveDialogVisible(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to leave group.';
      Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', msg);
    } finally {
      setIsLeaving(false);
      setIsLeaveDialogVisible(false);
    }
  };

  const handleLeave = () => {
    if (!group || isLeaving) return;
    setIsLeaveDialogVisible(true);
  };

  const handleToggleLike = async (postId: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    if (post.isLikedByMe) {
      const res = await postsApi.unlikePost(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, isLikedByMe: false, likesCount: res.likesCount } : p
        )
      );
    } else {
      const res = await postsApi.likePost(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, isLikedByMe: true, likesCount: res.likesCount } : p
        )
      );
    }
  };

  const isPrivate = group?.privacy === 'PRIVATE';
  const isMember = Boolean(group?.isMember);
  const isAuthorized = !isPrivate || isMember;
  const initial = group?.name ? group.name.trim().charAt(0).toUpperCase() : 'स';

  // Header Component for Discussions FlatList
  const renderListHeader = () => {
    if (!group) return null;

    return (
      <View style={styles.groupInfoContainer}>
        {/* 1. Group Hero Card */}
        <Card style={styles.heroCard}>
          <View style={styles.heroRow}>
            {group.coverUrl && !imageError ? (
              <Image
                source={{ uri: group.coverUrl }}
                style={styles.heroCover}
                onError={() => setImageError(true)}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.heroFallback}>
                <Typography variant="xl" weight="bold" color="#0369A1" style={styles.fallbackText}>
                  {initial}
                </Typography>
              </View>
            )}

            <View style={styles.heroText}>
              <Typography variant="lg" weight="bold" color="#0F172A" style={styles.heroTitle}>
                {group.name}
              </Typography>

              <View style={styles.heroBadges}>
                <Badge
                  label={
                    isPrivate
                      ? (language === 'hi' ? '🔒 निजी समूह' : '🔒 Private Group')
                      : (language === 'hi' ? 'सार्वजनिक मंडल' : 'Public Group')
                  }
                  variant={isPrivate ? 'warning' : 'info'}
                  size="sm"
                />
                <View style={styles.slugBadgePill}>
                  <Typography variant="xs" weight="bold" color="#0369A1" style={styles.slugBadgeText}>
                    {communitySlug}
                  </Typography>
                </View>
                {isMember && group.myRole && (
                  <Badge
                    label={
                      group.myRole === 'ADMIN'
                        ? (language === 'hi' ? 'प्रशासक' : 'Admin')
                        : group.myRole === 'MODERATOR'
                          ? (language === 'hi' ? 'मॉडरेटर' : 'Moderator')
                          : (language === 'hi' ? 'सदस्य' : 'Member')
                    }
                    variant="success"
                    size="sm"
                  />
                )}
              </View>

              <Typography variant="xs" color="#64748B" style={styles.statsSubtitle}>
                👥 {group.membersCount} {language === 'hi' ? 'सदस्य' : 'members'} • 💬 {group.postsCount} {language === 'hi' ? 'चर्चाएं' : 'posts'}
              </Typography>
            </View>
          </View>

          {/* Description */}
          {group.description ? (
            <Typography variant="sm" color="#334155" style={styles.descText}>
              {group.description}
            </Typography>
          ) : null}

          {/* Membership Actions Row */}
          <View style={styles.actionRow}>
            {isMember ? (
              <Button
                title={language === 'hi' ? 'समूह छोड़ें' : 'Leave Group'}
                variant="outline"
                size="sm"
                loading={isLeaving}
                disabled={isLeaving}
                onPress={handleLeave}
                style={styles.leaveBtn}
              />
            ) : !isPrivate ? (
              <Button
                title={language === 'hi' ? 'समूह से जुड़ें' : 'Join Group'}
                variant="primary"
                size="md"
                loading={isJoining}
                disabled={isJoining}
                onPress={handleJoin}
                style={styles.fullWidthBtn}
              />
            ) : (
              <View style={styles.privateNotice}>
                <Typography variant="xs" color="#64748B">
                  🔒 {language === 'hi' ? 'निजी समूह — केवल आमंत्रण या व्यवस्थापक स्वीकृति द्वारा' : 'Private group — Invitation only'}
                </Typography>
              </View>
            )}
          </View>

          {/* 2. Real-time Group Live Chat Banner CTA */}
          <Pressable
            onPress={() => router.push(`/(app)/group/${slug}/chat` as any)}
            style={styles.chatCtaBanner}
            accessibilityRole="button"
            accessibilityLabel={language === 'hi' ? 'समूह चैट खोलें' : 'Open group chat'}
          >
            <View style={styles.chatCtaLeft}>
              <View style={styles.chatCtaIconBox}>
                <Typography variant="md">💬</Typography>
              </View>
              <View style={styles.chatCtaText}>
                <Typography variant="sm" weight="bold" color="#15803D">
                  {language === 'hi' ? 'लाइव समूह चैट (Live Group Chat)' : 'Live Group Chat'}
                </Typography>
                <Typography variant="xs" color="#166534">
                  {language === 'hi'
                    ? 'सदस्यों के साथ तुरंत बातचीत करें'
                    : 'Chat in real-time with group members'}
                </Typography>
              </View>
            </View>
            <Typography variant="md" weight="bold" color="#16A34A" style={styles.chatCtaArrow}>
              →
            </Typography>
          </Pressable>
        </Card>

        {/* 3. Section Heading */}
        <View style={styles.discussionsHeaderRow}>
          <Typography variant="md" weight="bold" color="#0F172A">
            {language === 'hi' ? 'समूह चर्चाएं' : 'Group Discussions'}
          </Typography>

          {isMember ? (
            <Pressable
              onPress={() => router.push('/(app)/post/create')}
              style={styles.createPostPill}
              accessibilityRole="button"
              hitSlop={6}
            >
              <Typography variant="xs" weight="bold" color="#1976D2">
                + {language === 'hi' ? 'नई चर्चा' : 'New Post'}
              </Typography>
            </Pressable>
          ) : null}
        </View>

        {/* 4. Private Group Locked Access Guard */}
        {!isAuthorized ? (
          <Card style={styles.lockCard}>
            <View style={styles.lockIconCircle}>
              <Typography variant="xl">🔒</Typography>
            </View>
            <Typography variant="md" weight="bold" color="#0F172A" align="center" style={styles.lockTitle}>
              {language === 'hi' ? 'निजी समूह सामग्री' : 'Private Group Content'}
            </Typography>
            <Typography variant="sm" color="#64748B" align="center" style={styles.lockDesc}>
              {language === 'hi'
                ? 'इस समूह की चर्चाएं निजी हैं और केवल अधिकृत सदस्यों को दिखाई देती हैं।'
                : 'Discussions in this group are private and only visible to authorized members.'}
            </Typography>
          </Card>
        ) : null}
      </View>
    );
  };

  // Footer Component for Discussions
  const renderListFooter = () => {
    if (fetchingMorePosts) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color="#1976D2" />
          <Typography variant="xs" color="#64748B">
            {language === 'hi' ? 'और चर्चाएं लोड हो रही हैं...' : 'Loading more discussions...'}
          </Typography>
        </View>
      );
    }
    if (page >= totalPages && posts.length > 0) {
      return (
        <View style={styles.footerDone}>
          <Typography variant="xs" color="#94A3B8">
            {language === 'hi' ? '• सभी चर्चाएं लोड हो चुकी हैं •' : '• All discussions loaded •'}
          </Typography>
        </View>
      );
    }
    return null;
  };

  // Empty State Component for Discussions
  const renderEmptyDiscussions = () => {
    if (!isAuthorized) return null;

    if (loadingPosts) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#1976D2" />
          <Typography variant="sm" color="#64748B" style={styles.loadingText}>
            {language === 'hi' ? 'चर्चाएं लोड हो रही हैं...' : 'Loading discussions...'}
          </Typography>
        </View>
      );
    }

    if (postsError) {
      return (
        <Card style={styles.stateCard}>
          <Typography variant="md" weight="bold" color="#DC2626" align="center">
            {postsError}
          </Typography>
          <Button
            title={language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
            variant="outline"
            size="sm"
            onPress={() => loadGroupDiscussions(1)}
            style={styles.retryBtn}
          />
        </Card>
      );
    }

    return (
      <Card style={styles.stateCard}>
        <View style={styles.stateIconCircle}>
          <Typography variant="lg">💬</Typography>
        </View>
        <Typography variant="md" weight="bold" color="#0F172A" align="center" style={styles.emptyTitle}>
          {language === 'hi' ? 'अभी कोई चर्चा नहीं है' : 'No Discussions Yet'}
        </Typography>
        <Typography variant="sm" color="#64748B" align="center" style={styles.emptyDesc}>
          {language === 'hi'
            ? 'इस समूह में पहली चर्चा शुरू करें और सदस्यों के साथ विचार साझा करें।'
            : 'Start the first discussion in this group and connect with members.'}
        </Typography>
        {isMember ? (
          <Button
            title={language === 'hi' ? 'नई चर्चा शुरू करें' : 'Start Discussion'}
            variant="primary"
            size="sm"
            onPress={() => router.push('/(app)/post/create')}
            style={styles.createDiscussionBtn}
          />
        ) : null}
      </Card>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: '#F8FAFC' }]}>
      {/* 1. Unified AppHeader in Detail Mode */}
      <AppHeader
        mode="detail"
        title={group?.name || (language === 'hi' ? 'समूह विवरण' : 'Group Details')}
        communitySlug={communitySlug}
        showBackButton={true}
        onBackPress={() => router.back()}
      />

      {/* 2. Main Content Area */}
      {loadingGroup ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#1976D2" />
          <Typography variant="sm" color="#64748B" style={styles.loadingText}>
            {language === 'hi' ? 'समूह लोड हो रहा है...' : 'Loading group...'}
          </Typography>
        </View>
      ) : groupError || !group ? (
        <View style={styles.errorPadding}>
          <Card style={styles.stateCard}>
            <View style={styles.stateIconCircle}>
              <Typography variant="lg">🏛️</Typography>
            </View>
            <Typography variant="md" weight="bold" color="#DC2626" align="center">
              {language === 'hi' ? 'समूह उपलब्ध नहीं है' : 'Group Unavailable'}
            </Typography>
            <Typography variant="sm" color="#64748B" align="center" style={styles.errorDesc}>
              {groupError ||
                (language === 'hi'
                  ? 'यह समूह नहीं मिला या वर्तमान में इस समुदाय में उपलब्ध नहीं है।'
                  : 'This group could not be found or is not available in this community.')}
            </Typography>
            <Button
              title={language === 'hi' ? 'वापस जाएं' : 'Back to Groups'}
              variant="outline"
              onPress={() => router.back()}
            />
          </Card>
        </View>
      ) : (
        /* 3. Group Discussions FlatList */
        <FlatList
          data={isAuthorized ? posts : []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              communitySlug={communitySlug}
              isPlayingInline={activePlayingPostId === item.id}
              onPlayInline={(postId) => setActivePlayingPostId(postId)}
              onPauseInline={() => setActivePlayingPostId(null)}
              onPressPost={(postId) =>
                router.push({
                  pathname: '/(app)/post/[id]',
                  params: { id: postId },
                })
              }
              onPressComments={(postId) =>
                router.push({
                  pathname: '/(app)/post/[id]',
                  params: { id: postId },
                })
              }
              onToggleLike={handleToggleLike}
            />
          )}
          ListHeaderComponent={renderListHeader}
          ListFooterComponent={renderListFooter}
          ListEmptyComponent={renderEmptyDiscussions}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 32 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshingPosts}
              onRefresh={() => {
                loadGroupDetails();
                if (isAuthorized) {
                  loadGroupDiscussions(1, true);
                }
              }}
              colors={['#1976D2']}
              tintColor="#1976D2"
            />
          }
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onEndReached={() => {
            if (isAuthorized && page < totalPages && !fetchingMorePosts && !loadingPosts) {
              loadGroupDiscussions(page + 1);
            }
          }}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Leave Group Confirmation Dialog */}
      <ConfirmationDialog
        visible={isLeaveDialogVisible}
        title={language === 'hi' ? 'समूह छोड़ें' : 'Leave Group'}
        message={
          group?.myRole === 'ADMIN'
            ? language === 'hi'
              ? 'यदि आप एकमात्र व्यवस्थापक हैं, तो समूह छोड़ने से पहले किसी अन्य सदस्य को व्यवस्थापक नियुक्त करना आवश्यक है। क्या आप जारी रखना चाहते हैं?'
              : 'As an administrator, you cannot leave the group if you are the sole admin without assigning another admin first. Do you want to proceed?'
            : language === 'hi'
              ? 'क्या आप सचमुच इस समूह से बाहर होना चाहते हैं?'
              : 'Are you sure you want to leave this group?'
        }
        confirmLabel={language === 'hi' ? 'समूह छोड़ें' : 'Leave Group'}
        cancelLabel={language === 'hi' ? 'रद्द करें' : 'Cancel'}
        variant="danger"
        icon="🚪"
        loading={isLeaving}
        onConfirm={executeLeave}
        onCancel={() => setIsLeaveDialogVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
  },
  groupInfoContainer: {
    paddingTop: 10,
    marginBottom: 4,
  },
  heroCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 10,
  },
  heroCover: {
    width: 60,
    height: 60,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
  },
  heroFallback: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: '#E0F2FE',
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    fontSize: 24,
    lineHeight: 28,
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  heroBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  slugBadgePill: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  slugBadgeText: {
    fontSize: 10.5,
  },
  statsSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  descText: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
  actionRow: {
    marginTop: 4,
    marginBottom: 4,
  },
  leaveBtn: {
    alignSelf: 'flex-start',
  },
  fullWidthBtn: {
    width: '100%',
  },
  privateNotice: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chatCtaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  chatCtaLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chatCtaIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatCtaText: {
    flex: 1,
  },
  chatCtaArrow: {
    fontSize: 18,
    marginLeft: 8,
  },
  discussionsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    marginBottom: 4,
  },
  createPostPill: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  lockCard: {
    padding: 24,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  lockIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  lockTitle: {
    marginBottom: 6,
  },
  lockDesc: {
    lineHeight: 19,
  },
  centerContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    marginTop: 8,
  },
  errorPadding: {
    padding: 16,
  },
  stateCard: {
    padding: 24,
    alignItems: 'center',
    borderRadius: 14,
    borderColor: '#E2E8F0',
  },
  stateIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    marginBottom: 6,
  },
  emptyDesc: {
    marginBottom: 16,
    lineHeight: 18,
  },
  errorDesc: {
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 12,
  },
  createDiscussionBtn: {
    minWidth: 150,
  },
  footerLoader: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  footerDone: {
    alignItems: 'center',
    paddingVertical: 18,
  },
});
