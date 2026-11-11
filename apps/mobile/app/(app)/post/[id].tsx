import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PostItem, CommentItem as CommentItemType, PostMediaItem } from '@apnasamaj/shared-types';
import {
  Typography,
  Card,
  Input,
  Button,
  PostCard,
  CommentItem,
  AppHeader,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { postsApi } from '../../../src/api/posts.api';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { language, t } = useLocalization();
  const { communitySlug } = useAuth();

  // Post & Comments State
  const [post, setPost] = useState<PostItem | null>(null);
  const [comments, setComments] = useState<CommentItemType[]>([]);
  const [commentPage, setCommentPage] = useState<number>(1);
  const [hasMoreComments, setHasMoreComments] = useState<boolean>(false);
  const [isLoadingPost, setIsLoadingPost] = useState<boolean>(true);
  const [isLoadingComments, setIsLoadingComments] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // New Comment Submission
  const [newCommentText, setNewCommentText] = useState<string>('');
  const [isPostingComment, setIsPostingComment] = useState<boolean>(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  // Facebook-Style Inline Video Playback State
  const [isPlayingInline, setIsPlayingInline] = useState<boolean>(false);

  const isPostingRef = useRef(false);

  // Load post details and comments
  const loadPostAndComments = useCallback(async () => {
    if (!id) return;
    setIsLoadingPost(true);
    setError(null);

    try {
      // Parallel post details and initial comments fetch
      const [postData, commentsData] = await Promise.all([
        postsApi.getPost(id),
        postsApi.getComments(id, 1, 10).catch(() => ({
          comments: [],
          pagination: { page: 1, limit: 10, totalComments: 0, totalPages: 1, hasMore: false },
        })),
      ]);

      setPost(postData);
      setComments(commentsData.comments);
      setCommentPage(1);
      setHasMoreComments(commentsData.pagination.hasMore);

      // Best-effort view recording
      postsApi.recordView(id);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : language === 'hi'
          ? 'पोस्ट लोड करने में असमर्थ।'
          : 'Unable to load post details.';
      setError(msg);
    } finally {
      setIsLoadingPost(false);
    }
  }, [id, language]);

  useEffect(() => {
    loadPostAndComments();
  }, [loadPostAndComments]);

  // Load more comments
  const handleLoadMoreComments = async () => {
    if (!id || isLoadingComments || !hasMoreComments) return;
    setIsLoadingComments(true);

    try {
      const nextPage = commentPage + 1;
      const res = await postsApi.getComments(id, nextPage, 10);
      setComments((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const newItems = res.comments.filter((c) => !existingIds.has(c.id));
        return [...prev, ...newItems];
      });
      setCommentPage(nextPage);
      setHasMoreComments(res.pagination.hasMore);
    } catch {
      // Ignore load more comment error
    } finally {
      setIsLoadingComments(false);
    }
  };

  // Toggle Like on post
  const handleToggleLike = async (postId: string) => {
    if (!post) return;
    if (post.isLikedByMe) {
      const res = await postsApi.unlikePost(postId);
      setPost((prev) =>
        prev ? { ...prev, isLikedByMe: false, likesCount: res.likesCount } : null
      );
    } else {
      const res = await postsApi.likePost(postId);
      setPost((prev) =>
        prev ? { ...prev, isLikedByMe: true, likesCount: res.likesCount } : null
      );
    }
  };

  // Submit comment
  const handleSubmitComment = async () => {
    if (isPostingRef.current || !id) return;
    const trimmed = newCommentText.trim();
    if (!trimmed) return;

    isPostingRef.current = true;
    setIsPostingComment(true);
    setCommentError(null);

    try {
      const newComment = await postsApi.createComment(id, trimmed);
      setComments((prev) => [newComment, ...prev]);
      setNewCommentText('');
      // Update post comment count
      setPost((prev) =>
        prev ? { ...prev, commentsCount: (prev.commentsCount || 0) + 1 } : null
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : language === 'hi'
          ? 'कमेंट पोस्ट करने में विफल।'
          : 'Failed to post comment.';
      setCommentError(msg);
    } finally {
      isPostingRef.current = false;
      setIsPostingComment(false);
    }
  };

  if (isLoadingPost) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          mode="detail"
          title={language === 'hi' ? 'पोस्ट विवरण' : 'Post Details'}
          communitySlug={communitySlug}
          showBackButton={true}
        />
        <View style={styles.centerScreen}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Typography variant="sm" color={theme.colors.textSecondary} style={styles.loadingText}>
            {language === 'hi' ? 'पोस्ट लोड हो रही है...' : 'Loading post...'}
          </Typography>
        </View>
      </View>
    );
  }

  if (error || !post) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          mode="detail"
          title={language === 'hi' ? 'पोस्ट विवरण' : 'Post Details'}
          communitySlug={communitySlug}
          showBackButton={true}
        />
        <View style={styles.centerScreen}>
          <Card style={styles.errorCard}>
            <Typography variant="md" weight="bold" color={theme.colors.error} align="center">
              {language === 'hi' ? 'त्रुटि' : 'Error'}
            </Typography>
            <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.errorText}>
              {error || (language === 'hi' ? 'पोस्ट नहीं मिली।' : 'Post not found.')}
            </Typography>
            <Button
              title={language === 'hi' ? 'वापस जाएं' : 'Go Back'}
              variant="outline"
              onPress={() => router.back()}
            />
          </Card>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
    >
      <AppHeader
        mode="detail"
        title={language === 'hi' ? 'पोस्ट विवरण' : 'Post Details'}
        communitySlug={communitySlug}
        showBackButton={true}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Module Redirection Banners */}
        {(post.title?.startsWith('[सरकारी') || post.title?.startsWith('[Govt Scheme')) && (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(app)/government-schemes/[id]',
                params: { id: post.id },
              } as any)
            }
            style={styles.moduleBannerScheme}
            accessibilityRole="button"
            accessibilityLabel="Open dedicated government scheme page"
          >
            <Typography variant="xs" weight="bold" color="#0F766E">
              🏛️ {language === 'hi' ? 'सरकारी योजना विवरण पृष्ठ खोलें (पात्रता, दस्तावेज व लिंक) →' : 'Open Dedicated Scheme Details (Eligibility & Links) →'}
            </Typography>
          </Pressable>
        )}

        {(post.title?.startsWith('[रोजगार') || post.title?.startsWith('[Employment')) && (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(app)/employment/[id]',
                params: { id: post.id },
              } as any)
            }
            style={styles.moduleBannerEmployment}
            accessibilityRole="button"
            accessibilityLabel="Open dedicated employment page"
          >
            <Typography variant="xs" weight="bold" color="#1D4ED8">
              💼 {language === 'hi' ? 'नौकरी विवरण व आवेदन पृष्ठ खोलें →' : 'Open Dedicated Job Details & Apply →'}
            </Typography>
          </Pressable>
        )}

        {/* Full Post Card */}
        <PostCard
          post={post}
          communitySlug={communitySlug}
          isPlayingInline={isPlayingInline}
          onPlayInline={() => setIsPlayingInline(true)}
          onPauseInline={() => setIsPlayingInline(false)}
          onToggleLike={handleToggleLike}
        />

        {/* Comments Section */}
        <View style={styles.commentsSection}>
          <View style={styles.commentsHeaderRow}>
            <Typography variant="md" weight="bold" color={theme.colors.textPrimary}>
              {language === 'hi'
                ? `कमेंट (${post.commentsCount || comments.length})`
                : `Comments (${post.commentsCount || comments.length})`}
            </Typography>
          </View>

          {/* Comments List */}
          {comments.length === 0 ? (
            <Card style={styles.emptyCommentsCard}>
              <Typography variant="sm" color={theme.colors.textMuted} align="center">
                {t('feed:noCommentsYet') ||
                  (language === 'hi'
                    ? 'अभी तक कोई कमेंट नहीं है। पहली टिप्पणी करके चर्चा शुरू करें!'
                    : 'No comments yet. Start the conversation!')}
              </Typography>
            </Card>
          ) : (
            comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} />
            ))
          )}

          {/* Load More Comments Button */}
          {hasMoreComments && (
            <Button
              title={
                isLoadingComments
                  ? language === 'hi'
                    ? 'लोड हो रहा है...'
                    : 'Loading...'
                  : language === 'hi'
                  ? 'और कमेंट देखें'
                  : 'Load more comments'
              }
              variant="outline"
              size="sm"
              loading={isLoadingComments}
              onPress={handleLoadMoreComments}
              style={styles.loadMoreBtn}
            />
          )}
        </View>
      </ScrollView>

      {/* Fixed Bottom Comment Composer */}
      <View
        style={[
          styles.composerBar,
          {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
          },
        ]}
      >
        {commentError && (
          <Typography variant="xs" color={theme.colors.error} style={styles.commentError}>
            {commentError}
          </Typography>
        )}

        <View style={styles.composerRow}>
          <Input
            placeholder={
              language === 'hi'
                ? 'समुदाय के लिए एक कमेंट लिखें...'
                : 'Write a comment for the community...'
            }
            value={newCommentText}
            onChangeText={setNewCommentText}
            containerStyle={styles.composerInput}
            multiline
          />
          <Button
            title={language === 'hi' ? 'भेजें' : 'Post'}
            size="sm"
            onPress={handleSubmitComment}
            loading={isPostingComment}
            disabled={!newCommentText.trim() || isPostingComment}
            style={styles.composerBtn}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 90,
  },
  centerScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
  },
  errorCard: {
    padding: 24,
    maxWidth: 320,
    alignItems: 'center',
  },
  errorText: {
    marginTop: 6,
    marginBottom: 16,
  },
  commentsSection: {
    marginTop: 8,
  },
  commentsHeaderRow: {
    marginBottom: 10,
  },
  emptyCommentsCard: {
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  loadMoreBtn: {
    marginVertical: 10,
  },
  composerBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  commentError: {
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  composerInput: {
    flex: 1,
    marginBottom: 0,
  },
  composerBtn: {
    height: 48,
    minWidth: 70,
  },
  moduleBannerScheme: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  moduleBannerEmployment: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
});

