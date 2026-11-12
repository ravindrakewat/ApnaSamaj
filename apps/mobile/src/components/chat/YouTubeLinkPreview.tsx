import React, { useState, useEffect } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '../Typography';
import { useTheme } from '../../hooks/useTheme';
import { useLocalization } from '../../hooks/useLocalization';
import {
  ParsedYouTubeLink,
  YouTubePreviewMetadata,
  fetchYouTubeMetadata,
  getCachedYouTubeMetadata,
  getYouTubeThumbnail,
} from '../../utils/youtube-link';
import { UnifiedVideoModal } from '../video/UnifiedVideoModal';

export interface YouTubeLinkPreviewProps {
  youtubeLink: ParsedYouTubeLink;
  isOwn?: boolean;
  onPressPlay?: (link: ParsedYouTubeLink) => void;
  /**
   * If true, disables the internal modal and relies exclusively on onPressPlay.
   */
  disableInternalModal?: boolean;
}

export const YouTubeLinkPreview: React.FC<YouTubeLinkPreviewProps> = ({
  youtubeLink,
  isOwn = false,
  onPressPlay,
  disableInternalModal = false,
}) => {
  const theme = useTheme();
  const { language } = useLocalization();
  const isHindi = language === 'hi';

  const [metadata, setMetadata] = useState<YouTubePreviewMetadata>(() => {
    const cached = getCachedYouTubeMetadata(youtubeLink.videoId);
    return (
      cached || {
        videoId: youtubeLink.videoId,
        title: 'YouTube Video',
        authorName: 'YouTube',
        thumbnailUrl: youtubeLink.thumbnailUrl || getYouTubeThumbnail(youtubeLink.videoId, 'hq'),
        provider: 'YouTube',
      }
    );
  });

  const [isLoadingMetadata, setIsLoadingMetadata] = useState<boolean>(
    !getCachedYouTubeMetadata(youtubeLink.videoId)
  );

  const [currentThumbnail, setCurrentThumbnail] = useState<string>(
    youtubeLink.thumbnailUrl || getYouTubeThumbnail(youtubeLink.videoId, 'hq')
  );
  const [thumbnailFailed, setThumbnailFailed] = useState<boolean>(false);
  const [isImageLoading, setIsImageLoading] = useState<boolean>(true);
  const [isPlayingInApp, setIsPlayingInApp] = useState<boolean>(false);

  // Fetch metadata on mount or when video ID changes
  useEffect(() => {
    let isMounted = true;
    const cached = getCachedYouTubeMetadata(youtubeLink.videoId);

    if (cached) {
      setMetadata(cached);
      setIsLoadingMetadata(false);
      return;
    }

    setIsLoadingMetadata(true);
    fetchYouTubeMetadata(youtubeLink.videoId, youtubeLink.originalUrl)
      .then((meta) => {
        if (isMounted) {
          setMetadata(meta);
          if (meta.thumbnailUrl && !thumbnailFailed) {
            setCurrentThumbnail(meta.thumbnailUrl);
          }
          setIsLoadingMetadata(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoadingMetadata(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [youtubeLink.videoId, youtubeLink.originalUrl]);

  // Handle fallback when primary high-quality thumbnail fails to load
  const handleImageError = () => {
    if (currentThumbnail.includes('hqdefault.jpg')) {
      // Try medium-quality thumbnail
      setCurrentThumbnail(getYouTubeThumbnail(youtubeLink.videoId, 'mq'));
    } else if (currentThumbnail.includes('mqdefault.jpg')) {
      // Try default low-resolution thumbnail
      setCurrentThumbnail(getYouTubeThumbnail(youtubeLink.videoId, 'default'));
    } else {
      // Fallback to stylized placeholder
      setThumbnailFailed(true);
    }
    setIsImageLoading(false);
  };

  const handleCardPress = () => {
    if (onPressPlay) {
      onPressPlay(youtubeLink);
    }
    if (!disableInternalModal) {
      setIsPlayingInApp(true);
    }
  };

  const handleOpenExternalUrl = (e: any) => {
    e.stopPropagation?.();
    const targetUrl = youtubeLink.originalUrl || youtubeLink.canonicalUrl;
    if (targetUrl) {
      Linking.openURL(targetUrl).catch((err) => {
        console.warn('[YouTubeLinkPreview] Failed to open external URL:', err);
      });
    }
  };

  const displayTitle = metadata.title || 'YouTube Video';
  const displayAuthor = metadata.authorName || 'YouTube';

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={handleCardPress}
        style={[
          styles.container,
          isOwn ? styles.containerOwn : styles.containerOther,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${isHindi ? 'यूट्यूब वीडियो चलाएं' : 'Play YouTube video'}: ${displayTitle}`}
      >
        {/* 16:9 Thumbnail Header with Play Overlay */}
        <View style={styles.thumbnailContainer}>
          {thumbnailFailed ? (
            <View style={styles.fallbackThumbnail}>
              <Ionicons name="logo-youtube" size={44} color="#EF4444" />
              <Typography variant="xs" color="#94A3B8" style={{ marginTop: 6 }}>
                YouTube
              </Typography>
            </View>
          ) : (
            <Image
              source={{ uri: currentThumbnail }}
              style={styles.thumbnail}
              resizeMode="cover"
              onLoadStart={() => setIsImageLoading(true)}
              onLoadEnd={() => setIsImageLoading(false)}
              onError={handleImageError}
            />
          )}

          {/* Loading Indicator for Thumbnail */}
          {isImageLoading && !thumbnailFailed && (
            <View style={styles.thumbnailLoadingOverlay}>
              <ActivityIndicator size="small" color="#FFFFFF" />
            </View>
          )}

          {/* YouTube Branding Pill */}
          <View style={styles.brandBadge}>
            <Ionicons name="logo-youtube" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Typography variant="xs" weight="bold" color="#FFFFFF" style={styles.brandText}>
              YouTube
            </Typography>
          </View>

          {/* Center Play Button Overlay */}
          <View style={styles.playOverlay}>
            <View style={styles.playCircle}>
              <Ionicons name="play" size={24} color="#FFFFFF" style={styles.playIcon} />
            </View>
          </View>

          {/* Start Time Pill if present */}
          {Boolean(youtubeLink.startTimeSeconds) && (
            <View style={styles.timeBadge}>
              <Typography variant="xs" weight="medium" color="#FFFFFF">
                {Math.floor((youtubeLink.startTimeSeconds || 0) / 60)}:
                {String((youtubeLink.startTimeSeconds || 0) % 60).padStart(2, '0')}
              </Typography>
            </View>
          )}
        </View>

        {/* Video Metadata Body */}
        <View style={styles.metaContainer}>
          <Typography
            variant="sm"
            weight="bold"
            color={theme.colors.textPrimary}
            numberOfLines={2}
            ellipsizeMode="tail"
            style={styles.titleText}
          >
            {displayTitle}
          </Typography>

          <View style={styles.footerRow}>
            <View style={styles.authorCol}>
              <Typography
                variant="xs"
                color={theme.colors.textSecondary}
                numberOfLines={1}
                ellipsizeMode="tail"
                style={styles.authorText}
              >
                {displayAuthor}
              </Typography>
              <Typography
                variant="xs"
                color="#64748B"
                numberOfLines={1}
                ellipsizeMode="tail"
                style={styles.domainText}
              >
                youtube.com
              </Typography>
            </View>

            {/* External URL Action Pill */}
            <TouchableOpacity
              onPress={handleOpenExternalUrl}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.linkPill}
              accessibilityRole="link"
              accessibilityLabel={isHindi ? 'यूट्यूब पर खोलें' : 'Open in YouTube app'}
            >
              <Ionicons name="open-outline" size={13} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>

      {/* Embedded In-App Video Playback Modal */}
      {!disableInternalModal && isPlayingInApp && (
        <UnifiedVideoModal
          visible={isPlayingInApp}
          media={{
            id: `yt-${youtubeLink.videoId}`,
            mediaType: 'VIDEO',
            url: youtubeLink.canonicalUrl || youtubeLink.originalUrl,
            thumbnail: metadata.thumbnailUrl || youtubeLink.thumbnailUrl,
            order: 0,
          }}
          postTitle={displayTitle}
          authorName={displayAuthor}
          onClose={() => setIsPlayingInApp(false)}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 260,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
    marginVertical: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  containerOwn: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  containerOther: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  thumbnailContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#0F172A',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackThumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.92)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 2,
  },
  brandText: {
    fontSize: 10,
    lineHeight: 12,
  },
  timeBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 2,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    marginLeft: 3,
  },
  metaContainer: {
    padding: 10,
  },
  titleText: {
    lineHeight: 18,
    marginBottom: 6,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  authorCol: {
    flex: 1,
    marginRight: 8,
  },
  authorText: {
    fontWeight: '500',
    fontSize: 11,
  },
  domainText: {
    fontSize: 10,
    marginTop: 1,
  },
  linkPill: {
    padding: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(2, 132, 199, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

