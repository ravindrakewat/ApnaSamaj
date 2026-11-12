import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  GroupDetails,
  GroupPrivacy,
  ChatAttachmentInput,
  ChatSearchResultItem,
  DELETED_CHAT_MESSAGE_PLACEHOLDER,
} from '@apnasamaj/shared-types';
import {
  Typography,
  Card,
  Button,
  ProfileAvatar,
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
  ChatDateSeparator,
  ChatMessageStatus,
  ChatMessageActionSheet,
  ChatActionMessageInfo,
  YouTubeLinkPreview,
} from '../../../../src/components';
import { findFirstYouTubeLink } from '../../../../src/utils/youtube-link';
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
    deleteMessage,
  } = useGroupChat({
    groupId: group?.id || '',
    isMember,
    isPrivate,
  });

  const [reactionTargetMessage, setReactionTargetMessage] = useState<ExtendedChatMessage | null>(null);
  const [actionSheetMessage, setActionSheetMessage] = useState<ChatActionMessageInfo | null>(null);
  const [actionTargetGroupMessage, setActionTargetGroupMessage] = useState<ExtendedChatMessage | null>(null);
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
          file: attachmentToUpload.file,
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

    const isDeleted = Boolean(
      item.isDeletedForEveryone || item.content === DELETED_CHAT_MESSAGE_PLACEHOLDER
    );

    const youtubeLink = !isDeleted && item.content ? findFirstYouTubeLink(item.content) : null;

    const isSender = item.senderId === user?.id;
    const messageAgeMs = Date.now() - new Date(item.createdAt).getTime();
    const canDeleteForEveryone = isSender && messageAgeMs <= 60 * 60 * 1000;
    const isGroupAdmin = group?.myRole === 'ADMIN' || group?.createdById === user?.id;
    const canAdminDelete = !canDeleteForEveryone && isGroupAdmin;

    return (
      <View style={styles.messageRowWrapper}>
        {/* Date separator pill above the first message of each day */}
        {isDifferentDay && <ChatDateSeparator date={item.createdAt} />}

        {/* Message Bubble Container */}
        <View style={[styles.bubbleRow, isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther]}>
          {/* Avatar for other senders */}
          {!isOwn && (
            <View style={styles.senderAvatarContainer}>
              <ProfileAvatar
                uri={item.sender?.avatarUrl}
                name={item.sender?.fullName || 'M'}
                size="xs"
              />
            </View>
          )}

          {/* Bubble Card with Long Press Action Sheet */}
          <View style={isOwn ? styles.bubbleColumnOwn : styles.bubbleColumnOther}>
            <Pressable
              onLongPress={() => {
                setActionTargetGroupMessage(item);
                setActionSheetMessage({
                  id: item.id,
                  content: item.content,
                  senderName: item.sender?.fullName || (isOwn ? (language === 'hi' ? 'आप' : 'You') : 'Member'),
                  isOwn,
                  canDeleteForEveryone,
                  canAdminDelete,
                  isDeleted,
                });
              }}
              style={[
                styles.bubble,
                isOwn ? styles.bubbleOwn : styles.bubbleOther,
                item.isError && styles.bubbleError,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${item.sender?.fullName || (isOwn ? 'You' : 'Member')}: ${item.content || 'attachment'}`}
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

              {isDeleted ? (
                <View style={styles.deletedContainer}>
                  <Ionicons name="ban-outline" size={14} color="#94A3B8" style={{ marginRight: 6 }} />
                  <Typography variant="sm" color="#64748B" style={styles.deletedText}>
                    {language === 'hi' ? 'यह संदेश हटा दिया गया था' : 'This message was deleted'}
                  </Typography>
                </View>
              ) : (
                <>
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

                  {/* YouTube Link Preview Card */}
                  {youtubeLink && (
                    <YouTubeLinkPreview
                      youtubeLink={youtubeLink}
                      isOwn={isOwn}
                    />
                  )}

                  {/* Message Body (only rendered if non-empty content exists) */}
                  {item.content && item.content.trim().length > 0 ? (
                    <Typography variant="sm" color={theme.colors.textPrimary} style={styles.messageContent}>
                      {item.content}
                    </Typography>
                  ) : null}
                </>
              )}

              {/* Timestamp & Status Metadata */}
              <View style={styles.messageMeta}>
                <Typography variant="xs" color="#64748B" style={styles.messageTime}>
                  {formatMessageTime(item.createdAt)}
                </Typography>
                {isOwn && (
                  <ChatMessageStatus
                    status={item.deliveryStatus}
                    isError={Boolean(item.isError)}
                    isOptimistic={Boolean(item.isOptimistic)}
                  />
                )}
              </View>
            </Pressable>

            {/* Reaction Badges */}
            {!isDeleted && (
              <ReactionBadgeList
                reactions={item.reactions}
                isMyMessage={isOwn}
                onToggleReaction={(emoji) => toggleReaction(item.id, emoji)}
              />
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
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: '#ECE5DD' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Top Header / Search Header */}
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
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={language === 'hi' ? 'पीछे जाएं' : 'Back'}
          >
            <Typography variant="lg" weight="bold" color={theme.colors.primary}>
              ←
            </Typography>
          </Pressable>

          <Pressable
            onPress={() => router.push(`/(app)/group/${slug}` as any)}
            style={styles.headerGroupInfo}
          >
            <ProfileAvatar
              uri={group?.coverUrl}
              name={group?.name || 'G'}
              size="sm"
            />

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
                              ? theme.colors.primary
                              : theme.colors.border,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={language === 'hi' ? 'भेजें' : 'Send'}
                    >
                      {isSending || isUploadingAttachment ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Typography variant="sm" color="#FFFFFF" weight="bold">
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
              <View style={styles.nonMemberBar}>
                <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={{ marginBottom: 10 }}>
                  {language === 'hi'
                    ? 'संदेश भेजने के लिए समूह में शामिल हों।'
                    : 'Join this group to participate in the conversation.'}
                </Typography>
                <Button
                  title={language === 'hi' ? 'समूह में शामिल हों' : 'Join Group'}
                  onPress={handleJoin}
                  loading={isJoining}
                  variant="primary"
                />
              </View>
            )}
          </View>
        </View>
      )}

      {/* Modern Group Chat Message Action Sheet */}
      <ChatMessageActionSheet
        visible={Boolean(actionSheetMessage)}
        onClose={() => {
          setActionSheetMessage(null);
          setActionTargetGroupMessage(null);
        }}
        message={actionSheetMessage}
        onReact={() => {
          if (actionTargetGroupMessage) {
            setReactionTargetMessage(actionTargetGroupMessage);
          }
        }}
        onReply={() => {
          if (actionTargetGroupMessage) {
            setReplyingToMessage(actionTargetGroupMessage);
          }
        }}
        onDeleteForMe={() => {
          if (!actionTargetGroupMessage) return;
          Alert.alert(
            language === 'hi' ? 'संदेश हटाएं?' : 'Delete message?',
            language === 'hi'
              ? 'यह संदेश केवल आपके लिए हटा दिया जाएगा।'
              : 'This message will be deleted for you only.',
            [
              { text: language === 'hi' ? 'रद्द करें' : 'Cancel', style: 'cancel' },
              {
                text: language === 'hi' ? 'हटाएं' : 'Delete',
                style: 'destructive',
                onPress: () => deleteMessage(actionTargetGroupMessage.id, 'ME'),
              },
            ]
          );
        }}
        onDeleteForEveryone={() => {
          if (!actionTargetGroupMessage) return;
          Alert.alert(
            language === 'hi' ? 'सभी के लिए हटाएं?' : 'Delete for Everyone?',
            language === 'hi'
              ? 'यह संदेश सभी समूह सदस्यों के लिए हटा दिया जाएगा।'
              : 'This message will be deleted for all group members.',
            [
              { text: language === 'hi' ? 'रद्द करें' : 'Cancel', style: 'cancel' },
              {
                text: language === 'hi' ? 'सभी के लिए हटाएं' : 'Delete for Everyone',
                style: 'destructive',
                onPress: () => deleteMessage(actionTargetGroupMessage.id, 'EVERYONE'),
              },
            ]
          );
        }}
        onAdminDelete={() => {
          if (!actionTargetGroupMessage) return;
          Alert.alert(
            language === 'hi' ? 'व्यवस्थापक द्वारा हटाएं?' : 'Admin Delete (Moderation)?',
            language === 'hi'
              ? 'समूह व्यवस्थापक के रूप में यह संदेश सभी के लिए हटा दिया जाएगा।'
              : 'As a group admin, this message will be deleted for all group members.',
            [
              { text: language === 'hi' ? 'रद्द करें' : 'Cancel', style: 'cancel' },
              {
                text: language === 'hi' ? 'व्यवस्थापक द्वारा हटाएं' : 'Admin Delete',
                style: 'destructive',
                onPress: () => deleteMessage(actionTargetGroupMessage.id, 'EVERYONE'),
              },
            ]
          );
        }}
      />

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
        title={group?.name || 'Group'}
        onFetchMedia={(type, cursor) =>
          chatApi.getGroupMediaGallery(group?.id || '', { type, cursor, limit: 30 })
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  backButton: {
    padding: 6,
  },
  headerGroupInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 4,
  },
  headerIconButton: {
    padding: 6,
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 10,
  },
  lockCard: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    maxWidth: 320,
  },
  chatArea: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  messageRowWrapper: {
    marginVertical: 3,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  bubbleRowOwn: {
    justifyContent: 'flex-end',
  },
  bubbleRowOther: {
    justifyContent: 'flex-start',
  },
  senderAvatarContainer: {
    marginBottom: 4,
  },
  bubbleColumnOwn: {
    alignItems: 'flex-end',
    maxWidth: '82%',
  },
  bubbleColumnOther: {
    alignItems: 'flex-start',
    maxWidth: '82%',
  },
  bubble: {
    maxWidth: '84%',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderRadius: 16,
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1.5,
  },
  bubbleOwn: {
    backgroundColor: '#E0F2FE', // Unified primary soft blue tint
    borderBottomRightRadius: 2,
  },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 2,
  },
  bubbleError: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  senderName: {
    marginBottom: 2,
  },
  attachmentsWrapper: {
    marginBottom: 4,
  },
  messageContent: {
    lineHeight: 20,
  },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 2,
  },
  messageTime: {
    fontSize: 10,
  },
  retryButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingOlderIndicator: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  composerBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  composerWrapper: {
    gap: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputPill: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  textInput: {
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nonMemberBar: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  deletedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  deletedText: {
    fontStyle: 'italic',
    color: '#64748B',
  },
});
