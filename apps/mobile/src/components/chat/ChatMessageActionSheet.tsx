import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { BottomSheet } from '../BottomSheet';
import { Typography } from '../Typography';
import { useTheme } from '../../hooks/useTheme';
import { useLocalization } from '../../hooks/useLocalization';

export interface ChatActionMessageInfo {
  id: string;
  content?: string;
  senderName?: string;
  isOwn: boolean;
  canDeleteForEveryone?: boolean;
  canAdminDelete?: boolean;
  isDeleted?: boolean;
}

export interface ChatMessageActionSheetProps {
  visible: boolean;
  onClose: () => void;
  message: ChatActionMessageInfo | null;
  onReact: () => void;
  onReply: () => void;
  onCopy?: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone?: () => void;
  onAdminDelete?: () => void;
}

export const ChatMessageActionSheet: React.FC<ChatMessageActionSheetProps> = ({
  visible,
  onClose,
  message,
  onReact,
  onReply,
  onCopy,
  onDeleteForMe,
  onDeleteForEveryone,
  onAdminDelete,
}) => {
  const theme = useTheme();
  const { language } = useLocalization();

  if (!message) return null;

  const isDeleted = Boolean(message.isDeleted);
  const hasText = Boolean(message.content && message.content.trim().length > 0 && !isDeleted);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={message.senderName || (message.isOwn ? (language === 'hi' ? 'आपका संदेश' : 'Your Message') : (language === 'hi' ? 'संदेश विकल्प' : 'Message Options'))}
      subtitle={hasText ? message.content?.slice(0, 50) + (message.content && message.content.length > 50 ? '...' : '') : undefined}
      scrollable={false}
    >
      <View style={styles.actionList}>
        {/* React Option */}
        {!isDeleted && (
          <Pressable
            style={({ pressed }) => [
              styles.actionItem,
              { backgroundColor: pressed ? theme.colors.surfaceSubtle : 'transparent' },
            ]}
            onPress={() => {
              onClose();
              onReact();
            }}
          >
            <Typography variant="md" style={styles.actionIcon}>
              ✨
            </Typography>
            <Typography variant="sm" weight="medium" color={theme.colors.textPrimary}>
              {language === 'hi' ? 'प्रतिक्रिया दें (React)' : 'React with emoji'}
            </Typography>
          </Pressable>
        )}

        {/* Reply Option */}
        {!isDeleted && (
          <Pressable
            style={({ pressed }) => [
              styles.actionItem,
              { backgroundColor: pressed ? theme.colors.surfaceSubtle : 'transparent' },
            ]}
            onPress={() => {
              onClose();
              onReply();
            }}
          >
            <Typography variant="md" style={styles.actionIcon}>
              ↩️
            </Typography>
            <Typography variant="sm" weight="medium" color={theme.colors.textPrimary}>
              {language === 'hi' ? 'उत्तर दें (Reply)' : 'Reply'}
            </Typography>
          </Pressable>
        )}

        {/* Copy Option */}
        {hasText && onCopy && (
          <Pressable
            style={({ pressed }) => [
              styles.actionItem,
              { backgroundColor: pressed ? theme.colors.surfaceSubtle : 'transparent' },
            ]}
            onPress={() => {
              onClose();
              onCopy();
            }}
          >
            <Typography variant="md" style={styles.actionIcon}>
              📋
            </Typography>
            <Typography variant="sm" weight="medium" color={theme.colors.textPrimary}>
              {language === 'hi' ? 'टेक्स्ट कॉपी करें' : 'Copy Text'}
            </Typography>
          </Pressable>
        )}

        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

        {/* Delete for Me */}
        <Pressable
          style={({ pressed }) => [
            styles.actionItem,
            { backgroundColor: pressed ? theme.colors.surfaceSubtle : 'transparent' },
          ]}
          onPress={() => {
            onClose();
            onDeleteForMe();
          }}
        >
          <Typography variant="md" style={styles.actionIcon}>
            🗑️
          </Typography>
          <Typography variant="sm" weight="medium" color={theme.colors.error}>
            {language === 'hi' ? 'मेरे लिए हटाएं' : 'Delete for Me'}
          </Typography>
        </Pressable>

        {/* Delete for Everyone */}
        {message.canDeleteForEveryone && onDeleteForEveryone && !isDeleted && (
          <Pressable
            style={({ pressed }) => [
              styles.actionItem,
              { backgroundColor: pressed ? theme.colors.surfaceSubtle : 'transparent' },
            ]}
            onPress={() => {
              onClose();
              onDeleteForEveryone();
            }}
          >
            <Typography variant="md" style={styles.actionIcon}>
              👥
            </Typography>
            <Typography variant="sm" weight="medium" color={theme.colors.error}>
              {language === 'hi' ? 'सभी के लिए हटाएं' : 'Delete for Everyone'}
            </Typography>
          </Pressable>
        )}

        {/* Admin Moderation Delete */}
        {message.canAdminDelete && onAdminDelete && !isDeleted && (
          <Pressable
            style={({ pressed }) => [
              styles.actionItem,
              { backgroundColor: pressed ? theme.colors.surfaceSubtle : 'transparent' },
            ]}
            onPress={() => {
              onClose();
              onAdminDelete();
            }}
          >
            <Typography variant="md" style={styles.actionIcon}>
              🛡️
            </Typography>
            <Typography variant="sm" weight="medium" color={theme.colors.error}>
              {language === 'hi' ? 'व्यवस्थापक द्वारा हटाएं' : 'Admin Delete (Moderation)'}
            </Typography>
          </Pressable>
        )}
      </View>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  actionList: {
    paddingVertical: 8,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 14,
  },
  actionIcon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
    marginHorizontal: 16,
  },
});

