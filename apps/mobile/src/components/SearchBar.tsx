import React from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Typography } from './Typography';

export interface SearchBarProps {
  /** Current input text value */
  value: string;
  /** Callback on text change */
  onChangeText: (text: string) => void;
  /** Placeholder string */
  placeholder?: string;
  /** Callback when user submits keyboard search */
  onSubmitEditing?: () => void;
  /** Callback when user clicks the clear (✕) button */
  onClear?: () => void;
  /** Whether search is currently in a loading/fetching state */
  loading?: boolean;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether to show the filter trigger button beside the input */
  showFilterButton?: boolean;
  /** Callback when the filter trigger button is pressed */
  onFilterPress?: () => void;
  /** Label for the filter button (defaults to 'फ़िल्टर') */
  filterButtonLabel?: string;
  /** Count of active filters to display in a high-contrast badge */
  activeFilterCount?: number;
  /** Outer container style overrides */
  containerStyle?: ViewStyle;
  /** Search input box style overrides */
  inputBoxStyle?: ViewStyle;
  /** TextInput text style overrides */
  inputStyle?: TextStyle;
  /** Accessibility label */
  accessibilityLabel?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChangeText,
  placeholder = 'खोजें...',
  onSubmitEditing,
  onClear,
  loading = false,
  disabled = false,
  showFilterButton = false,
  onFilterPress,
  filterButtonLabel = 'फ़िल्टर',
  activeFilterCount = 0,
  containerStyle,
  inputBoxStyle,
  inputStyle,
  accessibilityLabel = 'Search input',
}) => {
  const handleClear = () => {
    if (onClear) {
      onClear();
    } else {
      onChangeText('');
    }
  };

  const hasActiveFilters = activeFilterCount > 0;

  return (
    <View style={[styles.container, containerStyle]}>
      {/* Search Input Box */}
      <View style={[styles.inputBox, disabled && styles.inputBoxDisabled, inputBoxStyle]}>
        <Typography variant="sm" color="#64748B" style={styles.searchIcon}>
          🔍
        </Typography>

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          editable={!disabled}
          onSubmitEditing={onSubmitEditing}
          returnKeyType="search"
          style={[styles.textInput, disabled && styles.textInputDisabled, inputStyle]}
          accessibilityRole="search"
          accessibilityLabel={accessibilityLabel}
        />

        {loading ? (
          <ActivityIndicator size="small" color="#1976D2" style={styles.accessory} />
        ) : value ? (
          <Pressable
            onPress={handleClear}
            disabled={disabled}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            style={styles.clearBtn}
          >
            <Typography variant="xs" weight="bold" color="#64748B">
              ✕
            </Typography>
          </Pressable>
        ) : null}
      </View>

      {/* Optional Filter Trigger Button */}
      {showFilterButton && (
        <Pressable
          onPress={onFilterPress}
          disabled={disabled}
          style={[
            styles.filterBtn,
            hasActiveFilters && styles.filterBtnActive,
            disabled && styles.filterBtnDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            hasActiveFilters
              ? `${filterButtonLabel}, ${activeFilterCount} active filters`
              : filterButtonLabel
          }
          hitSlop={4}
        >
          <Typography
            variant="xs"
            weight="bold"
            color={hasActiveFilters ? '#FFFFFF' : '#1976D2'}
          >
            🎛️ {filterButtonLabel}
          </Typography>

          {hasActiveFilters && (
            <View style={styles.activeBadge}>
              <Typography variant="xs" weight="bold" color="#1976D2" style={styles.badgeText}>
                {activeFilterCount}
              </Typography>
            </View>
          )}
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 22,
    paddingHorizontal: 12,
    height: 44,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  inputBoxDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    paddingVertical: 0,
    height: '100%',
  },
  textInputDisabled: {
    color: '#94A3B8',
  },
  clearBtn: {
    padding: 4,
  },
  accessory: {
    marginLeft: 4,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 44,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 22,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  filterBtnActive: {
    backgroundColor: '#1976D2',
    borderColor: '#1976D2',
  },
  filterBtnDisabled: {
    opacity: 0.6,
  },
  activeBadge: {
    backgroundColor: '#FFFFFF',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
  },
});

