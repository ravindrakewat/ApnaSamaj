import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Dimensions,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChatAttachmentType, ChatMediaGalleryItem } from '@apnasamaj/shared-types';
import { voicePlaybackService } from '../../services';
import { resolveAttachmentDisplayUrl } from '../../utils/attachment';

const { width } = Dimensions.get('window');
const GRID_ITEM_SIZE = (width - 32 - 16) / 3;

interface ChatMediaGalleryModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  onFetchMedia: (
    type?: ChatAttachmentType,
    cursor?: string
  ) => Promise<{ media: ChatMediaGalleryItem[]; nextCursor?: string | null; hasMore: boolean }>;
  onNavigateToMessage: (messageId: string) => void;
}

type TabKey = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';

interface TabConfig {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const TABS: TabConfig[] = [
  { key: 'IMAGE', label: 'Photos', icon: 'image-outline' },
  { key: 'VIDEO', label: 'Videos', icon: 'videocam-outline' },
  { key: 'AUDIO', label: 'Audio', icon: 'mic-outline' },
  { key: 'DOCUMENT', label: 'Docs', icon: 'document-text-outline' },
];

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function getMonthYearHeader(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Older';
    const now = new Date();
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
      return 'This Month';
    }
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } catch {
    return 'Older';
  }
}

export const ChatMediaGalleryModal: React.FC<ChatMediaGalleryModalProps> = ({
  visible,
  onClose,
  title,
  onFetchMedia,
  onNavigateToMessage,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('IMAGE');
  const [items, setItems] = useState<ChatMediaGalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Audio preview state
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  // Preview full photo modal state
  const [selectedPhoto, setSelectedPhoto] = useState<ChatMediaGalleryItem | null>(null);

  const loadMedia = useCallback(
    async (tab: TabKey, cursor?: string, isInitial: boolean = false) => {
      if (isInitial) {
        setIsLoading(true);
        setError(null);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const res = await onFetchMedia(tab, cursor);
        setItems((prev) => (isInitial ? res.media : [...prev, ...res.media]));
        setNextCursor(res.nextCursor || null);
        setHasMore(res.hasMore);
      } catch (err: unknown) {
        console.warn('[ChatMediaGallery] fetch error:', err);
        setError('Failed to load media.');
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [onFetchMedia]
  );

  useEffect(() => {
    if (visible) {
      loadMedia(activeTab, undefined, true);
    } else {
      setItems([]);
      setNextCursor(null);
      setHasMore(false);
      voicePlaybackService.stop().catch(() => {});
      setPlayingAudioId(null);
      setSelectedPhoto(null);
    }
  }, [visible, activeTab, loadMedia]);

  const handleTabChange = (newTab: TabKey) => {
    if (newTab === activeTab) return;
    voicePlaybackService.stop().catch(() => {});
    setPlayingAudioId(null);
    setActiveTab(newTab);
  };

  const handleLoadMore = () => {
    if (!hasMore || isLoadingMore || !nextCursor) return;
    loadMedia(activeTab, nextCursor, false);
  };

  const handlePlayAudio = async (item: ChatMediaGalleryItem) => {
    if (playingAudioId === item.id) {
      await voicePlaybackService.pause();
      setPlayingAudioId(null);
    } else {
      try {
        await voicePlaybackService.play({ audioId: item.id, uri: item.url, attachmentId: item.id });
        setPlayingAudioId(item.id);
      } catch (err) {
        console.warn('Audio playback error:', err);
      }
    }
  };

  const handleOpenFile = (url: string) => {
    if (url) {
      Linking.openURL(url).catch((err) => console.warn('Could not open file URL:', err));
    }
  };

  const handleJumpToMessage = (messageId: string) => {
    onClose();
    onNavigateToMessage(messageId);
  };

  // Group items by Month/Year header
  const groupedData = useMemo(() => {
    const sections: { title: string; data: ChatMediaGalleryItem[] }[] = [];
    const map = new Map<string, ChatMediaGalleryItem[]>();

    for (const item of items) {
      const header = getMonthYearHeader(item.createdAt);
      const list = map.get(header) || [];
      list.push(item);
      map.set(header, list);
    }

    for (const [sectionTitle, sectionItems] of map.entries()) {
      sections.push({ title: sectionTitle, data: sectionItems });
    }

    return sections;
  }, [items]);

  // Render photo/video grid items
  const renderGridItem = ({ item }: { item: ChatMediaGalleryItem }) => {
    const isVideo = item.type === 'VIDEO';

    return (
      <View style={styles.gridItemContainer}>
        <TouchableOpacity
          style={styles.gridCard}
          onPress={() => (isVideo ? handleOpenFile(resolveAttachmentDisplayUrl(item.url)) : setSelectedPhoto(item))}
          activeOpacity={0.8}
        >
          {isVideo ? (
            <View style={styles.videoPlaceholder}>
              <Ionicons name="videocam" size={28} color="#FFFFFF" />
              <View style={styles.videoMetaBadge}>
                <Ionicons name="play" size={10} color="#FFFFFF" style={{ marginRight: 2 }} />
                <Text style={styles.videoMetaText}>{formatDuration(item.duration)}</Text>
              </View>
            </View>
          ) : (
            <Image source={{ uri: resolveAttachmentDisplayUrl(item.url) }} style={styles.gridImage} resizeMode="cover" />
          )}
        </TouchableOpacity>

        {/* Jump to message button */}
        <TouchableOpacity
          style={styles.jumpBadge}
          onPress={() => handleJumpToMessage(item.messageId)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel="Go to message"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={12} color="#0284C7" />
          <Text style={styles.jumpText}>Go to msg</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Render audio list item
  const renderAudioItem = ({ item }: { item: ChatMediaGalleryItem }) => {
    const isPlaying = playingAudioId === item.id;

    return (
      <View style={styles.audioCard}>
        <TouchableOpacity
          style={styles.audioPlayButton}
          onPress={() => handlePlayAudio(item)}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause audio' : 'Play audio'}
        >
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.audioInfo}>
          <Text style={styles.audioTitle} numberOfLines={1}>
            {item.fileName || 'Voice Note'}
          </Text>
          <View style={styles.audioMetaRow}>
            <Text style={styles.audioSubText}>
              {formatDuration(item.duration)} • {formatFileSize(item.fileSizeBytes)}
            </Text>
            <Text style={styles.audioDot}>•</Text>
            <Text style={styles.audioSender} numberOfLines={1}>
              {item.senderName}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.audioJumpButton}
          onPress={() => handleJumpToMessage(item.messageId)}
          accessibilityRole="button"
          accessibilityLabel="Go to message"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#0284C7" />
        </TouchableOpacity>
      </View>
    );
  };

  // Render document list item
  const renderDocumentItem = ({ item }: { item: ChatMediaGalleryItem }) => {
    const ext = item.fileName.split('.').pop()?.toUpperCase() || 'DOC';

    return (
      <TouchableOpacity
        style={styles.docCard}
        onPress={() => handleOpenFile(resolveAttachmentDisplayUrl(item.url))}
        activeOpacity={0.7}
      >
        <View style={styles.docIconWrap}>
          <Ionicons name="document-text" size={24} color="#0284C7" />
          <Text style={styles.docExtBadge}>{ext}</Text>
        </View>

        <View style={styles.docInfo}>
          <Text style={styles.docFileName} numberOfLines={1}>
            {item.fileName}
          </Text>
          <Text style={styles.docMeta}>
            {formatFileSize(item.fileSizeBytes)} • {item.senderName}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.docJumpButton}
          onPress={(e) => {
            e.stopPropagation?.();
            handleJumpToMessage(item.messageId);
          }}
          accessibilityRole="button"
          accessibilityLabel="Go to message"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#0284C7" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        {/* Top Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close gallery"
          >
            <Ionicons name="close" size={24} color="#1E293B" />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.modalTitle}>Media & Docs</Text>
            <Text style={styles.modalSubtitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
        </View>

        {/* Tab Segment Switcher */}
        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const isSelected = tab.key === activeTab;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabButton, isSelected && styles.tabButtonActive]}
                onPress={() => handleTabChange(tab.key)}
                accessibilityRole="button"
                accessibilityLabel={tab.label}
              >
                <Ionicons
                  name={tab.icon}
                  size={16}
                  color={isSelected ? '#0284C7' : '#64748B'}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.tabText, isSelected && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Content Body */}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#0284C7" />
            <Text style={styles.loadingText}>Loading {activeTab.toLowerCase()}...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <Ionicons name="alert-circle-outline" size={44} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => loadMedia(activeTab, undefined, true)}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons
              name={
                activeTab === 'IMAGE'
                  ? 'images-outline'
                  : activeTab === 'VIDEO'
                  ? 'videocam-outline'
                  : activeTab === 'AUDIO'
                  ? 'mic-outline'
                  : 'folder-open-outline'
              }
              size={52}
              color="#CBD5E1"
            />
            <Text style={styles.emptyTitle}>No {activeTab.toLowerCase()} yet</Text>
            <Text style={styles.emptySubtitle}>
              Media shared in this chat will appear here organized by date.
            </Text>
          </View>
        ) : activeTab === 'IMAGE' || activeTab === 'VIDEO' ? (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderGridItem}
            numColumns={3}
            contentContainerStyle={styles.gridContent}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isLoadingMore ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color="#0284C7" />
                </View>
              ) : null
            }
          />
        ) : activeTab === 'AUDIO' ? (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderAudioItem}
            contentContainerStyle={styles.listContent}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isLoadingMore ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color="#0284C7" />
                </View>
              ) : null
            }
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderDocumentItem}
            contentContainerStyle={styles.listContent}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isLoadingMore ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color="#0284C7" />
                </View>
              ) : null
            }
          />
        )}

        {/* Full-screen Photo Modal */}
        {selectedPhoto && (
          <Modal visible={true} transparent={true} animationType="fade">
            <View style={styles.photoViewerBackdrop}>
              <SafeAreaView style={styles.photoViewerHeader}>
                <TouchableOpacity
                  onPress={() => setSelectedPhoto(null)}
                  style={styles.photoViewerClose}
                >
                  <Ionicons name="close" size={28} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const id = selectedPhoto.messageId;
                    setSelectedPhoto(null);
                    handleJumpToMessage(id);
                  }}
                  style={styles.photoViewerJump}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.photoViewerJumpText}>Go to message</Text>
                </TouchableOpacity>
              </SafeAreaView>

              <Image
                source={{ uri: resolveAttachmentDisplayUrl(selectedPhoto.url) }}
                style={styles.fullScreenImage}
                resizeMode="contain"
              />

              <View style={styles.photoViewerFooter}>
                <Text style={styles.photoFooterSender}>{selectedPhoto.senderName}</Text>
                <Text style={styles.photoFooterMeta}>
                  {formatFileSize(selectedPhoto.fileSizeBytes)} • {getMonthYearHeader(selectedPhoto.createdAt)}
                </Text>
              </View>
            </View>
          </Modal>
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
  headerTextWrap: {
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 3,
  },
  tabButtonActive: {
    backgroundColor: '#E0F2FE',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#0284C7',
    fontWeight: '700',
  },
  gridContent: {
    padding: 12,
  },
  gridItemContainer: {
    width: GRID_ITEM_SIZE,
    margin: 4,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  gridCard: {
    width: '100%',
    height: GRID_ITEM_SIZE,
    backgroundColor: '#E2E8F0',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  videoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoMetaBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoMetaText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  jumpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    backgroundColor: '#F0F9FF',
    borderTopWidth: 1,
    borderTopColor: '#E0F2FE',
  },
  jumpText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284C7',
    marginLeft: 3,
  },
  listContent: {
    padding: 12,
  },
  audioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  audioPlayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  audioInfo: {
    flex: 1,
  },
  audioTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  audioMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  audioSubText: {
    fontSize: 11,
    color: '#64748B',
  },
  audioDot: {
    fontSize: 11,
    color: '#CBD5E1',
    marginHorizontal: 4,
  },
  audioSender: {
    fontSize: 11,
    color: '#0284C7',
    fontWeight: '600',
    flex: 1,
  },
  audioJumpButton: {
    padding: 8,
    marginLeft: 6,
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  docIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  docExtBadge: {
    fontSize: 8,
    fontWeight: '800',
    color: '#0284C7',
    marginTop: -2,
  },
  docInfo: {
    flex: 1,
  },
  docFileName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  docMeta: {
    fontSize: 11,
    color: '#64748B',
  },
  docJumpButton: {
    padding: 8,
    marginLeft: 6,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    backgroundColor: '#0284C7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  footerLoader: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  photoViewerBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
  },
  photoViewerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 16 : 0,
    zIndex: 10,
  },
  photoViewerClose: {
    padding: 8,
  },
  photoViewerJump: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  photoViewerJumpText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },
  fullScreenImage: {
    width: '100%',
    height: '75%',
  },
  photoViewerFooter: {
    padding: 16,
    alignItems: 'center',
  },
  photoFooterSender: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  photoFooterMeta: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
});
