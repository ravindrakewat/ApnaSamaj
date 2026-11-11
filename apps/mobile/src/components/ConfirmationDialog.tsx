import React, { useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { Typography } from './Typography';
import { Button } from './Button';
import { useTheme } from '../hooks/useTheme';

export interface ConfirmationDialogProps {
  /** Whether the dialog is visible */
  visible: boolean;
  /** Dialog title */
  title: string;
  /** Descriptive message explaining consequences of the action */
  message: string;
  /** Label for confirm button (e.g. 'लॉगआउट', 'हटाएँ', 'Confirm') */
  confirmLabel?: string;
  /** Label for cancel button (e.g. 'रद्द करें', 'Cancel') */
  cancelLabel?: string;
  /** Visual variant: 'danger' (red), 'warning' (amber), 'info' (blue) */
  variant?: 'danger' | 'warning' | 'info';
  /** Optional icon or emoji placed in the header (e.g. '⚠️', '🚪', '🗑️') */
  icon?: string;
  /** Whether confirm action is executing (shows loading spinner and disables buttons) */
  loading?: boolean;
  /** Callback when confirm button is pressed */
  onConfirm: () => void | Promise<void>;
  /** Callback when cancel button or backdrop is pressed */
  onCancel: () => void;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  visible,
  title,
  message,
  confirmLabel = 'पुष्टि करें',
  cancelLabel = 'रद्द करें',
  variant = 'danger',
  icon,
  loading = false,
  onConfirm,
  onCancel,
}) => {
  const theme = useTheme();

  // Android hardware back button handler
  useEffect(() => {
    if (!visible) return;

    const onBackPress = () => {
      if (!loading) {
        onCancel();
      }
      return true; // Consume back event so screen behind dialog does not exit
    };

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress
    );
    return () => subscription.remove();
  }, [visible, loading, onCancel]);

  const defaultIcon =
    icon || (variant === 'danger' ? '⚠️' : variant === 'warning' ? '🔔' : 'ℹ️');

  const confirmColor =
    variant === 'danger'
      ? theme.colors.error
      : variant === 'warning'
      ? '#D97706'
      : theme.colors.primary;

  const iconBgColor =
    variant === 'danger'
      ? theme.colors.errorLight
      : variant === 'warning'
      ? '#FEF3C7'
      : theme.colors.primaryLight;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!loading) onCancel();
      }}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.dismissOverlay}
          onPress={() => {
            if (!loading) onCancel();
          }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss confirmation dialog"
        />

        <View
          style={[
            styles.dialogCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {/* Header Icon Circle */}
          <View style={[styles.iconCircle, { backgroundColor: iconBgColor }]}>
            <Typography variant="lg">{defaultIcon}</Typography>
          </View>

          {/* Title & Message */}
          <Typography
            variant="md"
            weight="bold"
            align="center"
            color={theme.colors.textPrimary}
            style={styles.dialogTitle}
          >
            {title}
          </Typography>

          <Typography
            variant="sm"
            color={theme.colors.textSecondary}
            align="center"
            style={styles.dialogMessage}
          >
            {message}
          </Typography>

          {/* Action Buttons Row */}
          <View style={styles.actionRow}>
            <Button
              title={cancelLabel}
              variant="outline"
              size="md"
              onPress={onCancel}
              disabled={loading}
              style={styles.cancelBtn}
            />

            <Button
              title={confirmLabel}
              variant="primary"
              size="md"
              loading={loading}
              disabled={loading}
              onPress={onConfirm}
              style={StyleSheet.flatten([styles.confirmBtn, { backgroundColor: confirmColor }])}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dismissOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 12,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  dialogTitle: {
    marginBottom: 8,
  },
  dialogMessage: {
    lineHeight: 20,
    marginBottom: 24,
  },
  actionRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
  },
  confirmBtn: {
    flex: 1,
  },
});
