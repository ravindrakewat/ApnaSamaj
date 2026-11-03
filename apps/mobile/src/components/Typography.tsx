import React from 'react';
import { Text, TextProps, StyleSheet, TextStyle } from 'react-native';
import { useTheme } from '../hooks/useTheme';

export interface TypographyProps extends TextProps {
  variant?: 'display' | 'title' | 'xxl' | 'xl' | 'lg' | 'md' | 'sm' | 'xs' | 'xxs';
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  color?: string;
  align?: TextStyle['textAlign'];
}

export const Typography: React.FC<TypographyProps> = ({
  variant = 'md',
  weight = 'regular',
  color,
  align = 'left',
  style,
  children,
  ...props
}) => {
  const theme = useTheme();

  const textColor = color || theme.colors.textPrimary;
  const fontSize = theme.typography.fontSizes[variant];
  const lineHeight = theme.typography.lineHeights[variant];
  const fontWeight = theme.typography.fontWeights[weight];
  const fontFamily =
    weight === 'bold'
      ? theme.typography.fontFamilies.bold
      : weight === 'medium' || weight === 'semibold'
      ? theme.typography.fontFamilies.medium
      : theme.typography.fontFamilies.regular;

  return (
    <Text
      style={[
        styles.base,
        {
          fontSize,
          lineHeight,
          fontWeight,
          fontFamily,
          color: textColor,
          textAlign: align,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
};

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});

