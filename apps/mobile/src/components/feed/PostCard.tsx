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
      {/* 1. Header: Author Avatar, Details, Badges & Timestamp */}
      <View style={styles.authorRow}>
        {/* Author Avatar */}
        {post.author?.avatarUrl ? (
          <Image
            source={{ uri: post.author.avatarUrl }}
            style={styles.avatarImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.avatarInitial, { backgroundColor: '#E0F2FE' }]}>
            <Typography variant="sm" weight="bold" color="#0369A1">
              {post.author?.fullName ? post.author.fullName.charAt(0).toUpperCase() : 'स'}
            </Typography>
          </View>
        )}

        {/* Author Details & Date */}
        <View style={styles.authorDetails}>
          <View style={styles.authorNameRow}>
            <Typography
              variant="sm"
              weight="bold"
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
            <Typography variant="xs" color={theme.colors.textMuted} style={styles.metaDivider}>
              •
            </Typography>
            <Typography variant="xs" color={theme.colors.textMuted} style={styles.privacyScope}>
              🌐
            </Typography>
            {post.author?.city && (
              <>
                <Typography variant="xs" color={theme.colors.textMuted} style={styles.metaDivider}>
                  •
                </Typography>
                <Typography variant="xs" color={theme.colors.textMuted} numberOfLines={1}>
                  {post.author.city}
                </Typography>
              </>
            )}
          </View>
        </View>

        {/* Post Type Badge */}
        {postTypeLabel && (
          <View style={styles.categoryBadgeWrap}>
            <Badge
              label={postTypeLabel}
              variant={postTypeVariant as any}
              size="sm"
            />
          </View>
        )}
      </View>

      {/* 2. Post Title */}
      {post.title ? (
        <Pressable
          onPress={() => onPressPost && onPressPost(post.id)}
          accessibilityRole="button"
          accessibilityLabel={`Post title: ${post.title}`}
          style={styles.titleTouchArea}
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
        style={styles.contentTouchArea}
      >
        <Typography
          variant="sm"
          color="#334155"
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
                +{images.length - 1} फ़ोटो
              </Typography>
            </View>
          )}
        </Pressable>
      )}

      {/* 5. Attached Video (Inline Facebook-Style Player or Polished Fallback) */}
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
            style={styles.videoContainer}
            accessibilityRole="button"
            accessibilityLabel={`Play video in post: ${post.title || 'Community post'}`}
          >
            {displayThumb ? (
              <>
                <Image
                  source={{ uri: displayThumb }}
                  style={styles.videoThumbnailImage}
                  resizeMode="cover"
                />
                <View style={styles.thumbnailDarkOverlay} />
              </>
            ) : (
              <View style={styles.videoFallbackCanvas}>
                <View style={styles.watermarkReelIcon}>
                  <Typography variant="title" color="#334155" style={{ fontSize: 64, opacity: 0.15 }}>
                    🎬
                  </Typography>
                </View>
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

            {/* Centered Modern Play Button Overlay */}
            <View style={styles.videoPlayOverlay} pointerEvents="none">
              <View style={styles.playIconCircle}>
                <Typography variant="lg" color="#FFFFFF" weight="bold" style={styles.playIconText}>
                  ▶
                </Typography>
              </View>
              <View style={styles.videoLabelPill}>
                <Typography variant="xs" weight="bold" color="#FFFFFF">
                  {language === 'hi' ? 'वीडियो देखें' : 'Watch Video'}
                </Typography>
              </View>
            </View>
          </Pressable>
        );
      })()}

      {/* 6. Interaction Metrics Row (Facebook-Style Likes & Comments Count) */}
      {(likesCount > 0 || post.commentsCount > 0) && (
        <View style={styles.metricsSummaryRow}>
          {likesCount > 0 ? (
            <View style={styles.metricsLeft}>
              <View style={styles.miniLikeBadge}>
                <Typography variant="xs" style={{ fontSize: 10 }}>
                  ❤️
                </Typography>
              </View>
              <Typography variant="xs" color={theme.colors.textSecondary} style={{ marginLeft: 6 }}>
                {likesCount} {language === 'hi' ? 'लोगों ने पसंद किया' : (likesCount === 1 ? 'like' : 'likes')}
              </Typography>
            </View>
          ) : <View />}

          {post.commentsCount > 0 && (
            <Pressable
              onPress={() => onPressComments && onPressComments(post.id)}
              hitSlop={6}
            >
              <Typography variant="xs" color={theme.colors.textSecondary}>
                {post.commentsCount} {language === 'hi' ? 'टिप्पणियां' : (post.commentsCount === 1 ? 'comment' : 'comments')}
              </Typography>
            </Pressable>
          )}
        </View>
      )}

      {/* 7. Action Bar (Like, Comment, Share) */}
      <View style={[styles.actionBar, { borderTopColor: '#F1F5F9' }]}>
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
            weight={isLiked ? 'bold' : 'medium'}
            color={isLiked ? theme.colors.error : theme.colors.textSecondary}
          >
            {isLiked
              ? (language === 'hi' ? 'पसंद किया' : 'Liked')
              : (language === 'hi' ? 'पसंद' : 'Like')}
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
          <Typography variant="xs" weight="medium" color={theme.colors.textSecondary}>
            {language === 'hi' ? 'कमेंट' : 'Comment'}
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
          <Typography variant="xs" weight="medium" color={theme.colors.textSecondary}>
            {language === 'hi' ? 'शेयर' : 'Share'}
          </Typography>
        </Pressable>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
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
    backgroundColor: '#E2E8F0',
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
    fontSize: 14,
    lineHeight: 18,
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  metaDivider: {
    marginHorizontal: 5,
    fontSize: 10,
  },
  privacyScope: {
    fontSize: 11,
  },
  categoryBadgeWrap: {
    marginLeft: 6,
  },
  titleTouchArea: {
    marginBottom: 4,
  },
  postTitle: {
    fontSize: 15.5,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  contentTouchArea: {
    marginBottom: 10,
  },
  postContent: {
    fontSize: 14,
    lineHeight: 21,
  },
  mediaContainer: {
    position: 'relative',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 10,
  },
  postImage: {
    width: '100%',
    height: 220,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  multiImagePill: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  videoContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: 450,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  inlinePlayerContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: 450,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 10,
    backgroundColor: '#000000',
  },
  videoThumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailDarkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
  },
  videoFallbackCanvas: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  watermarkReelIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoSourceBadgePill: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 2,
  },
  videoPlayOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(25, 118, 210, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  playIconText: {
    marginLeft: 3,
    fontSize: 22,
  },
  videoLabelPill: {
    marginTop: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  metricsSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  metricsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniLikeBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    marginTop: 2,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 8,
  },
});
