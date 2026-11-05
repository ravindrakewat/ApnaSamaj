import React from 'react';
import { View, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { Typography } from '../Typography';
import { useTheme } from '../../hooks/useTheme';
import { useLocalization } from '../../hooks/useLocalization';

interface ChatUploadProgressProps {
  progress?: number;
  fileName?: string;
  isError?: boolean;
  onRetry?: () => void;
  onCancel?: () => void;
}

export const ChatUploadProgress: React.FC<ChatUploadProgressProps> = ({
  progress,
  fileName,
  isError = false,
  onRetry,
  onCancel,
}) => {
  const theme = useTheme();
  const { language } = useLocalization();
  const isHindi = language === 'hi';

  if (isError) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <View style={styles.textCol}>
          <Typography variant="sm" weight="medium" color={theme.colors.error}>
            ⚠️ {isHindi ? 'अपलोड विफल रहा' : 'Upload failed'}
          </Typography>
          {fileName && (
            <Typography variant="xs" color={theme.colors.textSecondary} numberOfLines={1}>
              {fileName}
            </Typography>
          )}
        </View>

        <View style={styles.btnRow}>
          {onRetry && (
            <TouchableOpacity style={styles.actionBtn} onPress={onRetry}>
              <Typography variant="xs" weight="semibold" color={theme.colors.primary}>
                {isHindi ? 'पुनः प्रयास' : 'Retry'}
              </Typography>
            </TouchableOpacity>
          )}
          {onCancel && (
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Typography variant="xs" color="#64748B">
                ✕
              </Typography>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color={theme.colors.primary} style={styles.spinner} />
      <View style={styles.textCol}>
        <Typography variant="sm" weight="medium" color={theme.colors.textPrimary}>
          {isHindi ? 'अपलोड हो रहा है...' : 'Uploading attachment...'}
          {progress !== undefined ? ` ${progress}%` : ''}
        </Typography>
        {fileName && (
          <Typography variant="xs" color={theme.colors.textSecondary} numberOfLines={1}>
            {fileName}
          </Typography>
        )}
      </View>

      {onCancel && (
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Typography variant="xs" color="#64748B">
            ✕
          </Typography>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
  },
  spinner: {
    marginRight: 10,
  },
  textCol: {
    flex: 1,
    marginRight: 8,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  cancelBtn: {
    padding: 6,
  },
});
