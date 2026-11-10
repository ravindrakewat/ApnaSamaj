import React, { useState, useEffect } from 'react';
import { View, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { ChatAttachmentItem } from '@apnasamaj/shared-types';
import { Typography } from '../Typography';
import { useTheme } from '../../hooks/useTheme';
import { resolveAttachmentDisplayUrl } from '../../utils/attachment';
import { chatApi } from '../../api/chat.api';

interface ChatImageMessageProps {
  attachment: ChatAttachmentItem;
}

export const ChatImageMessage: React.FC<ChatImageMessageProps> = ({ attachment }) => {
  const theme = useTheme();
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const initialUrl = resolveAttachmentDisplayUrl(attachment.url || (attachment as any).localUri || '');
  const [currentUrl, setCurrentUrl] = useState<string>(initialUrl);
  const [retryAttempted, setRetryAttempted] = useState(false);

  useEffect(() => {
    const nextUrl = resolveAttachmentDisplayUrl(attachment.url || (attachment as any).localUri || '');
    if (nextUrl && nextUrl !== currentUrl) {
      setCurrentUrl(nextUrl);
      setHasError(false);
      setIsLoading(true);
      setRetryAttempted(false);
    }
  }, [attachment.url, (attachment as any).localUri]);

  const handleImageError = async () => {
    // 1. If signed URL expired or failed, refresh via chatApi.getAttachmentUrl
    if (!retryAttempted && attachment.id && !attachment.id.startsWith('temp-')) {
      setRetryAttempted(true);
      try {
        const freshSignedUrl = await chatApi.getAttachmentUrl(attachment.id);
        if (freshSignedUrl && freshSignedUrl !== currentUrl) {
          setCurrentUrl(resolveAttachmentDisplayUrl(freshSignedUrl));
          setHasError(false);
          setIsLoading(true);
          return;
        }
      } catch (refreshErr) {
        console.warn('[ChatImageMessage] Could not refresh signed URL on error:', refreshErr);
      }
    }

    // 2. Try localUri fallback if available
    const localFallback = (attachment as any).localUri;
    if (localFallback && localFallback !== currentUrl) {
      setCurrentUrl(localFallback);
      setHasError(false);
      setIsLoading(true);
      return;
    }

    setIsLoading(false);
    setHasError(true);
  };

  const handlePress = () => {
    if (currentUrl) {
      Linking.openURL(currentUrl).catch((err) => {
        console.warn('[ChatImageMessage] Could not open image URL:', err);
      });
    }
  };

  if (hasError || !currentUrl) {
    return (
      <View style={styles.fallbackBox}>
        <Typography variant="sm" color={theme.colors.textSecondary}>
          🖼️ [फ़ोटो / Image: {attachment.fileName}]
        </Typography>
      </View>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePress}
      style={styles.container}
      accessibilityRole="imagebutton"
      accessibilityLabel={`View image: ${attachment.fileName}`}
    >
      <Image
        source={{ uri: currentUrl }}
        style={styles.image}
        resizeMode="cover"
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        onError={handleImageError}
      />
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 4,
    backgroundColor: '#E2E8F0',
    position: 'relative',
    maxWidth: 240,
    width: '100%',
    aspectRatio: 4 / 3,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(241, 245, 249, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackBox: {
    padding: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    marginBottom: 4,
  },
});
