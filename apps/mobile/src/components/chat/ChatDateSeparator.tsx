import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Typography } from '../Typography';
import { useLocalization } from '../../hooks/useLocalization';

export interface ChatDateSeparatorProps {
  date: string | Date;
}

export function formatChatDateHeader(dateInput: string | Date, language: 'en' | 'hi' = 'en'): string {
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '';
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
      return language === 'hi' ? 'आज' : 'Today';
    }
    if (d.toDateString() === yesterday.toDateString()) {
      return language === 'hi' ? 'कल' : 'Yesterday';
    }
    return d.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return '';
  }
}

export const ChatDateSeparator: React.FC<ChatDateSeparatorProps> = ({ date }) => {
  const { language } = useLocalization();
  const label = formatChatDateHeader(date, language as 'en' | 'hi');

  if (!label) return null;

  return (
    <View style={styles.container}>
      <View style={styles.pill}>
        <Typography variant="xs" weight="semibold" color="#475569" style={styles.text}>
          {label}
        </Typography>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  pill: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  text: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
});

