import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinkPreviewMetadata } from '@apnasamaj/shared-types';
import { Typography } from '../Typography';
import { useTheme } from '../../hooks/useTheme';
import { useLocalization } from '../../hooks/useLocalization';

export interface LinkPreviewCardProps {
  preview: LinkPreviewMetadata;
  onRemove?: () => void;
  isComposer?: boolean;
}

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({
  preview,
  onRemove,
  isComposer = false,
}) => {
  const theme = useTheme();
  const { language } = useLocalization();
  const isHindi = language === 'hi';

  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  // Extract a clean domain for display
  const getDomain = (urlStr: string): string => {
    try {
      const parsed = new URL(urlStr);
      return parsed.hostname.replace(/^www\./i, '');
    } catch {
      return urlStr.replace(/^https?:\/\//i, '').split('/')[0];
    }
  };

  const domain = preview.siteName || getDomain(preview.normalizedUrl || preview.url);

  const handleOpenLink = () => {
    const targetUrl = preview.normalizedUrl || preview.url;
    if (targetUrl) {
      Linking.openURL(targetUrl).catch((err) => {
        console.warn('[LinkPreviewCard] Failed to open URL:', err);
      });
    }
  };

  // Provider branding styling
  const getProviderConfig = () => {
    switch (preview.provider) {
      case 'youtube':
        return {
          icon: 'logo-youtube' as const,
          color: '#DC2626',
          bg: '#FEE2E2',
          label: 'YouTube',
        };
      case 'amazon':
        return {
          icon: 'cart-outline' as const,
          color: '#D97706',
          bg: '#FEF3C7',
          label: 'Amazon',
        };
      default:
        return {
          icon: 'globe-outline' as const,
          color: '#2563EB',
          bg: '#DBEAFE',
          label: domain || 'Web',
        };
    }
  };

  const providerCfg = getProviderConfig();
  const hasThumbnail = Boolean(preview.thumbnailUrl) && !imageError;

  return (
    <View
      style={[
        styles.cardContainer,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={handleOpenLink}
        accessibilityRole="link"
        accessibilityLabel={`${preview.title} (${domain})`}
        style={styles.touchableArea}
      >
        {/* Thumbnail or Fallback Header */}
        {hasThumbnail && preview.thumbnailUrl ? (
          <View style={styles.thumbnailWrapper}>
            <Image
              source={{ uri: preview.thumbnailUrl }}
              style={styles.thumbnailImage}
              resizeMode="cover"
              onLoadStart={() => setImageLoading(true)}
              onLoadEnd={() => setImageLoading(false)}
              onError={() => setImageError(true)}
            />
            {imageLoading && (
              <View style={styles.imageLoadingOverlay}>
                <ActivityIndicator size="small" color="#FFFFFF" />
              </View>
            )}
            {preview.provider === 'youtube' && (
              <View style={styles.youtubePlayPill}>
                <Ionicons name="play" size={18} color="#FFFFFF" />
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.fallbackHeader, { backgroundColor: providerCfg.bg }]}>
            <Ionicons name={providerCfg.icon} size={32} color={providerCfg.color} />
            <Typography
              variant="xs"
              weight="bold"
              style={{ color: providerCfg.color, marginTop: 4 }}
            >
              {providerCfg.label}
            </Typography>
          </View>
        )}

        {/* Content Details */}
        <View style={styles.detailsContainer}>
          {/* Provider / Domain Bar */}
          <View style={styles.headerRow}>
            <View style={[styles.providerBadge, { backgroundColor: providerCfg.bg }]}>
              <Ionicons
                name={providerCfg.icon}
                size={11}
                color={providerCfg.color}
                style={{ marginRight: 4 }}
              />
              <Typography
                variant="xs"
                weight="bold"
                style={{ color: providerCfg.color, fontSize: 11 }}
              >
                {providerCfg.label}
              </Typography>
            </View>

            <View style={styles.domainRow}>
              <Typography
                variant="xs"
                color={theme.colors.textMuted}
                numberOfLines={1}
                style={{ flexShrink: 1, fontSize: 11 }}
              >
                {domain}
              </Typography>
              <Ionicons
                name="open-outline"
                size={12}
                color={theme.colors.textMuted}
                style={{ marginLeft: 4 }}
              />
            </View>
          </View>

          {/* Title */}
          <Typography
            variant="sm"
            weight="bold"
            color={theme.colors.textPrimary}
            numberOfLines={2}
            style={styles.titleText}
          >
            {preview.title}
          </Typography>

          {/* Description */}
          {preview.description ? (
            <Typography
              variant="xs"
              color={theme.colors.textSecondary}
              numberOfLines={2}
              style={styles.descText}
            >
              {preview.description}
            </Typography>
          ) : null}

          {/* Author or Product ASIN */}
          {preview.authorName ? (
            <Typography variant="xs" color={theme.colors.textMuted} style={styles.metaText}>
              {preview.authorName}
            </Typography>
          ) : preview.productId ? (
            <Typography variant="xs" color={theme.colors.textMuted} style={styles.metaText}>
              ASIN: {preview.productId}
            </Typography>
          ) : null}
        </View>
      </TouchableOpacity>

      {/* Composer Remove Button */}
      {onRemove && (
        <TouchableOpacity
          onPress={onRemove}
          style={styles.removeButton}
          accessibilityRole="button"
          accessibilityLabel={isHindi ? 'लिंक प्रीव्यू हटाएं' : 'Remove link preview'}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close-circle" size={24} color="#64748B" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    marginVertical: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
      default: {},
    }),
  },
  touchableArea: {
    width: '100%',
  },
  thumbnailWrapper: {
    width: '100%',
    height: 160,
    backgroundColor: '#F1F5F9',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  imageLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  youtubePlayPill: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  fallbackHeader: {
    width: '100%',
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsContainer: {
    padding: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  providerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    marginLeft: 8,
  },
  titleText: {
    fontSize: 14,
    lineHeight: 19,
    marginBottom: 4,
  },
  descText: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
  },
  metaText: {
    fontSize: 11,
    marginTop: 2,
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});
