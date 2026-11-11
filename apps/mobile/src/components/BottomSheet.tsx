import React, { useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Dimensions,
  ViewStyle,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography } from './Typography';
import { useTheme } from '../hooks/useTheme';

export interface BottomSheetProps {
  /** Whether the bottom sheet is visible */
  visible: boolean;
  /** Callback invoked when sheet is dismissed */
  onClose: () => void;
  /** Sheet header title */
  title?: string;
  /** Sheet header subtitle */
  subtitle?: string;
  /** Optional header icon or emoji */
  icon?: React.ReactNode;
  /** Content to display inside sheet */
  children: React.ReactNode;
  /** Maximum height as a fraction of screen height (default: 0.85) */
  maxHeightPercent?: number;
  /** Whether to show the top drag handle pill (default: true) */
  showDragHandle?: boolean;
  /** Whether to show the close '✕' button in header (default: true) */
  showCloseButton?: boolean;
  /** Whether tapping the backdrop dismisses the sheet (default: true) */
  dismissOnBackdrop?: boolean;
  /** Whether dismissal is blocked (e.g. while submitting or saving) */
  preventDismiss?: boolean;
  /** Whether to wrap children in a scroll view (default: true) */
  scrollable?: boolean;
  /** Optional header right accessory */
  headerAccessory?: React.ReactNode;
  /** Optional sticky footer content rendered above safe area */
  footer?: React.ReactNode;
  /** Style override for sheet container */
  style?: ViewStyle;
  /** Style override for content container */
  contentContainerStyle?: ViewStyle;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  children,
  maxHeightPercent = 0.88,
  showDragHandle = true,
  showCloseButton = true,
  dismissOnBackdrop = true,
  preventDismiss = false,
  scrollable = true,
  headerAccessory,
  footer,
  style,
  contentContainerStyle,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get('window').height;
  const calculatedMaxHeight = Math.round(screenHeight * maxHeightPercent);

  // Handle Android hardware back button
  useEffect(() => {
    if (!visible) return;

    const onBackPress = () => {
      if (!preventDismiss) {
        onClose();
      }
      return true; // Prevent default back navigation while sheet is open
    };

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress
    );
    return () => subscription.remove();
  }, [visible, preventDismiss, onClose]);

  const handleBackdropPress = () => {
    if (dismissOnBackdrop && !preventDismiss) {
      onClose();
    }
  };

  const handleClosePress = () => {
    if (!preventDismiss) {
      onClose();
    }
  };

  const hasHeader = Boolean(title || subtitle || icon || showCloseButton || headerAccessory);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!preventDismiss) {
          onClose();
        }
      }}
      statusBarTranslucent
    >
      <View style={styles.overlayContainer}>
        {/* Semi-transparent Backdrop with Tap-to-Dismiss */}
        <Pressable
          style={styles.backdrop}
          onPress={handleBackdropPress}
          accessibilityRole="button"
          accessibilityLabel="Dismiss sheet overlay"
        />

        {/* Keyboard-Aware Sheet Body */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          <View
            style={[
              styles.sheetContent,
              {
                maxHeight: calculatedMaxHeight,
                backgroundColor: theme.colors.surface,
                paddingBottom: Math.max(insets.bottom, 16),
              },
              style,
            ]}
          >
            {/* 1. Drag Handle Bar */}
            {showDragHandle && (
              <View style={styles.handleContainer}>
                <View style={[styles.dragHandle, { backgroundColor: theme.colors.border }]} />
              </View>
            )}

            {/* 2. Standardized Sheet Header */}
            {hasHeader && (
              <View style={[styles.headerRow, { borderBottomColor: theme.colors.border }]}>
                <View style={styles.headerTitleGroup}>
                  {icon && <View style={styles.headerIcon}>{typeof icon === 'string' ? <Typography variant="md">{icon}</Typography> : icon}</View>}
                  <View style={styles.titleColumn}>
                    {title && (
                      <Typography variant="md" weight="bold" color={theme.colors.textPrimary}>
                        {title}
                      </Typography>
                    )}
                    {subtitle && (
                      <Typography variant="xs" color={theme.colors.textSecondary} style={styles.subtitleText}>
                        {subtitle}
                      </Typography>
                    )}
                  </View>
                </View>

                <View style={styles.headerActions}>
                  {headerAccessory}
                  {showCloseButton && (
                    <Pressable
                      onPress={handleClosePress}
                      disabled={preventDismiss}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      style={[styles.closeBtn, preventDismiss && styles.disabledAction]}
                      accessibilityRole="button"
                      accessibilityLabel="Close bottom sheet"
                    >
                      <Typography variant="md" weight="bold" color={theme.colors.textMuted}>
                        ✕
                      </Typography>
                    </Pressable>
                  )}
                </View>
              </View>
            )}

            {/* 3. Main Sheet Content (Scrollable or Static) */}
            {scrollable ? (
              <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {children}
              </ScrollView>
            ) : (
              <View style={[styles.staticContent, contentContainerStyle]}>
                {children}
              </View>
            )}

            {/* 4. Optional Sticky Footer */}
            {footer && (
              <View style={[styles.footerContainer, { borderTopColor: theme.colors.border }]}>
                {footer}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  keyboardContainer: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    width: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 16,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dragHandle: {
    width: 44,
    height: 4.5,
    borderRadius: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    marginRight: 10,
  },
  titleColumn: {
    flex: 1,
  },
  subtitleText: {
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledAction: {
    opacity: 0.4,
  },
  scrollArea: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  staticContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  footerContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
  },
});

