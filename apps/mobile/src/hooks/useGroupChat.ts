import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  ChatMessageItem,
  NewChatMessageEvent,
  UserTypingEvent,
} from '@apnasamaj/shared-types';
import { chatApi } from '../api/chat.api';
import { connectChatSocket, getChatSocket } from '../services/socket.service';
import { useAuth } from './useAuth';

export interface ExtendedChatMessage extends ChatMessageItem {
  isOptimistic?: boolean;
  isError?: boolean;
  errorMessage?: string;
  tempId?: string;
}

export interface UseGroupChatOptions {
  groupId: string;
  isMember: boolean;
  isPrivate: boolean;
}

export function useGroupChat({ groupId, isMember, isPrivate }: UseGroupChatOptions) {
  const { user } = useAuth();

  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const isTypingActiveRef = useRef<boolean>(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPrivateAndNonMember = isPrivate && !isMember;

  /**
   * Load initial message history
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
      // Backend returns descending (newest first).
      setMessages(data.messages);
      setNextCursor(data.nextCursor || null);
      setHasMore(data.hasMore);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'चैट संदेश लोड करने में विफल।';
      setError(msg);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [groupId, isPrivateAndNonMember]);

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
      joinGroupRoom();
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleNewMessage = (payload: NewChatMessageEvent) => {
      if (!payload?.message || payload.message.groupId !== groupId) return;

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

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('new_message', handleNewMessage);
    socket.on('user_typing', handleUserTyping);

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
      }
      appStateSub.remove();

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [groupId, isPrivateAndNonMember, loadInitialHistory, joinGroupRoom, user?.id]);

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
   * Send a chat message with optimistic updates & socket/HTTP fallback
   */
  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const trimmed = content ? content.trim() : '';
      if (!trimmed || !groupId) return false;

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

      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const optimisticMsg: ExtendedChatMessage = {
        id: tempId,
        groupId,
        senderId: user?.id || '',
        content: trimmed,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sender: {
          id: user?.id || '',
          fullName: user?.fullName || 'You',
          avatarUrl: null,
        },
        isOptimistic: true,
        tempId,
      };

      // Insert at beginning of newest-first list
      setMessages((prev) => [optimisticMsg, ...prev]);

      const socket = getChatSocket();

      if (socket && socket.connected) {
        socket.emit(
          'send_message',
          { groupId, content: trimmed, tempId },
          (res: { success: boolean; message?: ChatMessageItem; error?: string }) => {
            if (res?.success && res.message) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.tempId === tempId ? { ...res.message!, isOptimistic: false } : m
                )
              );
            } else {
              const errorMsg = res?.error || 'Failed to send message.';
              setMessages((prev) =>
                prev.map((m) =>
                  m.tempId === tempId
                    ? { ...m, isOptimistic: false, isError: true, errorMessage: errorMsg }
                    : m
                )
              );
            }
          }
        );
      } else {
        // HTTP fallback
        try {
          const saved = await chatApi.sendGroupMessage(groupId, trimmed, tempId);
          setMessages((prev) =>
            prev.map((m) => (m.tempId === tempId ? { ...saved, isOptimistic: false } : m))
          );
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to send message.';
          setMessages((prev) =>
            prev.map((m) =>
              m.tempId === tempId
                ? { ...m, isOptimistic: false, isError: true, errorMessage: errorMsg }
                : m
            )
          );
        }
      }

      return true;
    },
    [groupId, isMember, user]
  );

  return {
    messages,
    isLoadingHistory,
    isLoadingOlder,
    hasMore,
    error,
    isConnected,
    typingUsers,
    loadInitialHistory,
    loadOlderMessages,
    sendMessage,
    reportTyping,
  };
}

