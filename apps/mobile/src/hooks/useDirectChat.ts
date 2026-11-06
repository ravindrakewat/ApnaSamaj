import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  DirectMessageItem,
  DirectNewMessageEvent,
  DirectUserTypingEvent,
  DirectMessageReadEvent,
  ChatAttachmentInput,
  MessageDeliveryStatus,
} from '@apnasamaj/shared-types';
import { chatApi } from '../api/chat.api';
import { connectChatSocket, getChatSocket } from '../services/socket.service';
import { chatPersistenceService, outboxQueueService } from '../services';
import { useAuth } from './useAuth';

export interface ExtendedDirectMessage extends DirectMessageItem {
  isOptimistic?: boolean;
  isError?: boolean;
  errorMessage?: string;
  tempId?: string;
  deliveryStatus?: MessageDeliveryStatus;
}

export interface UseDirectChatOptions {
  conversationId: string;
}

export function useDirectChat({ conversationId }: UseDirectChatOptions) {
  const { user, communitySlug } = useAuth();

  const [messages, setMessages] = useState<ExtendedDirectMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState<boolean>(false);
  const [otherUserTypingName, setOtherUserTypingName] = useState<string>('');
  const [otherUserLastReadAt, setOtherUserLastReadAt] = useState<string | null>(null);

  const isTypingActiveRef = useRef<boolean>(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Mark conversation as read via API and Socket
   */
  const markAsRead = useCallback(async () => {
    if (!conversationId) return;

    try {
      const res = await chatApi.markDirectConversationAsRead(conversationId);
      const socket = getChatSocket();
      if (socket && socket.connected) {
        socket.emit('direct:message_read', { conversationId });
      }
      return res;
    } catch (err: unknown) {
      console.warn('[useDirectChat] Failed to mark as read:', err);
    }
  }, [conversationId]);

  /**
   * Hydrate initial messages from L1/L2 local cache & subscribe to Outbox updates
   */
  useEffect(() => {
    if (!conversationId || !communitySlug) return;

    if (user?.id) {
      outboxQueueService.initialize(communitySlug, user.id);
    }

    chatPersistenceService
      .getConversationMessages(conversationId, communitySlug, user?.id || '')
      .then((cached) => {
        if (cached && cached.length > 0) {
          setMessages((prev) => {
            if (prev.length > 0) return prev;
            return cached.map((c) => ({
              id: c.serverMessageId || c.tempId || c.localId,
              conversationId: c.conversationId,
              senderId: c.senderId,
              content: c.content,
              createdAt: c.createdAt,
              updatedAt: c.updatedAt,
              deliveryStatus: c.deliveryStatus,
              isOptimistic: c.deliveryStatus === 'pending' || c.deliveryStatus === 'sending',
              isError: c.deliveryStatus === 'failed',
              errorMessage: c.lastError || undefined,
              tempId: c.tempId,
              attachments: c.attachment
                ? [
                    {
                      id: c.attachment.id || `att-${c.tempId}`,
                      directMessageId: c.serverMessageId || c.tempId,
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
      if (event.conversationId !== conversationId) return;

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
  }, [conversationId, communitySlug, user?.id]);

  /**
   * Load initial message history from server with offline resilience
   */
  const loadInitialHistory = useCallback(async () => {
    if (!conversationId) {
      setIsLoadingHistory(false);
      return;
    }

    setIsLoadingHistory(true);
    setError(null);

    try {
      const data = await chatApi.getDirectMessages(conversationId, { limit: 30 });
      setIsOffline(false);
      outboxQueueService.setOnlineStatus(true);

      // Persist server messages in local cache
      if (communitySlug && user?.id) {
        chatPersistenceService.saveReceivedMessages(
          conversationId,
          'DIRECT',
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

        const mappedServer: ExtendedDirectMessage[] = data.messages.map((m) => ({
          ...m,
          deliveryStatus: 'sent',
          isOptimistic: false,
          isError: false,
        }));

        return [...filteredPending, ...mappedServer];
      });

      setNextCursor(data.nextCursor || null);
      setHasMore(data.hasMore);

      // Auto-mark conversation as read on initial open
      markAsRead();
    } catch (err: unknown) {
      setIsOffline(true);
      outboxQueueService.setOnlineStatus(false);
      const msg = err instanceof Error ? err.message : 'संदेश लोड करने में विफल।';
      setError(msg);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [conversationId, communitySlug, user?.id, markAsRead]);

  /**
   * Load older messages via cursor pagination
   */
  const loadOlderMessages = useCallback(async () => {
    if (!nextCursor || isLoadingOlder || !hasMore || !conversationId) return;

    setIsLoadingOlder(true);
    try {
      const data = await chatApi.getDirectMessages(conversationId, {
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
      console.warn('[useDirectChat] Failed to load older messages:', err);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [conversationId, nextCursor, isLoadingOlder, hasMore]);

  /**
   * Join direct conversation room on socket
   */
  const joinDirectRoom = useCallback(() => {
    if (!conversationId) return;
    const socket = getChatSocket();
    if (socket && socket.connected) {
      socket.emit(
        'direct:join',
        { conversationId },
        (res: { success: boolean; error?: string }) => {
          if (!res?.success) {
            console.warn('[useDirectChat] Failed to join conversation room:', res?.error);
          }
        }
      );
    }
  }, [conversationId]);

  /**
   * Socket Lifecycle & Event Management
   */
  useEffect(() => {
    if (!conversationId) return;

    loadInitialHistory();

    const socket = connectChatSocket();

    const handleConnect = () => {
      setIsConnected(true);
      setIsOffline(false);
      outboxQueueService.setOnlineStatus(true);
      joinDirectRoom();
      outboxQueueService.processQueue();
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setIsOffline(true);
      outboxQueueService.setOnlineStatus(false);
    };

    const handleNewMessage = (payload: DirectNewMessageEvent) => {
      if (!payload?.message || payload.message.conversationId !== conversationId) return;

      if (communitySlug && user?.id) {
        chatPersistenceService.saveReceivedMessages(
          conversationId,
          'DIRECT',
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

      // If message is from other user, automatically mark conversation read
      if (payload.message.senderId !== user?.id) {
        markAsRead();
      }
    };

    const handleUserTyping = (payload: DirectUserTypingEvent) => {
      if (payload.conversationId !== conversationId || payload.userId === user?.id) return;

      setIsOtherUserTyping(payload.isTyping);
      setOtherUserTypingName(payload.userName || '');
    };

    const handleMessageRead = (payload: DirectMessageReadEvent) => {
      if (payload.conversationId !== conversationId || payload.userId === user?.id) return;

      setOtherUserLastReadAt(payload.readAt);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('direct:new_message', handleNewMessage);
    socket.on('direct:user_typing', handleUserTyping);
    socket.on('direct:message_read', handleMessageRead);

    if (socket.connected) {
      handleConnect();
    }

    // AppState lifecycle listener (reconnect socket and re-join room on foreground)
    const handleAppStateChange = (nextStatus: AppStateStatus) => {
      if (nextStatus === 'active') {
        const s = connectChatSocket();
        if (s.connected) {
          joinDirectRoom();
        }
        outboxQueueService.processQueue();
      }
    };

    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      if (socket) {
        socket.emit('direct:leave', { conversationId });
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        socket.off('direct:new_message', handleNewMessage);
        socket.off('direct:user_typing', handleUserTyping);
        socket.off('direct:message_read', handleMessageRead);
      }
      appStateSub.remove();

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [conversationId, loadInitialHistory, joinDirectRoom, markAsRead, user?.id, communitySlug]);

  /**
   * Notify server of typing status (debounced)
   */
  const sendTypingStatus = useCallback(
    (isTyping: boolean) => {
      if (!conversationId) return;
      const socket = getChatSocket();

      if (isTyping) {
        if (!isTypingActiveRef.current) {
          isTypingActiveRef.current = true;
          if (socket && socket.connected) {
            socket.emit('direct:user_typing', { conversationId, isTyping: true });
          }
        }

        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
          isTypingActiveRef.current = false;
          if (socket && socket.connected) {
            socket.emit('direct:user_typing', { conversationId, isTyping: false });
          }
        }, 3000);
      } else {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        if (isTypingActiveRef.current) {
          isTypingActiveRef.current = false;
          if (socket && socket.connected) {
            socket.emit('direct:user_typing', { conversationId, isTyping: false });
          }
        }
      }
    },
    [conversationId]
  );

  /**
   * Send a message with outbox queue persistence, optimistic UI and socket/HTTP fallback
   */
  const sendMessage = useCallback(
    async (content?: string, attachment?: ChatAttachmentInput) => {
      const trimmed = content ? content.trim() : '';
      if ((!trimmed && !attachment) || !conversationId) return;

      // Stop typing status immediately
      sendTypingStatus(false);

      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const nowIso = new Date().toISOString();

      const optimisticMsg: ExtendedDirectMessage = {
        id: tempId,
        conversationId,
        senderId: user?.id || '',
        content: trimmed,
        createdAt: nowIso,
        updatedAt: nowIso,
        deliveryStatus: isConnected ? 'sending' : 'pending',
        sender: user
          ? {
              id: user.id,
              fullName: user.fullName || 'You',
              avatarUrl: (user as any)?.avatarUrl || null,
            }
          : null,
        attachments: attachment
          ? [
              {
                id: attachment.id || `temp-att-${Date.now()}`,
                directMessageId: tempId,
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

      // 1. Add to UI immediately
      setMessages((prev) => [optimisticMsg, ...prev]);

      // 2. Queue in outbox persistence
      if (communitySlug && user?.id) {
        await outboxQueueService.enqueue({
          tempId,
          conversationId,
          conversationType: 'DIRECT',
          content: trimmed,
          attachment: attachment || null,
          tenantSlug: communitySlug,
          userId: user.id,
        });
      }

      const socket = getChatSocket();

      // 3. Try sending via Socket.IO if connected
      if (socket && socket.connected) {
        try {
          const sent = await new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => resolve(false), 5000);

            socket.emit(
              'direct:send_message',
              { conversationId, content: trimmed, attachment, tempId },
              async (res: { success: boolean; message?: DirectMessageItem; error?: string }) => {
                clearTimeout(timeout);
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
                  resolve(true);
                } else {
                  resolve(false);
                }
              }
            );
          });

          if (sent) return;
        } catch {
          // Socket send timed out or threw, outbox queue handles fallback
        }
      }
    },
    [conversationId, user, communitySlug, isConnected, sendTypingStatus]
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
    },
    []
  );

  return {
    messages,
    isLoadingHistory,
    isLoadingOlder,
    hasMore,
    error,
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
    markAsRead,
  };
}
