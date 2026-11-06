import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChatMessageItem, DirectMessageItem } from '@apnasamaj/shared-types';

interface ReplyComposerBarProps {
  replyingTo: ChatMessageItem | DirectMessageItem | null;
  onCancel: () => void;
}

export const ReplyComposerBar: React.FC<ReplyComposerBarProps> = ({
  replyingTo,
  onCancel,
}) => {
  if (!replyingTo) return null;

  const senderName =
    replyingTo.sender?.fullName ||
    ('sender' in replyingTo && (replyingTo as any).sender?.profile?.fullName) ||
    'Member';

  const attachment = replyingTo.attachments?.[0];
  let snippet = replyingTo.content || '';

  if (attachment) {
    const typeLabel =
      attachment.type === 'IMAGE'
        ? '📷 Photo'
        : attachment.type === 'VIDEO'
        ? '🎥 Video'
        : attachment.type === 'AUDIO'
        ? '🎵 Voice note'
        : '📄 Document';
    snippet = snippet ? `${typeLabel} • ${snippet}` : typeLabel;
  }

  return (
    <View style={styles.container}>
      <View style={styles.leftAccent} />
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Ionicons name="arrow-undo" size={14} color="#2563EB" style={styles.icon} />
          <Text style={styles.replyTitle} numberOfLines={1}>
            Replying to {senderName}
          </Text>
        </View>
        <Text style={styles.snippet} numberOfLines={1}>
          {snippet || 'Message'}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.cancelButton}
        onPress={onCancel}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Cancel reply"
      >
        <Ionicons name="close-circle" size={20} color="#94A3B8" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  leftAccent: {
    width: 3,
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 2,
    marginRight: 8,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  icon: {
    marginRight: 4,
  },
  replyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  snippet: {
    fontSize: 12,
    color: '#64748B',
  },
  cancelButton: {
    padding: 4,
    marginLeft: 8,
  },
});

