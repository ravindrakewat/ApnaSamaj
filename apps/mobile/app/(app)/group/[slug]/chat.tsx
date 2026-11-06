import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GroupDetails, GroupPrivacy, ChatAttachmentInput, ChatSearchResultItem } from '@apnasamaj/shared-types';
import {
  Typography,
  Card,
  Button,
  ChatAttachmentButton,
  SelectedChatAttachment,
  ChatAttachmentPreview,
  ChatImageMessage,
  ChatVideoMessage,
  ChatDocumentMessage,
  ChatAudioMessage,
  VoiceRecorder,
  RecordedVoiceNote,
  QuotedReplyPreview,
  ReactionBadgeList,
  EmojiReactionSelector,
  ReplyComposerBar,
  ChatSearchBar,
  ChatSearchResultsModal,
  ChatMediaGalleryModal,
} from '../../../../src/components';
import { useTheme } from '../../../../src/hooks/useTheme';
import { useLocalization } from '../../../../src/hooks/useLocalization';
import { useAuth } from '../../../../src/hooks/useAuth';
import { groupsApi } from '../../../../src/api/groups.api';
import { chatApi } from '../../../../src/api/chat.api';
import { useGroupChat, ExtendedChatMessage } from '../../../../src/hooks/useGroupChat';
import { voicePlaybackService, voiceRecordingService, chatPersistenceService } from '../../../../src/services';

export default function GroupChatScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language } = useLocalization();
  const { user } = useAuth();

  // Group Details State
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [loadingGroup, setLoadingGroup] = useState<boolean>(true);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [selectedAttachment, setSelectedAttachment] = useState<SelectedChatAttachment | null>(null);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState<boolean>(false);

  /**
   * Load group details
   */
  const loadGroup = useCallback(async () => {
    if (!slug) return;
    setLoadingGroup(true);
    setGroupError(null);
    try {
      const data = await groupsApi.getGroupBySlug(slug.trim());
      setGroup(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'समूह विवरण लोड करने में विफल।';
      setGroupError(msg);
    } finally {
      setLoadingGroup(false);
    }
  }, [slug]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  // Screen unmount hardware audio resource release
  useEffect(() => {
    return () => {
      voicePlaybackService.stop().catch(() => { });
      voiceRecordingService.cancelRecording().catch(() => { });
    };
  }, []);

  const isMember = Boolean(group?.isMember);
  const isPrivate = group?.privacy === GroupPrivacy.PRIVATE;

  // Real-time Chat Hook
  const {
    messages,
    isLoadingHistory,
    isLoadingOlder,
    hasMore,
    error: chatError,
    isConnected,
    isOffline,
    typingUsers,
    loadInitialHistory,
    loadOlderMessages,
    sendMessage,
    retryMessage,
    reportTyping,
    replyingToMessage,
    setReplyingToMessage,
    toggleReaction,
    jumpToMessage,
  } = useGroupChat({
    groupId: group?.id || '',
    isMember,
    isPrivate,
  });

  const [reactionTargetMessage, setReactionTargetMessage] = useState<ExtendedChatMessage | null>(null);
  const flatListRef = useRef<FlatList<ExtendedChatMessage>>(null);

  // Search & Media Gallery state
  const [isSearchVisible, setIsSearchVisible] = useState<boolean>(false);
  const [isSearchResultsModalVisible, setIsSearchResultsModalVisible] = useState<boolean>(false);
  const [isGalleryVisible, setIsGalleryVisible] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<ChatSearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { communitySlug } = useAuth();

  // Debounced search over local cache and remote server
  useEffect(() => {
    if (!isSearchVisible || !searchQuery.trim() || !group?.id) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      const q = searchQuery.trim();
      try {
        // 1. Search locally persisted messages
        const localMatches = await chatPersistenceService.searchLocalMessages(
          group.id,
          communitySlug || '',
          user?.id || '',
          q
        );

        // 2. Search remote server messages
        let remoteMatches: ChatSearchResultItem[] = [];
        try {
          const remoteRes = await chatApi.searchGroupMessages(group.id, { q, limit: 30 });
          remoteMatches = remoteRes.results || [];
        } catch (remoteErr) {
          console.warn('[GroupChat] Remote search error:', remoteErr);
        }

        // 3. Deduplicate
        const seenIds = new Set<string>();
        const merged: ChatSearchResultItem[] = [];

        for (const item of localMatches) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            merged.push(item);
          }
        }
        for (const item of remoteMatches) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            merged.push(item);
          }
        }

        setSearchResults(merged);
        setCurrentMatchIndex(0);
      } catch (err) {
        console.warn('[GroupChat] Search execution error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery, isSearchVisible, group?.id, communitySlug, user?.id]);

  const handleScrollToTargetMessage = useCallback(
    async (targetId: string) => {
      const targetIndex = await jumpToMessage(targetId);
      if (targetIndex >= 0) {
        try {
          flatListRef.current?.scrollToIndex({
            index: targetIndex,
            animated: true,
            viewPosition: 0.5,
          });
        } catch {
          setTimeout(() => {
            try {
              flatListRef.current?.scrollToIndex({
                index: targetIndex,
                animated: true,
                viewPosition: 0.5,
              });
            } catch { }
          }, 250);
        }
      }
    },
    [jumpToMessage]
  );

  const handleNextSearchMatch = () => {
    if (searchResults.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % searchResults.length;
    setCurrentMatchIndex(nextIdx);
    handleScrollToTargetMessage(searchResults[nextIdx].id);
  };

  const handlePrevSearchMatch = () => {
    if (searchResults.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentMatchIndex(prevIdx);
    handleScrollToTargetMessage(searchResults[prevIdx].id);
  };

  const handleScrollToMessage = useCallback(
    (targetId: string) => {
      handleScrollToTargetMessage(targetId);
    },
    [handleScrollToTargetMessage]
  );

  const handleJoin = async () => {
    if (!group || isJoining) return;
    setIsJoining(true);
    try {
      const res = await groupsApi.joinGroup(group.id);
      setGroup((prev) =>
        prev
          ? {
            ...prev,
            isMember: true,
            myRole: res.role,
            membersCount: prev.membersCount + 1,
          }
          : null
      );
      Alert.alert(
        language === 'hi' ? 'सफल' : 'Success',
        language === 'hi' ? 'समूह में शामिल हुए!' : 'Joined group successfully!'
      );
      loadInitialHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to join group.';
      Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', msg);
    } finally {
      setIsJoining(false);
    }
  };

  const handleInputChange = (text: string) => {
    setInputText(text);
    reportTyping(text);
  };

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if ((!trimmed && !selectedAttachment) || isSending || isUploadingAttachment) return;

    if ((!isConnected || isOffline) && selectedAttachment) {
      Alert.alert(
        language === 'hi' ? 'ऑफ़लाइन चेतावनी' : 'Offline Notice',
        language === 'hi'
          ? 'मीडिया फ़ाइल अपलोड करने के लिए इंटरनेट कनेक्शन आवश्यक है। कृपया टेक्स्ट संदेश भेजें या कनेक्शन मिलने की प्रतीक्षा करें।'
          : 'Media file uploads require an active internet connection. Please send text or wait for network recovery.'
      );
      return;
    }

    setIsSending(true);
    const attachmentToUpload = selectedAttachment;
    const textToSend = trimmed;

    // Reset input fields immediately
    setInputText('');
    setSelectedAttachment(null);

    try {
      let uploadedAttachmentData = undefined;
      if (attachmentToUpload && group?.id) {
        setIsUploadingAttachment(true);
        uploadedAttachmentData = await chatApi.uploadGroupAttachment(group.id, {
          uri: attachmentToUpload.uri,
          name: attachmentToUpload.name,
          type: attachmentToUpload.type,
        });
      }

      await sendMessage(textToSend, uploadedAttachmentData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'संदेश भेजने में विफल।';
      Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', msg);
    } finally {
      setIsSending(false);
      setIsUploadingAttachment(false);
    }
  };

  const handleSendVoiceNote = async (voiceNote: RecordedVoiceNote) => {
    if (!group?.id) return;

    const attachmentInput: ChatAttachmentInput = {
      type: 'AUDIO',
      fileName: `voice_note_${Date.now()}.m4a`,
      mimeType: 'audio/m4a',
      fileSizeBytes: Math.max(1024, Math.round((voiceNote.durationMillis * 128) / 8)),
      storagePath: '',
      localUri: voiceNote.uri,
      duration: voiceNote.durationSeconds,
    };

    if (isOffline) {
      await sendMessage('', attachmentInput);
      return;
    }

    try {
      setIsUploadingAttachment(true);
      const uploaded = await chatApi.uploadGroupAttachment(group.id, {
        uri: voiceNote.uri,
        name: attachmentInput.fileName,
        type: attachmentInput.mimeType,
      });

      await sendMessage('', {
        id: uploaded.id,
        type: 'AUDIO',
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        fileSizeBytes: uploaded.fileSizeBytes,
        storagePath: uploaded.storagePath,
        duration: voiceNote.durationSeconds,
        localUri: voiceNote.uri,
      });
    } catch (err: any) {
      console.warn('[GroupChat] Voice note upload error, routing to offline outbox queue:', err);
      await sendMessage('', attachmentInput);
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const formatMessageTime = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatDateHeader = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      if (d.toDateString() === today.toDateString()) {
        return language === 'hi' ? 'आज' : 'Today';
      }
      if (d.toDateString() === yesterday.toDateString()) {
        return language === 'hi' ? 'कल' : 'Yesterday';
      }
      return d.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-US', {
        day: 'numeric',
        month: 'short',
        year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
      });
    } catch {
      return '';
    }
  };

  // Distinct color for other sender names (WhatsApp-style)
  const getSenderColor = (senderId: string) => {
    const colors = ['#E53935', '#8E24AA', '#1E88E5', '#00897B', '#FB8C00', '#6D4C41', '#039BE5'];
    let hash = 0;
    for (let i = 0; i < senderId.length; i++) {
      hash = senderId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const renderMessageItem = ({ item, index }: { item: ExtendedChatMessage; index: number }) => {
    const isOwn = item.senderId === user?.id;

    // In an inverted list, index + 1 is the chronologically earlier message.
    const prevItem = index + 1 < messages.length ? messages[index + 1] : null;
    const isDifferentDay =
      !prevItem ||
      new Date(item.createdAt).toDateString() !== new Date(prevItem.createdAt).toDateString();

    return (
      <View style={styles.messageRowWrapper}>
        {/* Date separator pill above the first message of each day */}
        {isDifferentDay && (
          <View style={styles.dateSeparatorContainer}>
            <View style={styles.datePill}>
              <Typography variant="xs" weight="semibold" color="#4B5563">
                {formatDateHeader(item.createdAt)}
              </Typography>
            </View>
          </View>
        )}

        {/* Message Bubble Container */}
        <View style={[styles.bubbleRow, isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther]}>
          {/* Avatar for other senders */}
          {!isOwn && (
            <View style={styles.senderAvatarContainer}>
              {item.sender?.avatarUrl ? (
                <Image source={{ uri: item.sender.avatarUrl }} style={styles.senderAvatar} />
              ) : (
                <View style={[styles.senderAvatarFallback, { backgroundColor: theme.colors.surfaceSubtle }]}>
                  <Typography variant="xs" weight="bold" color={getSenderColor(item.senderId)}>
                    {(item.sender?.fullName || 'M').charAt(0).toUpperCase()}
                  </Typography>
                </View>
              )}
            </View>
          )}

          {/* Bubble Card with Long Press Reaction/Reply */}
          <View style={isOwn ? styles.bubbleColumnOwn : styles.bubbleColumnOther}>
            <Pressable
              onLongPress={() => {
                Alert.alert(
                  item.sender?.fullName || (isOwn ? 'You' : 'Member'),
                  undefined,
                  [
                    {
                      text: language === 'hi' ? 'प्रतिक्रिया दें' : 'React',
                      onPress: () => setReactionTargetMessage(item),
                    },
                    {
                      text: language === 'hi' ? 'उत्तर दें (Reply)' : 'Reply',
                      onPress: () => setReplyingToMessage(item),
                    },
                    {
                      text: language === 'hi' ? 'रद्द करें' : 'Cancel',
                      style: 'cancel',
                    },
                  ]
                );
              }}
              style={[
                styles.bubble,
                isOwn ? styles.bubbleOwn : styles.bubbleOther,
                item.isError && styles.bubbleError,
              ]}
            >
              {/* Quoted Message Preview inside bubble if present */}
              {item.replyTo && (
                <QuotedReplyPreview
                  replyTo={item.replyTo}
                  isMyMessage={isOwn}
                  onPress={() => item.replyTo?.id && handleScrollToMessage(item.replyTo.id)}
                />
              )}

              {/* Sender Name in Group Chat */}
              {!isOwn && item.sender && (
                <Typography
                  variant="xs"
                  weight="bold"
                  style={[styles.senderName, { color: getSenderColor(item.senderId) }]}
                >
                  {item.sender.fullName}
                </Typography>
              )}

              {/* Attachment Rendering */}
              {item.attachments && item.attachments.length > 0 && (
                <View style={styles.attachmentsWrapper}>
                  {item.attachments.map((att) => {
                    if (att.type === 'IMAGE') {
                      return <ChatImageMessage key={att.id} attachment={att} />;
                    }
                    if (att.type === 'VIDEO') {
                      return <ChatVideoMessage key={att.id} attachment={att} />;
                    }
                    if (att.type === 'AUDIO') {
                      return (
                        <ChatAudioMessage
                          key={att.id || att.storagePath || att.localUri}
                          attachment={att}
                          isCurrentUser={isOwn}
                          deliveryStatus={item.deliveryStatus}
                          onRetry={() => item.tempId && retryMessage(item.tempId)}
                        />
                      );
                    }
                    return <ChatDocumentMessage key={att.id} attachment={att} />;
                  })}
                </View>
              )}

              {/* Message Body (only rendered if non-empty content exists) */}
              {item.content && item.content.trim().length > 0 ? (
                <Typography variant="sm" color={theme.colors.textPrimary} style={styles.messageContent}>
                  {item.content}
                </Typography>
              ) : null}

              {/* Timestamp & Status Metadata */}
              <View style={styles.messageMeta}>
                <Typography variant="xs" color="#64748B" style={styles.messageTime}>
                  {formatMessageTime(item.createdAt)}
                </Typography>
                {isOwn && (
                  <Typography
                    variant="xs"
                    color={
                      item.isError || item.deliveryStatus === 'failed'
                        ? theme.colors.error
                        : item.deliveryStatus === 'pending' || item.deliveryStatus === 'sending' || item.isOptimistic
                          ? '#94A3B8'
                          : '#059669'
                    }
                    style={styles.statusIndicator}
                  >
                    {item.isError || item.deliveryStatus === 'failed'
                      ? '⚠️'
                      : item.deliveryStatus === 'sending'
                        ? '⏳'
                        : item.deliveryStatus === 'pending' || item.isOptimistic
                          ? '🕒'
                          : '✓'}
                  </Typography>
                )}
              </View>

              {/* Failed message retry CTA */}
              {isOwn && (item.isError || item.deliveryStatus === 'failed') && (
                <Pressable
                  onPress={() => item.tempId && retryMessage(item.tempId)}
                  style={styles.retryButton}
                  accessibilityRole="button"
                  accessibilityLabel="Retry sending message"
                >
                  <Typography variant="xs" color={theme.colors.error} weight="bold">
                    {language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
                  </Typography>
                </Pressable>
              )}
            </Pressable>

            {/* Reaction Badges */}
            <ReactionBadgeList
              reactions={item.reactions}
              isMyMessage={isOwn}
              onToggleReaction={(emoji) => toggleReaction(item.id, emoji)}
            />
          </View>
        </View>
      </View>
    );
  };

  const initial = group?.name ? group.name.charAt(0).toUpperCase() : 'G';

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: '#ECE5DD' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* WhatsApp-Style Top Header / Search Header */}
      {isSearchVisible ? (
        <View style={{ paddingTop: Math.max(insets.top + 6, 14), backgroundColor: theme.colors.surface }}>
          <ChatSearchBar
            visible={isSearchVisible}
            query={searchQuery}
            onChangeQuery={setSearchQuery}
            onClose={() => {
              setIsSearchVisible(false);
              setSearchQuery('');
              setSearchResults([]);
            }}
            resultCount={searchResults.length}
            currentIndex={currentMatchIndex}
            onNextResult={handleNextSearchMatch}
            onPrevResult={handlePrevSearchMatch}
            onOpenResultsList={() => setIsSearchResultsModalVisible(true)}
            isLoading={isSearching}
            placeholder={language === 'hi' ? 'संदेश खोजें...' : 'Search messages...'}
          />
        </View>
      ) : (
        <View
          style={[
            styles.headerBar,
            {
              paddingTop: Math.max(insets.top + 6, 14),
              backgroundColor: theme.colors.surface,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel={language === 'hi' ? 'पीछे जाएं' : 'Back'}
          >
            <Typography variant="lg" weight="bold" color={theme.colors.textPrimary}>
              ←
            </Typography>
          </Pressable>

          <Pressable
            onPress={() => router.push(`/(app)/group/${slug}` as any)}
            style={styles.headerGroupInfo}
          >
            {group?.coverUrl ? (
              <Image source={{ uri: group.coverUrl }} style={styles.groupHeaderAvatar} />
            ) : (
              <View style={[styles.groupHeaderAvatarFallback, { backgroundColor: theme.colors.primaryLight }]}>
                <Typography variant="sm" weight="bold" color={theme.colors.primaryDark}>
                  {initial}
                </Typography>
              </View>
            )}

            <View style={styles.headerTextContainer}>
              <Typography variant="md" weight="bold" color={theme.colors.textPrimary} numberOfLines={1}>
                {group?.name || (language === 'hi' ? 'समूह चैट' : 'Group Chat')}
              </Typography>

              <Typography variant="xs" color={typingUsers.length > 0 ? '#16A34A' : theme.colors.textMuted} numberOfLines={1}>
                {typingUsers.length > 0
                  ? `${typingUsers.join(', ')} ${language === 'hi' ? 'टाइप कर रहे हैं...' : 'typing...'}`
                  : group?.membersCount
                    ? `👥 ${group.membersCount} ${language === 'hi' ? 'सदस्य' : 'members'}`
                    : isConnected
                      ? (language === 'hi' ? 'सक्रिय' : 'Active')
                      : (language === 'hi' ? 'कनेक्ट हो रहा है...' : 'Connecting...')}
              </Typography>
            </View>
          </Pressable>

          {/* Header Action Buttons: Search and Media Gallery */}
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setIsSearchVisible(true)}
              style={styles.headerIconButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={language === 'hi' ? 'खोजें' : 'Search'}
            >
              <Ionicons name="search" size={20} color={theme.colors.textPrimary} />
            </Pressable>

            <Pressable
              onPress={() => setIsGalleryVisible(true)}
              style={styles.headerIconButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={language === 'hi' ? 'मीडिया गैलरी' : 'Media Gallery'}
            >
              <Ionicons name="images-outline" size={20} color={theme.colors.textPrimary} />
            </Pressable>
          </View>
        </View>
      )}

      {/* Offline Banner */}
      {(!isConnected || isOffline) && (
        <View style={styles.offlineBanner}>
          <Typography variant="xs" color="#92400E" weight="medium" align="center">
            {language === 'hi'
              ? '⚠️ आप ऑफ़लाइन हैं। संदेश कनेक्शन मिलने पर भेजे जाएंगे।'
              : '⚠️ You are offline. Messages will be sent when connected.'}
          </Typography>
        </View>
      )}

      {/* Main Body */}
      {loadingGroup ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Typography variant="sm" color={theme.colors.textMuted} style={styles.loadingText}>
            {language === 'hi' ? 'समूह विवरण लोड हो रहा है...' : 'Loading group details...'}
          </Typography>
        </View>
      ) : groupError ? (
        <View style={styles.centerContainer}>
          <Typography variant="md" weight="bold" color={theme.colors.error}>
            ⚠️ {groupError}
          </Typography>
          <Button
            title={language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
            onPress={loadGroup}
            variant="outline"
            size="sm"
            style={{ marginTop: 12 }}
          />
        </View>
      ) : isPrivate && !isMember ? (
        <View style={styles.centerContainer}>
          <Card style={styles.lockCard}>
            <Typography variant="xl" align="center">
              🔒
            </Typography>
            <Typography variant="md" weight="bold" color={theme.colors.textPrimary} align="center" style={{ marginTop: 8 }}>
              {language === 'hi' ? 'निजी समूह चैट' : 'Private Group Chat'}
            </Typography>
            <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={{ marginTop: 6 }}>
              {language === 'hi'
                ? 'यह एक निजी समूह है। केवल स्वीकृत सदस्य ही इसकी चैट देख और संदेश भेज सकते हैं।'
                : 'This is a private group. Only approved members can view messages and chat.'}
            </Typography>
          </Card>
        </View>
      ) : (
        <View style={styles.chatArea}>
          {/* Chat Messages List (Inverted for WhatsApp-like auto-scroll & pagination) */}
          {isLoadingHistory ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Typography variant="sm" color={theme.colors.textMuted} style={styles.loadingText}>
                {language === 'hi' ? 'संदेश लोड हो रहे हैं...' : 'Loading messages...'}
              </Typography>
            </View>
          ) : chatError ? (
            <View style={styles.centerContainer}>
              <Typography variant="sm" color={theme.colors.error} align="center">
                {chatError}
              </Typography>
              <Button
                title={language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
                onPress={loadInitialHistory}
                variant="outline"
                size="sm"
                style={{ marginTop: 10 }}
              />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.tempId || item.id}
              renderItem={renderMessageItem}
              inverted={true}
              contentContainerStyle={styles.listContent}
              onEndReached={loadOlderMessages}
              onEndReachedThreshold={0.2}
              onScrollToIndexFailed={(info) => {
                setTimeout(() => {
                  flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
                }, 100);
              }}
              ListFooterComponent={
                isLoadingOlder ? (
                  <View style={styles.loadingOlderIndicator}>
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Typography variant="sm" color="#64748B" align="center">
                    {language === 'hi'
                      ? '💬 इस समूह में अभी कोई संदेश नहीं है। पहला संदेश भेजकर बातचीत शुरू करें!'
                      : '💬 No messages yet. Say hello to start the conversation!'}
                  </Typography>
                </View>
              }
            />
          )}

          {/* Bottom Composer / Membership Gate */}
          <View
            style={[
              styles.composerBar,
              {
                paddingBottom: Math.max(insets.bottom, 12),
                backgroundColor: theme.colors.surface,
                borderTopColor: theme.colors.border,
              },
            ]}
          >
            {isMember ? (
              <View style={styles.composerWrapper}>
                {replyingToMessage && (
                  <ReplyComposerBar
                    replyingTo={replyingToMessage}
                    onCancel={() => setReplyingToMessage(null)}
                  />
                )}
                {selectedAttachment && (
                  <ChatAttachmentPreview
                    attachment={selectedAttachment}
                    onCancel={() => setSelectedAttachment(null)}
                    isUploading={isUploadingAttachment}
                  />
                )}
                <View style={styles.inputRow}>
                  <ChatAttachmentButton
                    onSelect={(att) => setSelectedAttachment(att)}
                    disabled={isSending || isUploadingAttachment}
                  />
                  <View style={[styles.inputPill, { backgroundColor: theme.colors.surfaceSubtle }]}>
                    <TextInput
                      style={styles.textInput}
                      placeholder={language === 'hi' ? 'संदेश लिखें...' : 'Type a message...'}
                      placeholderTextColor={theme.colors.textMuted}
                      value={inputText}
                      onChangeText={handleInputChange}
                      multiline
                      maxLength={2000}
                    />
                  </View>

                  {inputText.trim() || selectedAttachment ? (
                    <Pressable
                      onPress={handleSend}
                      disabled={isSending || isUploadingAttachment}
                      style={[
                        styles.sendButton,
                        {
                          backgroundColor:
                            !isSending && !isUploadingAttachment
                              ? '#10B981'
                              : '#CBD5E1',
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={language === 'hi' ? 'भेजें' : 'Send'}
                    >
                      {isSending || isUploadingAttachment ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Typography variant="md" color="#FFFFFF" weight="bold">
                          ➤
                        </Typography>
                      )}
                    </Pressable>
                  ) : (
                    <VoiceRecorder
                      onSend={handleSendVoiceNote}
                      disabled={isSending || isUploadingAttachment}
                    />
                  )}
                </View>
              </View>
            ) : (
              <View style={styles.joinPromptContainer}>
                <Typography variant="xs" color={theme.colors.textSecondary} align="center" style={{ marginBottom: 6 }}>
                  {language === 'hi'
                    ? 'बातचीत में शामिल होने के लिए समूह सदस्य बनना आवश्यक है।'
                    : 'Join the group to participate in this chat conversation.'}
                </Typography>
                <Button
                  title={language === 'hi' ? 'समूह से जुड़ें (Join Group)' : 'Join Group to Chat'}
                  onPress={handleJoin}
                  loading={isJoining}
                  variant="primary"
                  size="sm"
                />
              </View>
            )}
          </View>
        </View>
      )}

      {/* Emoji Reaction Selector Modal */}
      <EmojiReactionSelector
        visible={Boolean(reactionTargetMessage)}
        activeEmoji={reactionTargetMessage?.reactions?.find((r) => r.hasReacted)?.emoji}
        onSelectEmoji={(emoji) => {
          if (reactionTargetMessage) {
            toggleReaction(reactionTargetMessage.id, emoji);
          }
        }}
        onDismiss={() => setReactionTargetMessage(null)}
      />

      {/* Search Results List Modal */}
      <ChatSearchResultsModal
        visible={isSearchResultsModalVisible}
        onClose={() => setIsSearchResultsModalVisible(false)}
        results={searchResults}
        query={searchQuery}
        isLoading={isSearching}
        onSelectResult={(item) => {
          setIsSearchResultsModalVisible(false);
          handleScrollToTargetMessage(item.id);
        }}
      />

      {/* In-Chat Media Gallery Modal */}
      <ChatMediaGalleryModal
        visible={isGalleryVisible}
        onClose={() => setIsGalleryVisible(false)}
        title={group?.name || 'Group Media'}
        onFetchMedia={(type, cursor) =>
          chatApi.getGroupMediaGallery(group?.id || slug || '', { type, cursor, limit: 30 })
        }
        onNavigateToMessage={(msgId) => {
          setIsGalleryVisible(false);
          handleScrollToTargetMessage(msgId);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerBar: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 6,
  },
  headerIconButton: {
    padding: 6,
  },
  backButton: {
    padding: 8,
    marginRight: 4,
  },
  headerGroupInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupHeaderAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
  },
  groupHeaderAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTextContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 8,
  },
  lockCard: {
    padding: 20,
    width: '100%',
    alignItems: 'center',
  },
  chatArea: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  messageRowWrapper: {
    marginVertical: 3,
  },
  dateSeparatorContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  datePill: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 2,
    maxWidth: '82%',
  },
  bubbleRowOwn: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  bubbleRowOther: {
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
  },
  bubbleColumnOwn: {
    alignItems: 'flex-end',
    maxWidth: '100%',
  },
  bubbleColumnOther: {
    alignItems: 'flex-start',
    maxWidth: '100%',
  },
  senderAvatarContainer: {
    marginRight: 6,
    alignSelf: 'flex-end',
    marginBottom: 2,
  },
  senderAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  senderAvatarFallback: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1,
    elevation: 1,
  },
  bubbleOwn: {
    backgroundColor: '#E1FFC7', // Classic WhatsApp own-message tint
    borderBottomRightRadius: 2,
  },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 2,
  },
  bubbleError: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
    borderWidth: 1,
  },
  attachmentsWrapper: {
    marginBottom: 4,
  },
  composerWrapper: {
    width: '100%',
  },
  senderName: {
    marginBottom: 2,
  },
  messageContent: {
    lineHeight: 20,
  },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  messageTime: {
    fontSize: 10,
    marginRight: 4,
  },
  statusIndicator: {
    fontSize: 10,
  },
  loadingOlderIndicator: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  emptyContainer: {
    transform: [{ scaleY: -1 }], // Inverted list correction
    padding: 32,
    alignItems: 'center',
  },
  composerBar: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputPill: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    maxHeight: 100,
    marginRight: 8,
  },
  textInput: {
    fontSize: 15,
    color: '#0F172A',
    maxHeight: 90,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinPromptContainer: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  offlineBanner: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButton: {
    alignSelf: 'flex-end',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
  },
});

