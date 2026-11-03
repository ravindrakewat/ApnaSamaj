import React, { useState } from 'react';
import {
  View,
  TextInput,
  TextInputProps,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Typography } from './Typography';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  rightAccessory?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  containerStyle,
  inputStyle,
  rightAccessory,
  value,
  onChangeText,
  placeholder,
  ...props
}) => {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  const borderColor = error
    ? theme.colors.error
    : isFocused
    ? theme.colors.primary
    : theme.colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Typography
          variant="sm"
          weight="medium"
          color={theme.colors.textPrimary}
          style={styles.label}
        >
          {label}
        </Typography>
      )}

      <View
        style={[
          styles.inputWrapper,
          {
            borderColor,
            borderRadius: theme.borderRadius.md,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={[
            styles.input,
            {
              color: theme.colors.textPrimary,
              fontSize: theme.typography.fontSizes.md,
            },
            inputStyle,
          ]}
          {...props}
        />
        {rightAccessory && <View style={styles.accessory}>{rightAccessory}</View>}
      </View>

      {error ? (
        <Typography variant="xs" color={theme.colors.error} style={styles.feedback}>
          {error}
        </Typography>
      ) : helperText ? (
        <Typography variant="xs" color={theme.colors.textSecondary} style={styles.feedback}>
          {helperText}
        </Typography>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    minHeight: 48,
    borderWidth: 1.5,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    height: '100%',
    padding: 0,
  },
  accessory: {
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedback: {
    marginTop: 4,
  },
});

