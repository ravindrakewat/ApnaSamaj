import React, { useState } from 'react';
import { View, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { ChatAttachmentItem } from '@apnasamaj/shared-types';
import { Typography } from '../Typography';
import { useTheme } from '../../hooks/useTheme';

interface ChatImageMessageProps {
  attachment: ChatAttachmentItem;
}

export const ChatImageMessage: React.FC<ChatImageMessageProps> = ({ attachment }) => {
  const theme = useTheme();
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handlePress = () => {
    if (attachment.url) {
      Linking.openURL(attachment.url).catch((err) => {
        console.warn('[ChatImageMessage] Could not open image URL:', err);
      });
    }
  };

  const imageUrl = attachment.url;

  if (hasError || !imageUrl) {
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
        source={{ uri: imageUrl }}
        style={styles.image}
        resizeMode="cover"
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
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
