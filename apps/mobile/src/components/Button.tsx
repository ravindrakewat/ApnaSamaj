import React from 'react';
import {
  Pressable,
  StyleSheet,
  ViewStyle,
  TextStyle,
  Platform,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Typography } from './Typography';
import { LoadingSpinner } from './LoadingSpinner';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  textStyle,
}) => {
  const theme = useTheme();

  // Dynamic styling based on variant & state
  const isInteractive = !disabled && !loading;

  let backgroundColor: string = theme.colors.primary;
  let textColor: string = theme.colors.textInverse;
  let borderColor: string = 'transparent';
  let borderWidth = 0;

  if (variant === 'secondary') {
    backgroundColor = theme.colors.secondary;
    textColor = theme.colors.textInverse;
  } else if (variant === 'outline') {
    backgroundColor = 'transparent';
    textColor = theme.colors.primary;
    borderColor = theme.colors.primary;
    borderWidth = 1.5;
  } else if (variant === 'ghost') {
    backgroundColor = 'transparent';
    textColor = theme.colors.primary;
  }

  if (disabled) {
    backgroundColor = variant === 'outline' || variant === 'ghost' ? 'transparent' : theme.colors.disabledSurface;
    textColor = theme.colors.disabled;
    borderColor = variant === 'outline' ? theme.colors.disabledSurface : 'transparent';
  }

  const height = size === 'sm' ? 40 : size === 'lg' ? 54 : 48;
  const paddingHorizontal = size === 'sm' ? theme.spacing.md : theme.spacing.lg;

  return (
    <Pressable
      onPress={isInteractive ? onPress : undefined}
      disabled={!isInteractive}
      android_ripple={
        isInteractive
          ? {
              color: variant === 'primary' || variant === 'secondary' ? 'rgba(255,255,255,0.2)' : theme.colors.ripple,
              borderless: false,
            }
          : undefined
      }
      style={({ pressed }) => [
        styles.base,
        {
          height,
          minHeight: 48, // Accessible touch target rule
          paddingHorizontal,
          backgroundColor,
          borderColor,
          borderWidth,
          borderRadius: theme.borderRadius.md,
          width: fullWidth ? '100%' : undefined,
          opacity: pressed && Platform.OS === 'ios' ? 0.75 : 1,
        },
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !isInteractive, busy: loading }}
    >
      {loading ? (
        <LoadingSpinner size="small" color={textColor} />
      ) : (
        <Typography
          variant={size === 'sm' ? 'sm' : 'md'}
          weight="semibold"
          color={textColor}
          align="center"
          style={textStyle}
        >
          {title}
        </Typography>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

