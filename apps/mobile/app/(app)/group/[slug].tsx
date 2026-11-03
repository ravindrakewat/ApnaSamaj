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
import {
  GroupDetails,
  GroupPrivacy,
  GroupMemberRole,
  PostItem,
  PostMediaItem,
} from '@apnasamaj/shared-types';
import {
  Typography,
  Card,
  Button,
  Badge,
  PostCard,
  VideoModal,
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
  const { language } = useLocalization();
  const { communitySlug } = useAuth();

  // Group Details State
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [loadingGroup, setLoadingGroup] = useState<boolean>(true);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [isLeaving, setIsLeaving] = useState<boolean>(false);
  const [imageError, setImageError] = useState<boolean>(false);

  // Discussions State
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loadingPosts, setLoadingPosts] = useState<boolean>(false);
  const [refreshingPosts, setRefreshingPosts] = useState<boolean>(false);
  const [fetchingMorePosts, setFetchingMorePosts] = useState<boolean>(false);
  const [postsError, setPostsError] = useState<string | null>(null);

  // Media Modal
  const [activeVideo, setActiveVideo] = useState<PostMediaItem | null>(null);

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

  const handleLeave = () => {
    if (!group || isLeaving) return;

    // Check last administrator protection
    if (group.myRole === 'ADMIN') {
      // Backend validates that sole admins cannot leave without assigning another admin
      Alert.alert(
        language === 'hi' ? 'समूह छोड़ें' : 'Leave Group',
        language === 'hi'
          ? 'यदि आप एकमात्र व्यवस्थापक हैं, तो समूह छोड़ने से पहले किसी अन्य सदस्य को व्यवस्थापक नियुक्त करना आवश्यक है। क्या आप जारी रखना चाहते हैं?'
          : 'As an administrator, you cannot leave the group if you are the sole admin without assigning another admin first. Do you want to proceed?',
        [
          { text: language === 'hi' ? 'रद्द करें' : 'Cancel', style: 'cancel' },
          {
            text: language === 'hi' ? 'छोड़ें' : 'Leave',
            style: 'destructive',
            onPress: executeLeave,
          },
        ]
      );
    } else {
      Alert.alert(
        language === 'hi' ? 'समूह छोड़ें' : 'Leave Group',
        language === 'hi'
          ? 'क्या आप सचमुच इस समूह से बाहर होना चाहते हैं?'
          : 'Are you sure you want to leave this group?',
        [
          { text: language === 'hi' ? 'रद्द करें' : 'Cancel', style: 'cancel' },
          {
            text: language === 'hi' ? 'छोड़ें' : 'Leave',
            style: 'destructive',
            onPress: executeLeave,
          },
        ]
      );
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to leave group.';
      Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', msg);
    } finally {
      setIsLeaving(false);
    }
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
        {/* Group Hero Card */}
        <Card style={styles.heroCard}>
          <View style={styles.heroRow}>
            {group.coverUrl && !imageError ? (
              <Image
                source={{ uri: group.coverUrl }}
                style={[styles.heroCover, { borderColor: theme.colors.border }]}
                onError={() => setImageError(true)}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[
                  styles.heroFallback,
                  {
                    backgroundColor: theme.colors.primaryLight,
                    borderColor: theme.colors.primary,
                  },
                ]}
              >
                <Typography variant="xl" weight="bold" color={theme.colors.primaryDark}>
                  {initial}
                </Typography>
              </View>
            )}

            <View style={styles.heroText}>
              <Typography variant="lg" weight="bold" color={theme.colors.textPrimary}>
                {group.name}
              </Typography>

              <View style={styles.heroBadges}>
                <Badge
                  label={
                    isPrivate
                      ? (language === 'hi' ? 'निजी समूह' : 'Private')
                      : (language === 'hi' ? 'सार्वजनिक मंडल' : 'Public')
                  }
                  variant={isPrivate ? 'warning' : 'info'}
                  size="sm"
                />
                <Badge label={communitySlug} variant="default" size="sm" />
              </View>

              <Typography variant="xs" color={theme.colors.textMuted}>
                👥 {group.membersCount} {language === 'hi' ? 'सदस्य' : 'members'} • 💬 {group.postsCount} {language === 'hi' ? 'चर्चाएं' : 'posts'}
              </Typography>
            </View>
          </View>

          {/* Description */}
          {group.description ? (
            <Typography variant="sm" color={theme.colors.textSecondary} style={styles.descText}>
              {group.description}
            </Typography>
          ) : null}

          {/* Membership Actions Row */}
          <View style={styles.actionRow}>
            {isMember ? (
              <View style={styles.memberActionGroup}>
                <Badge
                  label={
                    group.myRole === 'ADMIN'
                      ? (language === 'hi' ? 'प्रशासक' : 'Admin')
                      : group.myRole === 'MODERATOR'
                      ? (language === 'hi' ? 'मॉडरेटर' : 'Moderator')
                      : (language === 'hi' ? 'सदस्य' : 'Member')
                  }
                  variant="success"
                  size="md"
                />
                <Button
                  title={language === 'hi' ? 'समूह छोड़ें' : 'Leave'}
                  variant="outline"
                  size="sm"
                  loading={isLeaving}
                  disabled={isLeaving}
                  onPress={handleLeave}
                />
              </View>
            ) : !isPrivate ? (
              <Button
                title={language === 'hi' ? 'समूह से जुड़ें' : 'Join Group'}
                variant="primary"
                size="sm"
                loading={isJoining}
                disabled={isJoining}
                onPress={handleJoin}
                style={styles.fullWidthBtn}
              />
            ) : (
              <View style={styles.privateNotice}>
                <Typography variant="xs" color={theme.colors.textMuted}>
                  🔒 {language === 'hi' ? 'निजी समूह — केवल आमंत्रण या व्यवस्थापक स्वीकृति द्वारा' : 'Private group — Invitation only'}
                </Typography>
              </View>
            )}
          </View>
        </Card>

        {/* Section Heading */}
        <View style={styles.discussionsHeaderRow}>
          <Typography variant="md" weight="bold" color={theme.colors.textPrimary}>
            {language === 'hi' ? 'समूह चर्चाएं' : 'Group Discussions'}
          </Typography>

          {isMember ? (
            <Pressable
              onPress={() => router.push('/(app)/post/create')}
              style={[styles.createPostPill, { backgroundColor: theme.colors.primaryLight }]}
              accessibilityRole="button"
            >
              <Typography variant="xs" weight="bold" color={theme.colors.primaryDark}>
                + {language === 'hi' ? 'नई चर्चा' : 'New Post'}
              </Typography>
            </Pressable>
          ) : null}
        </View>

        {/* Private Group Locked Access Guard */}
        {!isAuthorized ? (
          <Card style={styles.lockCard}>
            <Typography variant="xl" style={styles.lockIcon}>
              🔒
            </Typography>
            <Typography variant="md" weight="bold" color={theme.colors.textPrimary} align="center">
              {language === 'hi' ? 'निजी समूह सामग्री' : 'Private Group Content'}
            </Typography>
            <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.lockDesc}>
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
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Typography variant="xs" color={theme.colors.textMuted}>
            {language === 'hi' ? 'और चर्चाएं लोड हो रही हैं...' : 'Loading more discussions...'}
          </Typography>
        </View>
      );
    }
    if (page >= totalPages && posts.length > 0) {
      return (
        <View style={styles.footerDone}>
          <Typography variant="xs" color={theme.colors.textMuted}>
            {language === 'hi' ? 'सभी चर्चाएं लोड हो चुकी हैं' : 'All discussions loaded'}
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
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Typography variant="sm" color={theme.colors.textSecondary} style={styles.loadingText}>
            {language === 'hi' ? 'चर्चाएं लोड हो रही हैं...' : 'Loading discussions...'}
          </Typography>
        </View>
      );
    }

    if (postsError) {
      return (
        <Card style={styles.stateCard}>
          <Typography variant="md" weight="bold" color={theme.colors.error} align="center">
            {language === 'hi' ? 'चर्चाएं लोड नहीं हो सकीं' : 'Unable to Load Discussions'}
          </Typography>
          <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.errorDesc}>
            {postsError}
          </Typography>
          <Button
            title={language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
            variant="outline"
            onPress={() => loadGroupDiscussions(1)}
          />
        </Card>
      );
    }

    return (
      <Card style={styles.stateCard}>
        <Typography variant="md" weight="bold" color={theme.colors.textPrimary} align="center">
          {language === 'hi' ? 'अभी कोई चर्चा नहीं है' : 'No Discussions Yet'}
        </Typography>
        <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.emptyDesc}>
          {language === 'hi'
            ? 'इस समूह में बातचीत शुरू करने वाले पहले व्यक्ति बनें!'
            : 'Be the first to start a conversation in this group!'}
        </Typography>
        {isMember ? (
          <Button
            title={language === 'hi' ? 'चर्चा शुरू करें' : 'Start Discussion'}
            variant="primary"
            onPress={() => router.push('/(app)/post/create')}
          />
        ) : null}
      </Card>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {/* Top Header */}
      <View
        style={[
          styles.headerBar,
          { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={language === 'hi' ? 'वापस जाएं' : 'Back'}
        >
          <Typography variant="lg" weight="bold" color={theme.colors.primary}>
            ←
          </Typography>
        </Pressable>

        <Typography variant="md" weight="bold" color={theme.colors.textPrimary} numberOfLines={1} style={styles.headerTitle}>
          {group?.name || (language === 'hi' ? 'समूह विवरण' : 'Group Details')}
        </Typography>

        <View style={styles.headerSpacer} />
      </View>

      {/* Main Content Area */}
      {loadingGroup ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Typography variant="sm" color={theme.colors.textSecondary} style={styles.loadingText}>
            {language === 'hi' ? 'समूह लोड हो रहा है...' : 'Loading group...'}
          </Typography>
        </View>
      ) : groupError || !group ? (
        <View style={styles.errorPadding}>
          <Card style={styles.stateCard}>
            <Typography variant="lg" style={styles.errorIcon}>
              🏛️
            </Typography>
            <Typography variant="md" weight="bold" color={theme.colors.error} align="center">
              {language === 'hi' ? 'समूह उपलब्ध नहीं है' : 'Group Unavailable'}
            </Typography>
            <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.errorDesc}>
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
        <FlatList
          data={isAuthorized ? posts : []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              communitySlug={communitySlug}
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
              onPlayVideo={(media) => setActiveVideo(media)}
            />
          )}
          ListHeaderComponent={renderListHeader}
          ListFooterComponent={renderListFooter}
          ListEmptyComponent={renderEmptyDiscussions}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshingPosts}
              onRefresh={() => {
                loadGroupDetails();
                if (isAuthorized) {
                  loadGroupDiscussions(1, true);
                }
              }}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          onEndReached={() => {
            if (isAuthorized && page < totalPages && !fetchingMorePosts && !loadingPosts) {
              loadGroupDiscussions(page + 1);
            }
          }}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Video Modal Player */}
      <VideoModal
        visible={Boolean(activeVideo)}
        media={activeVideo}
        onClose={() => setActiveVideo(null)}
      />
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
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    elevation: 2,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  headerSpacer: {
    width: 24,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  loadingText: {
    marginTop: 8,
  },
  errorPadding: {
    padding: 16,
    marginTop: 24,
  },
  stateCard: {
    padding: 24,
    alignItems: 'center',
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  errorDesc: {
    marginTop: 6,
    marginBottom: 20,
  },
  emptyDesc: {
    marginTop: 6,
    marginBottom: 16,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  groupInfoContainer: {
    paddingTop: 12,
    marginBottom: 8,
  },
  heroCard: {
    padding: 16,
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  heroCover: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroFallback: {
    width: 72,
    height: 72,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  heroText: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  heroBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  descText: {
    marginBottom: 14,
    lineHeight: 18,
  },
  actionRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    paddingTop: 12,
  },
  memberActionGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fullWidthBtn: {
    width: '100%',
  },
  privateNotice: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  discussionsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  createPostPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  lockCard: {
    padding: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  lockIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  lockDesc: {
    marginTop: 6,
    lineHeight: 18,
  },
  footerLoader: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  footerDone: {
    alignItems: 'center',
    paddingVertical: 16,
  },
});

