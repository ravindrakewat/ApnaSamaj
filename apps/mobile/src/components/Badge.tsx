import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Typography } from './Typography';

export interface BadgeProps {
  label: string;
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info';
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'default',
  size = 'md',
  style,
}) => {
  const theme = useTheme();

  let backgroundColor: string = theme.colors.surfaceSubtle;
  let textColor: string = theme.colors.textSecondary;

  switch (variant) {
    case 'success':
      backgroundColor = theme.colors.successLight;
      textColor = theme.colors.success;
      break;
    case 'error':
      backgroundColor = theme.colors.errorLight;
      textColor = theme.colors.error;
      break;
    case 'warning':
      backgroundColor = theme.colors.warningLight;
      textColor = theme.colors.warning;
      break;
    case 'info':
      backgroundColor = theme.colors.infoLight;
      textColor = theme.colors.info;
      break;
  }

  const paddingVertical = size === 'sm' ? 2 : 4;
  const paddingHorizontal = size === 'sm' ? 6 : 10;

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor,
          paddingVertical,
          paddingHorizontal,
          borderRadius: theme.borderRadius.full,
        },
        style,
      ]}
    >
      <Typography
        variant={size === 'sm' ? 'xxs' : 'xs'}
        weight="semibold"
        color={textColor}
      >
        {label}
      </Typography>
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

