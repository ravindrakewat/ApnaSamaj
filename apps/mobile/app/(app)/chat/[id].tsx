import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { useDirectChat, ExtendedDirectMessage } from '../../../src/hooks/useDirectChat';
import { chatApi } from '../../../src/api/chat.api';

export default function PersonalChatScreen() {
  const { id: conversationId, name: queryName, avatar: queryAvatar } =
    useLocalSearchParams<{ id: string; name?: string; avatar?: string }>();

  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language } = useLocalization();
  const { user } = useAuth();

  const [inputText, setInputText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [selectedAttachment, setSelectedAttachment] = useState<SelectedChatAttachment | null>(null);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState<boolean>(false);
  const [resolvedParticipant, setResolvedParticipant] = useState<{
    fullName: string;
    avatarUrl: string | null;
  } | null>(queryName ? { fullName: queryName, avatarUrl: queryAvatar || null } : null);

  const {
    messages,
    isLoadingHistory,
    isLoadingOlder,
    hasMore,
    error: chatError,
    isConnected,
    isOffline,
    isOtherUserTyping,
    otherUserTypingName,
    otherUserLastReadAt,
    loadInitialHistory,
    loadOlderMessages,
    sendMessage,
    retryMessage,
    sendTypingStatus,
  } = useDirectChat({
    conversationId: conversationId || '',
  });

  // Resolve other participant details from inbox if not supplied in query
  useEffect(() => {
    if (!resolvedParticipant && conversationId) {
      chatApi
        .getDirectInbox({ limit: 50 })
        .then((inbox) => {
          const conv = inbox.conversations.find((c) => c.id === conversationId);
          if (conv?.otherUser) {
            setResolvedParticipant({
              fullName: conv.otherUser.fullName,
              avatarUrl: conv.otherUser.avatarUrl,
            });
          }
        })
        .catch(() => { });
    }
  }, [conversationId, resolvedParticipant]);

  // If participant details are still not found, fallback to sender info from messages
  const displayParticipant = useMemo(() => {
    if (resolvedParticipant?.fullName) return resolvedParticipant;
    const otherMsg = messages.find((m) => m.senderId !== user?.id && m.sender?.fullName);
    if (otherMsg?.sender) {
      return {
        fullName: otherMsg.sender.fullName,
        avatarUrl: otherMsg.sender.avatarUrl,
      };
    }
    return {
      fullName: language === 'hi' ? 'समुदाय सदस्य' : 'Community Member',
      avatarUrl: null,
    };
  }, [resolvedParticipant, messages, user?.id, language]);

  const handleTextChange = (text: string) => {
    setInputText(text);
    sendTypingStatus(text.trim().length > 0);
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
      if (attachmentToUpload && conversationId) {
        setIsUploadingAttachment(true);
        uploadedAttachmentData = await chatApi.uploadDirectAttachment(conversationId, {
          uri: attachmentToUpload.uri,
          name: attachmentToUpload.name,
          type: attachmentToUpload.type,
        });
      }

      await sendMessage(textToSend, uploadedAttachmentData);
    } catch (err: unknown) {
      console.warn('[PersonalChatScreen] Failed to send message:', err);
      Alert.alert(
        language === 'hi' ? 'त्रुटि' : 'Error',
        language === 'hi' ? 'संदेश भेजने में त्रुटि हुई।' : 'Failed to send message.'
      );
    } finally {
      setIsSending(false);
      setIsUploadingAttachment(false);
    }
  };

  const formatMessageTime = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return d.toLocaleTimeString(language === 'hi' ? 'hi-IN' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const formatDateHeader = (dateString: string) => {
    try {
      const d = new Date(dateString);
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

  const renderMessageItem = ({ item, index }: { item: ExtendedDirectMessage; index: number }) => {
    const isOwn = item.senderId === user?.id;

    // In an inverted list, index + 1 is the chronologically earlier message
    const prevItem = index + 1 < messages.length ? messages[index + 1] : null;
    const isDifferentDay =
      !prevItem ||
      new Date(item.createdAt).toDateString() !== new Date(prevItem.createdAt).toDateString();

    // Blue-tick calculation: message is read if other participant has read after message timestamp
    const isReadByRecipient =
      isOwn &&
      !item.isOptimistic &&
      !item.isError &&
      otherUserLastReadAt &&
      new Date(item.createdAt).getTime() <= new Date(otherUserLastReadAt).getTime();

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
          <View
            style={[
              styles.bubble,
              isOwn ? styles.bubbleOwn : styles.bubbleOther,
              item.isError && styles.bubbleError,
            ]}
          >
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
                  weight={isReadByRecipient ? 'bold' : 'regular'}
                  color={
                    item.isError || item.deliveryStatus === 'failed'
                      ? theme.colors.error
                      : isReadByRecipient
                        ? '#0284C7' // WhatsApp blue ticks
                        : item.isOptimistic || item.deliveryStatus === 'pending' || item.deliveryStatus === 'sending'
                          ? '#94A3B8'
                          : '#64748B'
                  }
                  style={styles.statusIndicator}
                >
                  {item.isError || item.deliveryStatus === 'failed'
                    ? '⚠️'
                    : item.deliveryStatus === 'sending'
                    ? '⏳'
                    : item.deliveryStatus === 'pending' || item.isOptimistic
                    ? '🕒'
                    : isReadByRecipient
                    ? '✓✓'
                    : '✓'}
                </Typography>
              )}
            </View>
          </View>

          {/* Failed message retry CTA */}
          {(item.isError || item.deliveryStatus === 'failed') && (
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

  const initial = displayParticipant.fullName.trim().charAt(0).toUpperCase() || 'M';

  return (
    <View style={[styles.container, { backgroundColor: '#ECE5DD' }]}>
      {/* Top Header */}
      <View
        style={[
          styles.headerBar,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
            paddingTop: Math.max(insets.top, 10),
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={language === 'hi' ? 'वापस जाएं' : 'Back'}
        >
          <Typography variant="lg" weight="bold" color={theme.colors.primary}>
            ←
          </Typography>
        </Pressable>

        {/* Participant Avatar */}
        <View style={styles.headerAvatarContainer}>
          {displayParticipant.avatarUrl ? (
            <Image source={{ uri: displayParticipant.avatarUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatarFallback, { backgroundColor: theme.colors.primaryLight }]}>
              <Typography variant="xs" weight="bold" color={theme.colors.primaryDark}>
                {initial}
              </Typography>
            </View>
          )}
        </View>

        {/* Title & Typing Subtitle */}
        <View style={styles.headerTitleContainer}>
          <Typography variant="sm" weight="bold" color={theme.colors.textPrimary} numberOfLines={1}>
            {displayParticipant.fullName}
          </Typography>

          {isOtherUserTyping ? (
            <Typography variant="xs" color="#16A34A" weight="semibold">
              {language === 'hi' ? 'टाइप कर रहे हैं...' : 'typing...'}
            </Typography>
          ) : (
            <Typography variant="xs" color={theme.colors.textMuted}>
              {language === 'hi' ? 'निजी चैट' : 'Direct Chat'}
            </Typography>
          )}
        </View>

        {/* Connection status indicator */}
        <View
          style={[
            styles.connectionDot,
            { backgroundColor: isConnected && !isOffline ? '#10B981' : '#F59E0B' },
          ]}
        />
      </View>

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

      {/* Main Messages Area */}
      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {isLoadingHistory ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Typography variant="xs" color={theme.colors.textSecondary} style={styles.loadingText}>
              {language === 'hi' ? 'संदेश लोड हो रहे हैं...' : 'Loading messages...'}
            </Typography>
          </View>
        ) : chatError ? (
          <View style={styles.centerContainer}>
            <Typography variant="sm" color={theme.colors.error} align="center" style={styles.errorText}>
              {chatError}
            </Typography>
            <Button
              title={language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
              variant="outline"
              size="sm"
              onPress={loadInitialHistory}
            />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Typography variant="md" style={styles.emptyIcon}>
              👋
            </Typography>
            <Typography variant="sm" weight="bold" color={theme.colors.textPrimary} align="center">
              {language === 'hi' ? 'बातचीत शुरू करें' : 'Start the conversation'}
            </Typography>
            <Typography
              variant="xs"
              color={theme.colors.textMuted}
              align="center"
              style={styles.emptySubtitle}
            >
              {language === 'hi'
                ? 'यह बातचीत पूर्णतः निजी व सुरक्षित है।'
                : 'This conversation is private and tenant isolated.'}
            </Typography>
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.tempId || item.id}
            renderItem={renderMessageItem}
            inverted
            onEndReached={loadOlderMessages}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              isLoadingOlder ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                </View>
              ) : null
            }
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Typing Bar Footer */}
        {isOtherUserTyping && (
          <View style={[styles.typingBar, { backgroundColor: theme.colors.surfaceSubtle }]}>
            <Typography variant="xs" color="#16A34A" style={styles.typingText}>
              ✍️ {otherUserTypingName || displayParticipant.fullName}{' '}
              {language === 'hi' ? 'लिख रहे हैं...' : 'is typing...'}
            </Typography>
          </View>
        )}

        {/* Attachment preview if selected */}
        {selectedAttachment && (
          <ChatAttachmentPreview
            attachment={selectedAttachment}
            onCancel={() => setSelectedAttachment(null)}
            isUploading={isUploadingAttachment}
          />
        )}

        {/* Message Input Composer */}
        <View
          style={[
            styles.composerContainer,
            {
              backgroundColor: theme.colors.surface,
              borderTopColor: theme.colors.border,
              paddingBottom: Math.max(insets.bottom, 10),
            },
          ]}
        >
          <ChatAttachmentButton
            onSelect={(att) => setSelectedAttachment(att)}
            disabled={isSending || isUploadingAttachment}
          />

          <TextInput
            style={[
              styles.inputField,
              {
                backgroundColor: theme.colors.surfaceSubtle,
                color: theme.colors.textPrimary,
                borderColor: theme.colors.border,
              },
            ]}
            placeholder={language === 'hi' ? 'संदेश लिखें...' : 'Type a message...'}
            placeholderTextColor={theme.colors.textMuted}
            value={inputText}
            onChangeText={handleTextChange}
            multiline
            maxLength={2000}
          />

          <Pressable
            onPress={handleSend}
            disabled={(!inputText.trim() && !selectedAttachment) || isSending || isUploadingAttachment}
            style={[
              styles.sendButton,
              {
                backgroundColor:
                  (inputText.trim() || selectedAttachment) && !isSending && !isUploadingAttachment
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
              <Typography variant="sm" weight="bold" color="#FFFFFF">
                ➤
              </Typography>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
  headerAvatarContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
  },
  headerAvatar: {
    width: '100%',
    height: '100%',
  },
  headerAvatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
  chatArea: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 8,
  },
  errorText: {
    marginBottom: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptySubtitle: {
    marginTop: 4,
    lineHeight: 18,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    alignItems: 'flex-end',
    gap: 6,
  },
  bubbleRowOwn: {
    justifyContent: 'flex-end',
  },
  bubbleRowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderRadius: 14,
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1,
  },
  bubbleOwn: {
    backgroundColor: '#E7F5EF', // WhatsApp green tint
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
    gap: 4,
  },
  messageTime: {
    fontSize: 10,
  },
  statusIndicator: {
    fontSize: 11,
  },
  retryButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  footerLoader: {
    paddingVertical: 12,
  },
  typingBar: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  typingText: {
    fontStyle: 'italic',
  },
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  inputField: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
