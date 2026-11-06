import React from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChatSearchResultItem } from '@apnasamaj/shared-types';

interface ChatSearchResultsModalProps {
  visible: boolean;
  onClose: () => void;
  results: ChatSearchResultItem[];
  query: string;
  isLoading: boolean;
  onSelectResult: (item: ChatSearchResultItem) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

/**
 * Highlights the matched substring within a text string.
 */
function renderHighlightedText(text: string, query: string) {
  if (!query || !query.trim() || !text) {
    return <Text style={styles.snippetText}>{text}</Text>;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const lowerText = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let startIndex = 0;
  let keyIndex = 0;

  while (startIndex < text.length) {
    const matchIndex = lowerText.indexOf(normalizedQuery, startIndex);
    if (matchIndex === -1) {
      parts.push(
        <Text key={`tail-${keyIndex++}`} style={styles.snippetText}>
          {text.substring(startIndex)}
        </Text>
      );
      break;
    }

    if (matchIndex > startIndex) {
      parts.push(
        <Text key={`plain-${keyIndex++}`} style={styles.snippetText}>
          {text.substring(startIndex, matchIndex)}
        </Text>
      );
    }

    parts.push(
      <Text key={`match-${keyIndex++}`} style={styles.highlightedText}>
        {text.substring(matchIndex, matchIndex + normalizedQuery.length)}
      </Text>
    );

    startIndex = matchIndex + normalizedQuery.length;
  }

  return <Text style={styles.snippetText}>{parts}</Text>;
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();

    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return timeStr;

    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
  } catch {
    return '';
  }
}

export const ChatSearchResultsModal: React.FC<ChatSearchResultsModalProps> = ({
  visible,
  onClose,
  results,
  query,
  isLoading,
  onSelectResult,
  onLoadMore,
  hasMore = false,
}) => {
  const renderItem = ({ item }: { item: ChatSearchResultItem }) => {
    const formattedDate = formatDate(item.createdAt);

    return (
      <TouchableOpacity
        style={styles.resultCard}
        onPress={() => onSelectResult(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Message from ${item.senderName}`}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.senderName} numberOfLines={1}>
            {item.senderName}
          </Text>
          <View style={styles.headerRight}>
            {item.matchSource === 'local' ? (
              <View style={styles.sourceBadgeLocal}>
                <Text style={styles.sourceBadgeTextLocal}>⚡ Cached</Text>
              </View>
            ) : (
              <View style={styles.sourceBadgeRemote}>
                <Text style={styles.sourceBadgeTextRemote}>☁️ Server</Text>
              </View>
            )}
            <Text style={styles.dateText}>{formattedDate}</Text>
          </View>
        </View>

        {/* Attachment badge if any */}
        {item.attachmentType && (
          <View style={styles.attachmentRow}>
            <Ionicons
              name={
                item.attachmentType === 'IMAGE'
                  ? 'image-outline'
                  : item.attachmentType === 'VIDEO'
                  ? 'videocam-outline'
                  : item.attachmentType === 'AUDIO'
                  ? 'mic-outline'
                  : 'document-text-outline'
              }
              size={14}
              color="#0284C7"
              style={{ marginRight: 4 }}
            />
            <Text style={styles.attachmentLabel}>
              {item.attachmentName || item.attachmentType}
            </Text>
          </View>
        )}

        {/* Highlighted text preview */}
        <View style={styles.snippetContainer}>
          {renderHighlightedText(item.content || (item.attachmentName ? `[${item.attachmentType}]` : ''), query)}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close search results"
          >
            <Ionicons name="close" size={24} color="#1E293B" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.modalTitle}>Search Results</Text>
            {query.trim().length > 0 && (
              <Text style={styles.modalSubtitle} numberOfLines={1}>
                "{query.trim()}" ({results.length} found)
              </Text>
            )}
          </View>
        </View>

        {/* Body */}
        {isLoading && results.length === 0 ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>Searching messages...</Text>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="search-outline" size={48} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No messages found</Text>
            <Text style={styles.emptySubtitle}>
              {query.trim().length > 0
                ? `No results found for "${query.trim()}". Try another term.`
                : 'Type a query above to search chat messages.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item, index) => `${item.id}-${item.matchSource}-${index}`}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onEndReached={hasMore && onLoadMore ? onLoadMore : undefined}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              hasMore && isLoading ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color="#2563EB" />
                </View>
              ) : null
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  closeButton: {
    padding: 6,
    marginRight: 12,
  },
  headerTitleWrap: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  listContent: {
    padding: 12,
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  senderName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
    marginRight: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sourceBadgeLocal: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginRight: 6,
  },
  sourceBadgeTextLocal: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  sourceBadgeRemote: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginRight: 6,
  },
  sourceBadgeTextRemote: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0369A1',
  },
  dateText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  attachmentLabel: {
    fontSize: 11,
    color: '#0284C7',
    fontWeight: '600',
  },
  snippetContainer: {
    marginTop: 2,
  },
  snippetText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  highlightedText: {
    fontSize: 13,
    fontWeight: '800',
    backgroundColor: '#FEF08A',
    color: '#854D0E',
    lineHeight: 18,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },
  footerLoader: {
    paddingVertical: 12,
    alignItems: 'center',
  },
});

