import React, { useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ChatSearchBarProps {
  visible: boolean;
  query: string;
  onChangeQuery: (text: string) => void;
  onClose: () => void;
  resultCount: number;
  currentIndex?: number;
  onNextResult?: () => void;
  onPrevResult?: () => void;
  onOpenResultsList?: () => void;
  isLoading?: boolean;
  placeholder?: string;
}

export const ChatSearchBar: React.FC<ChatSearchBarProps> = ({
  visible,
  query,
  onChangeQuery,
  onClose,
  resultCount,
  currentIndex = 0,
  onNextResult,
  onPrevResult,
  onOpenResultsList,
  isLoading = false,
  placeholder = 'Search messages...',
}) => {
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      inputRef.current?.blur();
    }
  }, [visible]);

  if (!visible) return null;

  const hasQuery = query.trim().length > 0;

  return (
    <View style={styles.container}>
      {/* Back / Dismiss button */}
      <TouchableOpacity
        onPress={onClose}
        style={styles.actionButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Close search"
      >
        <Ionicons name="arrow-back" size={22} color="#1E293B" />
      </TouchableOpacity>

      {/* Input box */}
      <View style={styles.inputContainer}>
        <Ionicons name="search" size={18} color="#94A3B8" style={styles.searchIcon} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={query}
          onChangeText={onChangeQuery}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        {isLoading ? (
          <ActivityIndicator size="small" color="#2563EB" style={styles.loader} />
        ) : hasQuery ? (
          <TouchableOpacity
            onPress={() => onChangeQuery('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.clearButton}
          >
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Results navigation and counter */}
      {hasQuery && (
        <View style={styles.controlsRow}>
          <TouchableOpacity
            onPress={onOpenResultsList}
            style={styles.countBadge}
            accessibilityRole="button"
            accessibilityLabel={`${resultCount} results found, open list`}
          >
            <Text style={styles.countText}>
              {resultCount > 0
                ? `${currentIndex + 1}/${resultCount}`
                : '0 matches'}
            </Text>
          </TouchableOpacity>

          {resultCount > 1 && onPrevResult && onNextResult && (
            <View style={styles.steppers}>
              <TouchableOpacity
                onPress={onPrevResult}
                style={styles.stepperButton}
                accessibilityRole="button"
                accessibilityLabel="Previous match"
              >
                <Ionicons name="chevron-up" size={18} color="#1E293B" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onNextResult}
                style={styles.stepperButton}
                accessibilityRole="button"
                accessibilityLabel="Next match"
              >
                <Ionicons name="chevron-down" size={18} color="#1E293B" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 6,
    zIndex: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  actionButton: {
    padding: 6,
    marginRight: 4,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 38,
  },
  searchIcon: {
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: Platform.OS === 'ios' ? 6 : 2,
  },
  loader: {
    marginLeft: 6,
  },
  clearButton: {
    marginLeft: 6,
    padding: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
  },
  countBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  steppers: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  stepperButton: {
    padding: 4,
  },
});

