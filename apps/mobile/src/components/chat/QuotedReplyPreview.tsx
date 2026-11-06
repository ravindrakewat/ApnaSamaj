import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChatMessageReplyPreview } from '@apnasamaj/shared-types';

interface QuotedReplyPreviewProps {
  replyTo?: ChatMessageReplyPreview | null;
  onPress?: () => void;
  isMyMessage?: boolean;
}

export const QuotedReplyPreview: React.FC<QuotedReplyPreviewProps> = ({
  replyTo,
  onPress,
  isMyMessage = false,
}) => {
  if (!replyTo) return null;

  const isDeleted = replyTo.content === 'This message was deleted';

  const renderSnippet = () => {
    if (isDeleted) {
      return (
        <Text style={[styles.snippetText, styles.deletedText]} numberOfLines={1}>
          This message was deleted
        </Text>
      );
    }

    if (replyTo.attachmentType) {
      const typeLabel =
        replyTo.attachmentType === 'IMAGE'
          ? '📷 Photo'
          : replyTo.attachmentType === 'VIDEO'
          ? '🎥 Video'
          : replyTo.attachmentType === 'AUDIO'
          ? '🎵 Voice note'
          : '📄 Document';

      return (
        <Text style={styles.snippetText} numberOfLines={1}>
          {typeLabel}
          {replyTo.content ? ` • ${replyTo.content}` : ''}
        </Text>
      );
    }

    return (
      <Text style={styles.snippetText} numberOfLines={2}>
        {replyTo.content || 'Message'}
      </Text>
    );
  };

  const canPress = Boolean(onPress && !isDeleted);

  return (
    <TouchableOpacity
      style={[
        styles.container,
        isMyMessage ? styles.containerMine : styles.containerOther,
      ]}
      onPress={canPress ? onPress : undefined}
      activeOpacity={canPress ? 0.75 : 1}
      accessibilityRole="button"
      accessibilityLabel={`Replied to ${replyTo.senderName}`}
      disabled={!canPress}
    >
      <View style={[styles.accentBar, isMyMessage ? styles.accentBarMine : styles.accentBarOther]} />
      <View style={styles.textContainer}>
        <Text
          style={[styles.senderName, isMyMessage ? styles.senderNameMine : styles.senderNameOther]}
          numberOfLines={1}
        >
          {replyTo.senderName || 'Member'}
        </Text>
        {renderSnippet()}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 8,
    marginBottom: 6,
    overflow: 'hidden',
  },
  containerMine: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  containerOther: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  accentBar: {
    width: 4,
  },
  accentBarMine: {
    backgroundColor: '#FFFFFF',
  },
  accentBarOther: {
    backgroundColor: '#2563EB',
  },
  textContainer: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  senderNameMine: {
    color: '#FFFFFF',
  },
  senderNameOther: {
    color: '#2563EB',
  },
  snippetText: {
    fontSize: 12,
    color: '#475569',
  },
  deletedText: {
    fontStyle: 'italic',
    color: '#94A3B8',
  },
});

