import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  DirectMessageItem,
  DirectNewMessageEvent,
  DirectUserTypingEvent,
  DirectMessageReadEvent,
} from '@apnasamaj/shared-types';
import { chatApi } from '../api/chat.api';
import { connectChatSocket, getChatSocket } from '../services/socket.service';
import { useAuth } from './useAuth';

export interface ExtendedDirectMessage extends DirectMessageItem {
  isOptimistic?: boolean;
  isError?: boolean;
  errorMessage?: string;
  tempId?: string;
}

export interface UseDirectChatOptions {
  conversationId: string;
}

export function useDirectChat({ conversationId }: UseDirectChatOptions) {
  const { user } = useAuth();

  const [messages, setMessages] = useState<ExtendedDirectMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isConnected, setIsConnected] = useState<boolean>(false);
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
   * Load initial message history
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
      // Backend returns descending (newest first)
      setMessages(data.messages);
      setNextCursor(data.nextCursor || null);
      setHasMore(data.hasMore);

      // Auto-mark conversation as read on initial open
      markAsRead();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'संदेश लोड करने में विफल।';
      setError(msg);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [conversationId, markAsRead]);

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
      joinDirectRoom();
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleNewMessage = (payload: DirectNewMessageEvent) => {
      if (!payload?.message || payload.message.conversationId !== conversationId) return;

      setMessages((prev) => {
        // If message was sent optimistically by this client, replace it
        if (payload.tempId) {
          const index = prev.findIndex((m) => m.tempId === payload.tempId);
          if (index !== -1) {
            const updated = [...prev];
            updated[index] = { ...payload.message, isOptimistic: false };
            return updated;
          }
        }

        // Prevent duplicate rendering
        if (prev.some((m) => m.id === payload.message.id)) {
          return prev;
        }

        // Add to beginning of descending list (newest first)
        return [payload.message, ...prev];
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
  }, [conversationId, loadInitialHistory, joinDirectRoom, markAsRead, user?.id]);

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
   * Send a message with optimistic UI and graceful fallback
   */
  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || !conversationId) return;

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
        sender: user
          ? {
            id: user.id,
            fullName: user.fullName || 'You',
            avatarUrl: (user as any)?.avatarUrl || null,
          }
          : null,
        isOptimistic: true,
        tempId,
      };

      // Add to UI immediately
      setMessages((prev) => [optimisticMsg, ...prev]);

      const socket = getChatSocket();

      // Try sending via Socket.IO first
      if (socket && socket.connected) {
        try {
          const sent = await new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => resolve(false), 5000);

            socket.emit(
              'direct:send_message',
              { conversationId, content: trimmed, tempId },
              (res: { success: boolean; message?: DirectMessageItem; error?: string }) => {
                clearTimeout(timeout);
                if (res?.success && res.message) {
                  const saved = res.message;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.tempId === tempId ? { ...saved, isOptimistic: false } : m
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
          // Socket send timed out or threw, proceed to HTTP fallback
        }
      }

      // HTTP fallback for guaranteed persistence
      try {
        const savedMessage = await chatApi.sendDirectMessage(conversationId, trimmed, tempId);

        setMessages((prev) =>
          prev.map((m) =>
            m.tempId === tempId ? { ...savedMessage, isOptimistic: false } : m
          )
        );
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error ? err.message : 'संदेश भेजने में विफल।';

        setMessages((prev) =>
          prev.map((m) =>
            m.tempId === tempId
              ? {
                ...m,
                isOptimistic: false,
                isError: true,
                errorMessage: errorMsg,
              }
              : m
          )
        );
      }
    },
    [conversationId, user, sendTypingStatus]
  );

  /**
   * Retry sending a failed message
   */
  const retryMessage = useCallback(
    async (tempId: string) => {
      const failedMsg = messages.find((m) => m.tempId === tempId && m.isError);
      if (!failedMsg) return;

      // Reset error state to optimistic
      setMessages((prev) =>
        prev.map((m) =>
          m.tempId === tempId ? { ...m, isError: false, errorMessage: undefined, isOptimistic: true } : m
        )
      );

      try {
        const savedMessage = await chatApi.sendDirectMessage(
          conversationId,
          failedMsg.content,
          tempId
        );

        setMessages((prev) =>
          prev.map((m) =>
            m.tempId === tempId ? { ...savedMessage, isOptimistic: false } : m
          )
        );
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error ? err.message : 'संदेश भेजने में पुनः विफल।';

        setMessages((prev) =>
          prev.map((m) =>
            m.tempId === tempId
              ? {
                ...m,
                isOptimistic: false,
                isError: true,
                errorMessage: errorMsg,
              }
              : m
          )
        );
      }
    },
    [conversationId, messages]
  );

  return {
    messages,
    isLoadingHistory,
    isLoadingOlder,
    hasMore,
    error,
    isConnected,
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
