import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { ALLOWED_CHAT_REACTIONS, AllowedChatReaction } from '@apnasamaj/shared-types';

interface EmojiReactionSelectorProps {
  visible: boolean;
  activeEmoji?: string | null;
  onSelectEmoji: (emoji: AllowedChatReaction) => void;
  onDismiss: () => void;
}

export const EmojiReactionSelector: React.FC<EmojiReactionSelectorProps> = ({
  visible,
  activeEmoji,
  onSelectEmoji,
  onDismiss,
}) => {
  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.bubbleContainer} onPress={(e) => e.stopPropagation()}>
          <View style={styles.emojiRow}>
            {ALLOWED_CHAT_REACTIONS.map((emoji) => {
              const isSelected = activeEmoji === emoji;
              return (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.emojiButton,
                    isSelected && styles.emojiButtonSelected,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    onSelectEmoji(emoji);
                    onDismiss();
                  }}
                  accessibilityLabel={`React with ${emoji}`}
                  accessibilityRole="button"
                >
                  <Text style={[styles.emojiText, isSelected && styles.emojiTextSelected]}>
                    {emoji}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  bubbleContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: Platform.OS === 'ios' ? 0.5 : 0,
    borderColor: '#E2E8F0',
  },
  emojiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 20,
    marginHorizontal: 3,
  },
  emojiButtonSelected: {
    backgroundColor: '#EFF6FF',
    transform: [{ scale: 1.15 }],
  },
  emojiText: {
    fontSize: 28,
  },
  emojiTextSelected: {
    fontSize: 30,
  },
});

