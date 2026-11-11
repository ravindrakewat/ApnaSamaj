import React, { useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Pressable,
  ViewStyle,
} from 'react-native';
import { Typography } from './Typography';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;

export interface ProfileAvatarProps {
  /** Remote image URL */
  uri?: string | null;
  /** Name of the member (used to compute initials) */
  name?: string | null;
  /** Explicit initial character (e.g. 'R') */
  initial?: string;
  /** Size token or pixel diameter: xs (28), sm (36), md (44), lg (52), xl (72) */
  size?: AvatarSize;
  /** Custom background color for fallback initial circle */
  fallbackBackgroundColor?: string;
  /** Custom text color for fallback initial */
  fallbackTextColor?: string;
  /** Custom border color */
  borderColor?: string;
  /** Border width (default: 1.5) */
  borderWidth?: number;
  /** Optional press handler */
  onPress?: () => void;
  /** Custom container style overrides */
  style?: ViewStyle;
  /** Accessibility label */
  accessibilityLabel?: string;
}

const SIZE_MAP: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', { dimension: number; fontSize: number }> = {
  xs: { dimension: 28, fontSize: 12 },
  sm: { dimension: 36, fontSize: 14 },
  md: { dimension: 44, fontSize: 17 },
  lg: { dimension: 52, fontSize: 20 },
  xl: { dimension: 72, fontSize: 28 },
};

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  uri,
  name,
  initial,
  size = 'md',
  fallbackBackgroundColor = '#E0F2FE',
  fallbackTextColor = '#0369A1',
  borderColor,
  borderWidth = 1.5,
  onPress,
  style,
  accessibilityLabel,
}) => {
  const [imageError, setImageError] = useState(false);

  // Compute dimensions
  const metrics =
    typeof size === 'number'
      ? { dimension: size, fontSize: Math.max(10, Math.round(size * 0.4)) }
      : SIZE_MAP[size] || SIZE_MAP.md;

  const { dimension, fontSize } = metrics;
  const borderRadius = dimension / 2;

  // Compute initial
  const displayInitial = initial
    ? initial.trim().charAt(0).toUpperCase()
    : name && name.trim()
    ? name.trim().charAt(0).toUpperCase()
    : 'स';

  const defaultBorderColor =
    borderColor || (uri && !imageError ? '#E2E8F0' : '#BAE6FD');

  const containerStyle: ViewStyle = {
    width: dimension,
    height: dimension,
    borderRadius,
    borderWidth,
    borderColor: defaultBorderColor,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  };

  const renderContent = () => {
    if (uri && !imageError) {
      return (
        <Image
          source={{ uri }}
          style={[styles.image, { width: dimension, height: dimension, borderRadius }]}
          onError={() => setImageError(true)}
          resizeMode="cover"
        />
      );
    }

    return (
      <View
        style={[
          styles.fallback,
          {
            width: dimension,
            height: dimension,
            borderRadius,
            backgroundColor: fallbackBackgroundColor,
          },
        ]}
      >
        <Typography
          variant="sm"
          weight="bold"
          color={fallbackTextColor}
          style={{ fontSize, lineHeight: fontSize + 4 }}
        >
          {displayInitial}
        </Typography>
      </View>
    );
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={[containerStyle, style]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || name || 'Profile avatar'}
        hitSlop={4}
      >
        {renderContent()}
      </Pressable>
    );
  }

  return (
    <View
      style={[containerStyle, style]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel || name || 'Profile avatar'}
    >
      {renderContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#F1F5F9',
  },
  fallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

