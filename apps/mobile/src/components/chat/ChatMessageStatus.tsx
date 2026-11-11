import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Typography } from '../Typography';
import { useTheme } from '../../hooks/useTheme';

export interface ChatMessageStatusProps {
  status?: 'sending' | 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  isRead?: boolean;
  isError?: boolean;
  isOptimistic?: boolean;
}

export const ChatMessageStatus: React.FC<ChatMessageStatusProps> = ({
  status,
  isRead = false,
  isError = false,
  isOptimistic = false,
}) => {
  const theme = useTheme();

  if (isError || status === 'failed') {
    return (
      <Typography variant="xs" color={theme.colors.error} style={styles.indicator}>
        ⚠️
      </Typography>
    );
  }

  if (status === 'sending') {
    return (
      <Typography variant="xs" color="#94A3B8" style={styles.indicator}>
        ⏳
      </Typography>
    );
  }

  if (status === 'pending' || isOptimistic) {
    return (
      <Typography variant="xs" color="#94A3B8" style={styles.indicator}>
        🕒
      </Typography>
    );
  }

  if (isRead || status === 'read') {
    return (
      <Typography variant="xs" weight="bold" color="#0284C7" style={styles.indicator}>
        ✓✓
      </Typography>
    );
  }

  if (status === 'delivered') {
    return (
      <Typography variant="xs" color="#64748B" style={styles.indicator}>
        ✓✓
      </Typography>
    );
  }

  return (
    <Typography variant="xs" color="#64748B" style={styles.indicator}>
      ✓
    </Typography>
  );
};

const styles = StyleSheet.create({
  indicator: {
    fontSize: 11,
    marginLeft: 3,
  },
});

