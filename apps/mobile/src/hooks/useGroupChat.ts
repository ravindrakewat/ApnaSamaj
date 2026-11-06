import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  ChatMessageItem,
  NewChatMessageEvent,
  UserTypingEvent,
  ChatAttachmentInput,
  MessageDeliveryStatus,
  ChatReactionEventPayload,
  ChatReactionSummary,
} from '@apnasamaj/shared-types';
import { chatApi } from '../api/chat.api';
import { connectChatSocket, getChatSocket } from '../services/socket.service';
import { chatPersistenceService, outboxQueueService } from '../services';
import { useAuth } from './useAuth';

export interface ExtendedChatMessage extends ChatMessageItem {
  isOptimistic?: boolean;
  isError?: boolean;
  errorMessage?: string;
  tempId?: string;
  deliveryStatus?: MessageDeliveryStatus;
}

export interface UseGroupChatOptions {
  groupId: string;
  isMember: boolean;
  isPrivate: boolean;
}

export function useGroupChat({ groupId, isMember, isPrivate }: UseGroupChatOptions) {
  const { user, communitySlug } = useAuth();

  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [replyingToMessage, setReplyingToMessage] = useState<ExtendedChatMessage | null>(null);

  const isTypingActiveRef = useRef<boolean>(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPrivateAndNonMember = isPrivate && !isMember;

  /**
   * Hydrate initial messages from L1/L2 local cache & subscribe to Outbox updates
   */
  useEffect(() => {
    if (!groupId || !communitySlug || isPrivateAndNonMember) return;

    if (user?.id) {
      outboxQueueService.initialize(communitySlug, user.id);
    }

    chatPersistenceService
      .getConversationMessages(groupId, communitySlug, user?.id || '')
      .then((cached) => {
        if (cached && cached.length > 0) {
          setMessages((prev) => {
            if (prev.length > 0) return prev;
            return cached.map((c) => ({
              id: c.serverMessageId || c.tempId || c.localId,
              groupId: c.conversationId,
              senderId: c.senderId,
              content: c.content,
              createdAt: c.createdAt,
              updatedAt: c.updatedAt,
              deliveryStatus: c.deliveryStatus,
              isOptimistic: c.deliveryStatus === 'pending' || c.deliveryStatus === 'sending',
              isError: c.deliveryStatus === 'failed',
              errorMessage: c.lastError || undefined,
              tempId: c.tempId,
              replyToMessageId: c.replyToMessageId || null,
              replyTo: c.replyTo || null,
              reactions: c.reactions || [],
              sender: {
                id: c.senderId,
                fullName: c.senderId === user?.id ? user.fullName || 'You' : 'Community Member',
                avatarUrl: null,
              },
              attachments: c.attachment
                ? [
                    {
                      id: c.attachment.id || `att-${c.tempId}`,
                      chatMessageId: c.serverMessageId || c.tempId,
                      type: c.attachment.type,
                      fileName: c.attachment.fileName,
                      mimeType: c.attachment.mimeType,
                      fileSizeBytes: c.attachment.fileSizeBytes,
                      storagePath: c.attachment.storagePath,
                      duration: c.attachment.duration,
                      localUri: c.attachment.localUri,
                      createdAt: c.createdAt,
                    },
                  ]
                : [],
            }));
          });
        }
      })
      .catch(console.warn);

    const unsubOutbox = outboxQueueService.subscribe((event) => {
      if (event.conversationId !== groupId) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (m.tempId === event.tempId) {
            return {
              ...m,
              id: event.serverMessageId || m.id,
              deliveryStatus: event.status,
              isOptimistic: event.status === 'pending' || event.status === 'sending',
              isError: event.status === 'failed',
              errorMessage: event.error || undefined,
            };
          }
          return m;
        })
      );
    });

    return () => {
      unsubOutbox();
    };
  }, [groupId, communitySlug, user?.id, isPrivateAndNonMember]);

  /**
   * Load initial message history with offline resilience
   */
  const loadInitialHistory = useCallback(async () => {
    if (!groupId || isPrivateAndNonMember) {
      setIsLoadingHistory(false);
      return;
    }

    setIsLoadingHistory(true);
    setError(null);

    try {
      const data = await chatApi.getGroupMessages(groupId, { limit: 30 });
      setIsOffline(false);
      outboxQueueService.setOnlineStatus(true);

      // Persist server messages in local cache
      if (communitySlug && user?.id) {
        chatPersistenceService.saveReceivedMessages(
          groupId,
          'GROUP',
          data.messages,
          communitySlug,
          user.id
        );
      }

      setMessages((prev) => {
        // Keep pending/failed messages in front
        const pending = prev.filter(
          (m) => m.deliveryStatus === 'pending' || m.deliveryStatus === 'sending' || m.isError
        );
        const serverIds = new Set(data.messages.map((m) => m.id));
        const filteredPending = pending.filter(
          (p) => !serverIds.has(p.id) && (!p.tempId || !data.messages.some((m) => m.tempId === p.tempId))
        );

        const mappedServer: ExtendedChatMessage[] = data.messages.map((m) => ({
          ...m,
          deliveryStatus: 'sent',
          isOptimistic: false,
          isError: false,
        }));

        return [...filteredPending, ...mappedServer];
      });

      setNextCursor(data.nextCursor || null);
      setHasMore(data.hasMore);
    } catch (err: unknown) {
      setIsOffline(true);
      outboxQueueService.setOnlineStatus(false);
      const msg = err instanceof Error ? err.message : 'चैट संदेश लोड करने में विफल।';
      setError(msg);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [groupId, isPrivateAndNonMember, communitySlug, user?.id]);

  /**
   * Load older messages via cursor pagination
   */
  const loadOlderMessages = useCallback(async () => {
    if (!nextCursor || isLoadingOlder || !hasMore || !groupId) return;

    setIsLoadingOlder(true);
    try {
      const data = await chatApi.getGroupMessages(groupId, {
        before: nextCursor,
        limit: 30,
      });

      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const older = data.messages.filter((m) => !existingIds.has(m.id));
        return [...prev, ...older];
      });

      setNextCursor(data.nextCursor || null);
      setHasMore(data.hasMore);
    } catch (err: unknown) {
      console.warn('[useGroupChat] Failed to load older messages:', err);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [groupId, nextCursor, isLoadingOlder, hasMore]);

  /**
   * Join group room on socket
   */
  const joinGroupRoom = useCallback(() => {
    if (!groupId || isPrivateAndNonMember) return;
    const socket = getChatSocket();
    if (socket && socket.connected) {
      socket.emit('join_group', { groupId }, (res: { success: boolean; error?: string }) => {
        if (!res?.success) {
          console.warn('[useGroupChat] Failed to join group room:', res?.error);
        }
      });
    }
  }, [groupId, isPrivateAndNonMember]);

  /**
   * Socket Lifecycle & Event Management
   */
  useEffect(() => {
    if (isPrivateAndNonMember) return;

    loadInitialHistory();

    const socket = connectChatSocket();

    const handleConnect = () => {
      setIsConnected(true);
      setIsOffline(false);
      outboxQueueService.setOnlineStatus(true);
      joinGroupRoom();
      outboxQueueService.processQueue();
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setIsOffline(true);
      outboxQueueService.setOnlineStatus(false);
    };

    const handleNewMessage = (payload: NewChatMessageEvent) => {
      if (!payload?.message || payload.message.groupId !== groupId) return;

      if (communitySlug && user?.id) {
        chatPersistenceService.saveReceivedMessages(
          groupId,
          'GROUP',
          [payload.message],
          communitySlug,
          user.id
        );
      }

      setMessages((prev) => {
        // If message was sent optimistically by this client, replace it
        if (payload.tempId) {
          const index = prev.findIndex((m) => m.tempId === payload.tempId);
          if (index !== -1) {
            const updated = [...prev];
            updated[index] = {
              ...payload.message,
              deliveryStatus: 'sent',
              isOptimistic: false,
              isError: false,
            };
            return updated;
          }
        }

        // Prevent duplicate rendering
        if (prev.some((m) => m.id === payload.message.id)) {
          return prev;
        }

        // Add to beginning of descending list (newest first)
        return [
          {
            ...payload.message,
            deliveryStatus: 'sent',
            isOptimistic: false,
          },
          ...prev,
        ];
      });
    };

    const handleUserTyping = (payload: UserTypingEvent) => {
      if (payload.groupId !== groupId || payload.userId === user?.id) return;

      setTypingUsers((prev) => {
        if (payload.isTyping) {
          return prev.includes(payload.userName) ? prev : [...prev, payload.userName];
        } else {
          return prev.filter((name) => name !== payload.userName);
        }
      });
    };

    const handleReaction = (payload: ChatReactionEventPayload) => {
      if (!payload || payload.conversationId !== groupId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId || m.tempId === payload.messageId
            ? { ...m, reactions: payload.reactions }
            : m
        )
      );
      chatPersistenceService.updateMessageReactions(payload.messageId, payload.reactions);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('new_message', handleNewMessage);
    socket.on('user_typing', handleUserTyping);
    socket.on('chat:reaction', handleReaction);

    if (socket.connected) {
      handleConnect();
    }

    // AppState lifecycle listener (reconnect socket on foreground)
    const handleAppStateChange = (nextStatus: AppStateStatus) => {
      if (nextStatus === 'active') {
        const s = connectChatSocket();
        if (s.connected) {
          joinGroupRoom();
        }
        outboxQueueService.processQueue();
      }
    };

    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      if (socket) {
        socket.emit('leave_group', { groupId });
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        socket.off('new_message', handleNewMessage);
        socket.off('user_typing', handleUserTyping);
        socket.off('chat:reaction', handleReaction);
      }
      appStateSub.remove();

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [groupId, isPrivateAndNonMember, loadInitialHistory, joinGroupRoom, user?.id, communitySlug]);

  /**
   * Handle text typing broadcast
   */
  const reportTyping = useCallback(
    (text: string) => {
      const socket = getChatSocket();
      if (!socket || !socket.connected || !groupId || isPrivateAndNonMember) return;

      if (text.trim().length > 0) {
        if (!isTypingActiveRef.current) {
          isTypingActiveRef.current = true;
          socket.emit('typing_start', { groupId });
        }

        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
          isTypingActiveRef.current = false;
          socket.emit('typing_stop', { groupId });
        }, 2500);
      } else if (isTypingActiveRef.current) {
        isTypingActiveRef.current = false;
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        socket.emit('typing_stop', { groupId });
      }
    },
    [groupId, isPrivateAndNonMember]
  );

  /**
   * Send a chat message with outbox queue persistence, optimistic updates & socket/HTTP fallback
   */
  const sendMessage = useCallback(
    async (content?: string, attachment?: ChatAttachmentInput): Promise<boolean> => {
      const trimmed = content ? content.trim() : '';
      if ((!trimmed && !attachment) || !groupId) return false;

      if (!isMember) {
        throw new Error('You must be a member of this group to send messages.');
      }

      if (trimmed.length > 2000) {
        throw new Error('Message cannot exceed 2000 characters.');
      }

      // Clear typing indicator immediately
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (isTypingActiveRef.current) {
        isTypingActiveRef.current = false;
        getChatSocket()?.emit('typing_stop', { groupId });
      }

      const replyToMessageId = replyingToMessage?.id;
      const replyToPreview = replyingToMessage
        ? {
            id: replyingToMessage.id,
            senderId: replyingToMessage.senderId,
            senderName:
              replyingToMessage.sender?.fullName ||
              ('sender' in replyingToMessage && (replyingToMessage as any).sender?.profile?.fullName) ||
              'Member',
            content: replyingToMessage.content,
            attachmentType: replyingToMessage.attachments?.[0]?.type || null,
            attachmentName: replyingToMessage.attachments?.[0]?.fileName || null,
          }
        : null;

      // Clear replying state immediately upon send
      if (replyingToMessage) {
        setReplyingToMessage(null);
      }

      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const nowIso = new Date().toISOString();
      const optimisticMsg: ExtendedChatMessage = {
        id: tempId,
        groupId,
        senderId: user?.id || '',
        content: trimmed,
        createdAt: nowIso,
        updatedAt: nowIso,
        deliveryStatus: isConnected ? 'sending' : 'pending',
        replyToMessageId: replyToMessageId || null,
        replyTo: replyToPreview,
        reactions: [],
        sender: {
          id: user?.id || '',
          fullName: user?.fullName || 'You',
          avatarUrl: null,
        },
        attachments: attachment
          ? [
              {
                id: attachment.id || `temp-att-${Date.now()}`,
                chatMessageId: tempId,
                type: attachment.type,
                fileName: attachment.fileName,
                mimeType: attachment.mimeType,
                fileSizeBytes: attachment.fileSizeBytes,
                storagePath: attachment.storagePath,
                duration: attachment.duration,
                localUri: (attachment as any).localUri,
                createdAt: nowIso,
              },
            ]
          : [],
        isOptimistic: true,
        tempId,
      };

      // 1. Insert at beginning of newest-first list
      setMessages((prev) => [optimisticMsg, ...prev]);

      // 2. Queue in outbox persistence
      if (communitySlug && user?.id) {
        await outboxQueueService.enqueue({
          tempId,
          conversationId: groupId,
          conversationType: 'GROUP',
          content: trimmed,
          attachment: attachment || null,
          replyToMessageId: replyToMessageId || undefined,
          replyTo: replyToPreview,
          tenantSlug: communitySlug,
          userId: user.id,
        });
      }

      const socket = getChatSocket();

      // 3. Try sending via Socket.IO if connected
      if (socket && socket.connected) {
        socket.emit(
          'send_message',
          { groupId, content: trimmed, attachment, tempId, replyToMessageId },
          async (res: { success: boolean; message?: ChatMessageItem; error?: string }) => {
            if (res?.success && res.message) {
              const saved = res.message;
              if (communitySlug && user?.id) {
                await chatPersistenceService.updateMessageDeliveryStatus(tempId, 'sent', {
                  serverMessageId: saved.id,
                  tenantSlug: communitySlug,
                  userId: user.id,
                });
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.tempId === tempId
                    ? { ...saved, deliveryStatus: 'sent', isOptimistic: false, isError: false }
                    : m
                )
              );
            }
          }
        );
      }

      return true;
    },
    [groupId, isMember, user, communitySlug, isConnected, replyingToMessage]
  );

  /**
   * Toggles an emoji reaction on a message with optimistic state update
   */
  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!messageId || !emoji || !user) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId && m.tempId !== messageId) return m;

          const currentReactions = [...(m.reactions || [])];
          const existingIdx = currentReactions.findIndex((r) => r.hasReacted);
          let updatedReactions: ChatReactionSummary[];

          if (existingIdx >= 0) {
            const current = currentReactions[existingIdx];
            if (current.emoji === emoji) {
              // Tapped same emoji -> toggle off
              if (current.count <= 1) {
                updatedReactions = currentReactions.filter((_, i) => i !== existingIdx);
              } else {
                updatedReactions = currentReactions.map((r, i) =>
                  i === existingIdx ? { ...r, count: r.count - 1, hasReacted: false } : r
                );
              }
            } else {
              // Different emoji -> update
              updatedReactions = currentReactions
                .map((r, i) => (i === existingIdx ? { ...r, count: r.count - 1, hasReacted: false } : r))
                .filter((r) => r.count > 0);
              const targetIdx = updatedReactions.findIndex((r) => r.emoji === emoji);
              if (targetIdx >= 0) {
                updatedReactions[targetIdx] = {
                  ...updatedReactions[targetIdx],
                  count: updatedReactions[targetIdx].count + 1,
                  hasReacted: true,
                };
              } else {
                updatedReactions.push({
                  emoji,
                  count: 1,
                  hasReacted: true,
                  users: [{ id: user.id, fullName: user.fullName || 'You' }],
                });
              }
            }
          } else {
            // Add new reaction
            const targetIdx = currentReactions.findIndex((r) => r.emoji === emoji);
            if (targetIdx >= 0) {
              updatedReactions = currentReactions.map((r, i) =>
                i === targetIdx ? { ...r, count: r.count + 1, hasReacted: true } : r
              );
            } else {
              updatedReactions = [
                ...currentReactions,
                {
                  emoji,
                  count: 1,
                  hasReacted: true,
                  users: [{ id: user.id, fullName: user.fullName || 'You' }],
                },
              ];
            }
          }

          return { ...m, reactions: updatedReactions };
        })
      );

      const socket = getChatSocket();
      if (socket && socket.connected) {
        socket.emit(
          'chat:react',
          { groupId, messageId, emoji },
          (res: { success: boolean; data?: { reactions: ChatReactionSummary[] } }) => {
            if (res?.success && res.data) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === messageId || m.tempId === messageId
                    ? { ...m, reactions: res.data!.reactions }
                    : m
                )
              );
              chatPersistenceService.updateMessageReactions(messageId, res.data.reactions);
            }
          }
        );
      } else {
        try {
          const res = await chatApi.toggleGroupReaction(groupId, messageId, emoji);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId || m.tempId === messageId
                ? { ...m, reactions: res.reactions }
                : m
            )
          );
          chatPersistenceService.updateMessageReactions(messageId, res.reactions);
        } catch (err) {
          console.warn('[useGroupChat] Failed to toggle group reaction:', err);
        }
      }
    },
    [groupId, user]
  );

  /**
   * Retry sending a failed message
   */
  const retryMessage = useCallback(
    async (tempId: string) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.tempId === tempId
            ? { ...m, deliveryStatus: 'sending', isError: false, errorMessage: undefined, isOptimistic: true }
            : m
        )
      );

      await outboxQueueService.retryMessage(tempId);
      return true;
    },
    []
  );

  /**
   * Jumps to a specific message in the group conversation.
   * If message is not present in local state, loads context from server.
   * Returns the 0-based index of the target message in the messages array.
   */
  const jumpToMessage = useCallback(
    async (targetId: string): Promise<number> => {
      if (!targetId || !groupId) return -1;

      // 1. Check if already in memory
      const index = messages.findIndex((m) => m.id === targetId || m.tempId === targetId);
      if (index >= 0) {
        return index;
      }

      // 2. Fetch context from server
      try {
        const context = await chatApi.getGroupMessageContext(groupId, targetId);
        if (context?.messages && context.messages.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMsgs: ExtendedChatMessage[] = context.messages
              .filter((m) => !existingIds.has(m.id))
              .map((m) => ({
                id: m.id,
                groupId: (m as any).groupId || groupId,
                senderId: m.senderId,
                content: m.content,
                createdAt: m.createdAt,
                updatedAt: m.updatedAt,
                sender: m.sender || null,
                attachments: m.attachments || [],
                reactions: m.reactions || [],
                replyToMessageId: m.replyToMessageId || null,
                replyTo: m.replyTo || null,
                deliveryStatus: 'sent' as MessageDeliveryStatus,
                isOptimistic: false,
                isError: false,
              }));
            return [...prev, ...newMsgs].sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
          });
          return context.targetIndex;
        }
      } catch (err) {
        console.warn('[useGroupChat] Failed to load message context:', err);
      }

      return -1;
    },
    [groupId, messages]
  );

  return {
    messages,
    isLoadingHistory,
    isLoadingOlder,
    hasMore,
    error,
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
  };
}

