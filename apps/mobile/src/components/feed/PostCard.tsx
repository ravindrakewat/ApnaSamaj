import React, { useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Pressable,
  Share,
  Platform,
} from 'react-native';
import { PostItem, PostMediaItem } from '@apnasamaj/shared-types';
import { Typography } from '../Typography';
import { Card } from '../Card';
import { Badge } from '../Badge';
import { useTheme } from '../../hooks/useTheme';
import { useLocalization } from '../../hooks/useLocalization';
import { formatRelativeTime } from '../../utils/date';
import {
  identifyVideoSource,
  getYouTubeThumbnailUrl,
  getVideoSourceDetails,
} from '../../utils/video';
import { NativeVideoPlayer } from '../video/NativeVideoPlayer';
import { YouTubeVideoPlayer } from '../video/YouTubeVideoPlayer';

export interface PostCardProps {
  post: PostItem;
  onPressPost?: (postId: string) => void;
  onPressComments?: (postId: string) => void;
  onToggleLike?: (postId: string) => Promise<void>;
  onPlayVideo?: (media: PostMediaItem, postTitle?: string, authorName?: string) => void;
  communitySlug?: string;
  isPlayingInline?: boolean;
  onPlayInline?: (postId: string) => void;
  onPauseInline?: () => void;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  onPressPost,
  onPressComments,
  onToggleLike,
  onPlayVideo,
  communitySlug = 'demo',
  isPlayingInline = false,
  onPlayInline,
  onPauseInline,
}) => {
  const theme = useTheme();
  const { language, t } = useLocalization();

  // Optimistic like state
  const [isLiked, setIsLiked] = useState(Boolean(post.isLikedByMe));
  const [likesCount, setLikesCount] = useState(post.likesCount || 0);
  const [isLikePending, setIsLikePending] = useState(false);

  const handleLikePress = async () => {
    if (isLikePending || !onToggleLike) return;

    // Optimistic toggle
    const nextLiked = !isLiked;
    const nextCount = nextLiked ? likesCount + 1 : Math.max(0, likesCount - 1);

    setIsLiked(nextLiked);
    setLikesCount(nextCount);
    setIsLikePending(true);

    try {
      await onToggleLike(post.id);
    } catch {
      // Revert on failure
      setIsLiked(!nextLiked);
      setLikesCount(likesCount);
    } finally {
      setIsLikePending(false);
    }
  };

  const handleSharePress = async () => {
    try {
      const shareMessage = `${post.title ? post.title + '\n\n' : ''}${post.content}\n\n— Apna Samaj (${communitySlug})`;
      await Share.share({
        title: post.title || 'Apna Samaj Post',
        message: shareMessage,
      });
    } catch {
      // Ignore dismissed share sheets
    }
  };

  const images = post.media?.filter((m) => m.mediaType === 'IMAGE') || [];
  const videos = post.media?.filter((m) => m.mediaType === 'VIDEO') || [];

  const postTypeLabel =
    post.type === 'ANNOUNCEMENT'
      ? t('feed:postTypeAnnouncement') || (language === 'hi' ? 'महत्वपूर्ण सूचना' : 'Announcement')
      : post.type === 'EVENT'
        ? t('feed:postTypeEvent') || (language === 'hi' ? 'सामुदायिक आयोजन' : 'Community Event')
        : post.title?.startsWith('[रोजगार')
          ? (language === 'hi' ? '💼 रोजगार' : '💼 Employment')
          : post.title?.startsWith('[सरकारी')
            ? (language === 'hi' ? '🏛️ सरकारी योजना' : '🏛️ Govt Scheme')
            : post.title?.startsWith('[वैवाहिक')
              ? (language === 'hi' ? '💍 वैवाहिक' : '💍 Matrimonial')
              : null;

  const postTypeVariant =
    post.type === 'ANNOUNCEMENT'
      ? 'error'
      : post.type === 'EVENT'
        ? 'info'
        : post.title?.startsWith('[रोजगार')
          ? 'success'
          : post.title?.startsWith('[सरकारी')
            ? 'info'
            : post.title?.startsWith('[वैवाहिक')
              ? 'warning'
              : 'default';

  return (
    <Card style={styles.cardContainer}>
      {/* 1. Header: Author, Avatar, Badges & Timestamp */}
      <View style={styles.authorRow}>
        {/* Avatar or Initial Circle */}
        {post.author?.avatarUrl ? (
          <Image
            source={{ uri: post.author.avatarUrl }}
            style={styles.avatarImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.avatarInitial, { backgroundColor: theme.colors.primaryLight }]}>
            <Typography variant="sm" weight="bold" color={theme.colors.primaryDark}>
              {post.author?.fullName ? post.author.fullName.charAt(0).toUpperCase() : 'स'}
            </Typography>
          </View>
        )}

        {/* Author Details & Date */}
        <View style={styles.authorDetails}>
          <View style={styles.authorNameRow}>
            <Typography
              variant="sm"
              weight="semibold"
              color={theme.colors.textPrimary}
              numberOfLines={1}
              style={styles.authorName}
            >
              {post.author?.fullName || (language === 'hi' ? 'समाज सदस्य' : 'Community Member')}
            </Typography>
            {post.isPinned && (
              <Badge
                label={language === 'hi' ? '📌 पिन किया' : '📌 Pinned'}
                variant="warning"
                size="sm"
              />
            )}
          </View>

          <View style={styles.metaRow}>
            <Typography variant="xs" color={theme.colors.textMuted}>
              {formatRelativeTime(post.createdAt, language)}
            </Typography>
            {post.author?.city && (
              <Typography variant="xs" color={theme.colors.textMuted}>
                {' · '}{post.author.city}
              </Typography>
            )}
          </View>
        </View>

        {/* Post Type Badge */}
        {postTypeLabel && (
          <Badge
            label={postTypeLabel}
            variant={postTypeVariant as any}
            size="sm"
          />
        )}
      </View>

      {/* 2. Post Title (Optional from Batch 15D) */}
      {post.title ? (
        <Pressable
          onPress={() => onPressPost && onPressPost(post.id)}
          accessibilityRole="button"
          accessibilityLabel={`Post title: ${post.title}`}
        >
          <Typography
            variant="md"
            weight="bold"
            color={theme.colors.textPrimary}
            style={styles.postTitle}
          >
            {post.title}
          </Typography>
        </Pressable>
      ) : null}

      {/* 3. Post Content */}
      <Pressable
        onPress={() => onPressPost && onPressPost(post.id)}
        accessibilityRole="button"
        accessibilityLabel="Read full post"
      >
        <Typography
          variant="sm"
          color={theme.colors.textPrimary}
          style={styles.postContent}
          numberOfLines={onPressPost ? 6 : undefined}
        >
          {post.content}
        </Typography>
      </Pressable>

      {/* 4. Attached Images (Lightweight Single/Multi Preview) */}
      {images.length > 0 && (
        <Pressable
          onPress={() => onPressPost && onPressPost(post.id)}
          style={styles.mediaContainer}
          accessibilityRole="image"
          accessibilityLabel="Attached post photo"
        >
          <Image
            source={{ uri: images[0].thumbnail || images[0].url }}
            style={styles.postImage}
            resizeMode="cover"
          />
          {images.length > 1 && (
            <View style={styles.multiImagePill}>
              <Typography variant="xs" weight="bold" color="#FFFFFF">
                +{images.length - 1}
              </Typography>
            </View>
          )}
        </Pressable>
      )}

      {/* 5. Attached Video (Inline Facebook-Style Player or Preview Thumbnail) */}
      {videos.length > 0 && (() => {
        const video = videos[0];
        const details = getVideoSourceDetails(video.url, video.thumbnail);
        const isYt = details.sourceType === 'YOUTUBE';
        const displayThumb = details.thumbnailUrl || video.thumbnail || (isYt ? getYouTubeThumbnailUrl(video.url) : null);

        // If this post is currently active for inline playback in feed
        if (isPlayingInline) {
          return (
            <View style={styles.inlinePlayerContainer}>
              {isYt ? (
                <YouTubeVideoPlayer
                  embedUrl={details.playbackUrl}
                  youtubeId={details.youtubeId}
                  thumbnailUrl={displayThumb}
                  isFullscreen={false}
                  onPlaybackError={(err) => {
                    console.warn('[PostCard] Inline YouTube error:', err);
                  }}
                />
              ) : (
                <NativeVideoPlayer
                  videoUrl={details.playbackUrl}
                  thumbnailUrl={displayThumb}
                  autoPlay={true}
                  isFullscreen={false}
                  onPlaybackError={(err) => {
                    console.warn('[PostCard] Inline native video error:', err);
                  }}
                />
              )}
            </View>
          );
        }

        return (
          <Pressable
            onPress={() => {
              if (onPlayInline) {
                onPlayInline(post.id);
              } else if (onPlayVideo) {
                onPlayVideo(video, post.title || undefined, post.author?.fullName || undefined);
              } else if (onPressPost) {
                onPressPost(post.id);
              }
            }}
            style={[styles.videoContainer, { backgroundColor: '#1E293B' }]}
            accessibilityRole="button"
            accessibilityLabel={`Play video in post: ${post.title || 'Community post'}`}
          >
            {displayThumb ? (
              <Image
                source={{ uri: displayThumb }}
                style={styles.videoThumbnailImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.videoPlaceholder}>
                <Typography variant="xs" color="#94A3B8">
                  {language === 'hi' ? 'वीडियो पूर्वावलोकन' : 'Video Preview'}
                </Typography>
              </View>
            )}

            {/* Video Source Badge */}
            <View style={styles.videoSourceBadgePill}>
              <Badge
                label={isYt ? '🔴 YouTube' : (language === 'hi' ? '🎥 वीडियो' : '🎥 Video')}
                variant={isYt ? 'error' : 'info'}
                size="sm"
              />
            </View>

            {/* Centered Play Button Overlay */}
            <View style={styles.videoPlayOverlay}>
              <View style={styles.playIconCircle}>
                <Typography variant="lg" color="#FFFFFF" weight="bold" style={styles.playIconText}>
                  ▶
                </Typography>
              </View>
              <Typography variant="xs" weight="semibold" color="#FFFFFF" style={styles.videoLabel}>
                {language === 'hi' ? 'वीडियो देखें' : 'Watch Video'}
              </Typography>
            </View>
          </Pressable>
        );
      })()}

      {/* 6. Interaction Action Bar (Like, Comment, Share) */}
      <View style={[styles.actionBar, { borderTopColor: theme.colors.border }]}>
        {/* Like Button */}
        <Pressable
          onPress={handleLikePress}
          disabled={isLikePending}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel={isLiked ? 'Unlike post' : 'Like post'}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Typography
            variant="md"
            color={isLiked ? theme.colors.error : theme.colors.textSecondary}
          >
            {isLiked ? '❤️' : '🤍'}
          </Typography>
          <Typography
            variant="xs"
            weight={isLiked ? 'semibold' : 'regular'}
            color={isLiked ? theme.colors.error : theme.colors.textSecondary}
          >
            {likesCount > 0 ? likesCount : (language === 'hi' ? 'लाइक' : 'Like')}
          </Typography>
        </Pressable>

        {/* Comment Button */}
        <Pressable
          onPress={() => onPressComments && onPressComments(post.id)}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel="View comments"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Typography variant="md" color={theme.colors.textSecondary}>
            💬
          </Typography>
          <Typography variant="xs" color={theme.colors.textSecondary}>
            {post.commentsCount > 0
              ? post.commentsCount
              : (language === 'hi' ? 'कमेंट' : 'Comment')}
          </Typography>
        </Pressable>

        {/* Share Button */}
        <Pressable
          onPress={handleSharePress}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel="Share post"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Typography variant="md" color={theme.colors.textSecondary}>
            ↗️
          </Typography>
          <Typography variant="xs" color={theme.colors.textSecondary}>
            {language === 'hi' ? 'शेयर' : 'Share'}
          </Typography>
        </Pressable>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    marginBottom: 12,
    padding: 14,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarInitial: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorDetails: {
    flex: 1,
    marginLeft: 10,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorName: {
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  postTitle: {
    marginBottom: 6,
    lineHeight: 22,
  },
  postContent: {
    lineHeight: 20,
    marginBottom: 10,
  },
  mediaContainer: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 10,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  multiImagePill: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  videoContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: 450,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlinePlayerContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: 450,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 10,
    backgroundColor: '#000000',
  },
  videoThumbnailImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0F172A',
  },
  videoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoSourceBadgePill: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 2,
  },
  videoPlayOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(25, 118, 210, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
  },
  playIconText: {
    marginLeft: 3,
  },
  videoLabel: {
    marginTop: 6,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
  },
});

