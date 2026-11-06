import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChatReactionSummary } from '@apnasamaj/shared-types';

interface ReactionBadgeListProps {
  reactions?: ChatReactionSummary[];
  onToggleReaction?: (emoji: string) => void;
  isMyMessage?: boolean;
}

export const ReactionBadgeList: React.FC<ReactionBadgeListProps> = ({
  reactions,
  onToggleReaction,
  isMyMessage = false,
}) => {
  if (!reactions || reactions.length === 0) return null;

  // Filter out any zero-count reactions
  const activeReactions = reactions.filter((r) => r.count > 0);
  if (activeReactions.length === 0) return null;

  return (
    <View style={[styles.container, isMyMessage ? styles.alignRight : styles.alignLeft]}>
      {activeReactions.map((item) => (
        <TouchableOpacity
          key={item.emoji}
          style={[
            styles.badge,
            item.hasReacted ? styles.badgeActive : styles.badgeInactive,
          ]}
          activeOpacity={0.7}
          onPress={() => onToggleReaction?.(item.emoji)}
          accessibilityRole="button"
          accessibilityLabel={`${item.emoji} reaction count ${item.count}${
            item.hasReacted ? ', you reacted' : ''
          }`}
        >
          <Text style={styles.emojiText}>{item.emoji}</Text>
          {item.count > 1 && (
            <Text
              style={[
                styles.countText,
                item.hasReacted ? styles.countActive : styles.countInactive,
              ]}
            >
              {item.count}
            </Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  alignRight: {
    justifyContent: 'flex-end',
  },
  alignLeft: {
    justifyContent: 'flex-start',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 14,
    borderWidth: 1,
  },
  badgeInactive: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  badgeActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
  },
  emojiText: {
    fontSize: 13,
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  countInactive: {
    color: '#475569',
  },
  countActive: {
    color: '#1D4ED8',
  },
});

